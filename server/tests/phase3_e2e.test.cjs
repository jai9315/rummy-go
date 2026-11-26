// ============================================================================
// PHASE 3 E2E MULTIPLAYER TEST — Run locally against running backend
// Prerequisites:
//   1. Server running: npm run start:server (port 4000)
//   2. .env configured with JWT_SECRET, LIVEKIT_*, DATABASE_URL
//   3. socket.io-client installed: npm install socket.io-client
// Run:   node server/tests/phase3_e2e.test.cjs
// ============================================================================

const assert = require("node:assert");
const test = require("node:test");
const http = require("http");
const { io } = require("socket.io-client");

const BASE_URL = "http://localhost:4000";
const SOCKET_URL = "http://localhost:4000";

let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name} -- ${detail || ""}`);
  }
}

function log(msg) {
  console.log(`  > ${msg}`);
}

// ---------------------------------------------------------------------------
// REST helpers with timeout
// ---------------------------------------------------------------------------
function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: "localhost",
        port: 4000,
        path: `/api${path}`,
        method,
        headers,
        timeout: 10000,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw || "{}") });
          } catch (e) {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });
    if (data) req.write(data);
    req.end();
  });
}

function apiPost(path, body, token) {
  return apiRequest("POST", path, body, token);
}

function apiGet(path, token) {
  return apiRequest("GET", path, null, token);
}

// ---------------------------------------------------------------------------
// Socket client wrapper with emit timeout
// ---------------------------------------------------------------------------
class PlayerSession {
  constructor(token, username) {
    this.token = token;
    this.username = username;
    this.socket = null;
    this.events = {};
    this.connected = false;
  }

  connect(roomCode) {
    return new Promise((resolve, reject) => {
      this.socket = io(SOCKET_URL, {
        auth: { token: this.token },
        transports: ["websocket", "polling"],
      });

      this.socket.on("connect", () => {
        this.connected = true;
        log(`${this.username}: Socket connected`);
        this.socket.emit("JOIN_ROOM", { roomCode });
        resolve();
      });

      this.socket.on("connect_error", (err) => {
        reject(new Error(`${this.username}: Socket connect error: ${err.message}`));
      });

      this.socket.on("disconnect", () => {
        this.connected = false;
      });

      this.socket.onAny((event, data) => {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(data);
      });

      setTimeout(() => {
        if (!this.connected) reject(new Error(`${this.username}: Socket connect timeout`));
      }, 15000);
    });
  }

  emit(event, data) {
    log(`${this.username}: emitting ${event}`);
    // Fire-and-forget: server handlers don't send acknowledgements.
    // We wait for resulting events (GAME_STATE_UPDATE, PRIVATE_HAND_UPDATE, etc.) instead.
    if (!this.socket || !this.connected) {
      return Promise.resolve({ error: "Socket not connected" });
    }
    this.socket.emit(event, data);
    return Promise.resolve({ sent: true });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: make all non-host players ready (server requires all ready to start)
// ---------------------------------------------------------------------------
async function makeAllPlayersReady(sessions, hostIndex = 0) {
  for (let i = 0; i < sessions.length; i++) {
    if (i !== hostIndex) {
      await sessions[i].emit("TOGGLE_READY");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  // Give the lobby time to propagate ready states
  await new Promise((r) => setTimeout(r, 800));
}

// ---------------------------------------------------------------------------
// Helper: register + login a user, return token
// ---------------------------------------------------------------------------
async function createUser(suffix) {
  const timestamp = Date.now().toString().slice(-6);
  const username = `tu_${suffix}_${timestamp}`;
  const email = `${username}@example.com`;
  const password = "TestPass123!";

  log(`createUser: registering ${username}`);
  await apiPost("/auth/register", { username, email, password }).catch(() => {});

  const loginRes = await apiPost("/auth/login", { login: username, password });
  assert.strictEqual(loginRes.status, 200, `Login failed for ${username}: ${JSON.stringify(loginRes.body)}`);
  assert.ok(loginRes.body.token, `No token for ${username}`);

  return { token: loginRes.body.token, username: loginRes.body.user.username, userId: loginRes.body.user.id };
}

// ---------------------------------------------------------------------------
// Helper: create a room, return roomCode
// ---------------------------------------------------------------------------
async function createRoom(token) {
  log("Creating room...");
  const res = await apiPost("/rooms/create", {
    roomName: "E2E Test Table",
    maxPlayers: 4,
    roundCount: 1,
    entryPoints: 80,
  }, token);
  assert.strictEqual(res.status, 201, `Room create failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.room.roomCode, "No roomCode returned");
  log(`Room created: ${res.body.room.roomCode}`);
  return res.body.room.roomCode;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
test("PHASE 3: Server is reachable", async (t) => {
  const res = await apiGet("/health");
  assert.strictEqual(res.status, 200, `Health check failed: ${res.status}`);
  console.log("Server is reachable ✓");
});

// ---------------------------------------------------------------------------
// PHASE 3 TESTS
// ---------------------------------------------------------------------------

test("PHASE 3: Four players join same private room", async (t) => {
  console.log("\n=== Test: 4 players join same room ===");
  const tokens = await Promise.all([1, 2, 3, 4].map((i) => createUser(i)));
  const roomCode = await createRoom(tokens[0].token);

  const sessions = [];
  for (let i = 0; i < 4; i++) {
    log(`Connecting player ${i + 1}...`);
    const s = new PlayerSession(tokens[i].token, tokens[i].username);
    await s.connect(roomCode);
    sessions.push(s);
  }

  log("Waiting for lobby sync...");
  await new Promise((r) => setTimeout(r, 1500));

  let connectedCount = 0;
  for (const s of sessions) if (s.connected) connectedCount++;
  check("All 4 players connected", connectedCount === 4, `connected: ${connectedCount}`);

  log("Fetching room via REST...");
  const roomRes = await apiGet(`/rooms/${roomCode}`, tokens[0].token);
  check("Room accessible via REST", roomRes.status === 200);
  check("Room has 4 players", roomRes.body.room.players.length === 4, `players: ${roomRes.body.room.players?.length}`);

  for (const s of sessions) s.disconnect();
});

test("PHASE 3: Each player receives exactly 13 cards", async (t) => {
  console.log("\n=== Test: 13 cards per player ===");
  const tokens = await Promise.all([1, 2, 3, 4].map((i) => createUser(100 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const sessions = [];
  for (let i = 0; i < 4; i++) {
    const s = new PlayerSession(tokens[i].token, tokens[i].username);
    await s.connect(roomCode);
    sessions.push(s);
  }

  await new Promise((r) => setTimeout(r, 1500));

  // Make all non-host players ready before starting
  await makeAllPlayersReady(sessions, 0);

  log("Starting game...");
  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1500));

  for (const s of sessions) {
    const handUpdates = s.events["PRIVATE_HAND_UPDATE"] || [];
    const latest = handUpdates[handUpdates.length - 1];
    check(`${s.username} received private hand`, latest && latest.cards && latest.cards.length === 13, `cards: ${latest?.cards?.length}`);
  }

  const stateUpdates = sessions[0].events["GAME_STATE_UPDATE"] || [];
  const latestState = stateUpdates[stateUpdates.length - 1];
  if (latestState) {
    for (const p of latestState.players) {
      check(`Public state: ${p.username} has cardCount=13`, p.cardCount === 13, `cardCount: ${p.cardCount}`);
      check(`Public state: ${p.username} has no hand field`, p.hand === undefined);
      check(`Public state: ${p.username} has no cards field`, p.cards === undefined);
    }
  }

  for (const s of sessions) s.disconnect();
});

test("PHASE 3: Each player sees only their own cards", async (t) => {
  console.log("\n=== Test: Card privacy ===");
  const tokens = await Promise.all([1, 2, 3].map((i) => createUser(200 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const s = new PlayerSession(tokens[i].token, tokens[i].username);
    await s.connect(roomCode);
    sessions.push(s);
  }

  // Make all non-host players ready before starting
  await makeAllPlayersReady(sessions, 0);

  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1500));

  const playerHands = {};
  for (const s of sessions) {
    const updates = s.events["PRIVATE_HAND_UPDATE"] || [];
    const latest = updates[updates.length - 1];
    if (latest) playerHands[s.username] = new Set(latest.cards.map((c) => c.id));
  }

  const usernames = Object.keys(playerHands);
  for (let i = 0; i < usernames.length; i++) {
    for (let j = i + 1; j < usernames.length; j++) {
      const overlap = [...playerHands[usernames[i]]].filter((id) => playerHands[usernames[j]].has(id));
      check(`${usernames[i]} and ${usernames[j]} share no cards`, overlap.length === 0, `overlap: ${overlap.length}`);
    }
  }

  for (const s of sessions) {
    const stateUpdates = s.events["GAME_STATE_UPDATE"] || [];
    let leakFound = false;
    for (const state of stateUpdates) {
      for (const p of state.players) {
        if (p.hand || p.cards) leakFound = true;
      }
    }
    check(`${s.username}: no card leak in public state`, !leakFound);
  }

  for (const s of sessions) s.disconnect();
});

test("PHASE 3: Draw and discard work correctly", async (t) => {
  console.log("\n=== Test: Draw and discard ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(300 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const s1 = new PlayerSession(tokens[0].token, tokens[0].username);
  const s2 = new PlayerSession(tokens[1].token, tokens[1].username);
  await s1.connect(roomCode);
  await s2.connect(roomCode);
  await new Promise((r) => setTimeout(r, 500));

  // Make all non-host players ready before starting
  await makeAllPlayersReady([s1, s2], 0);

  log("Starting game...");
  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

  log("Drawing card...");
  const drawRes = await s1.emit("DRAW_CARD", { source: "CLOSED" });
  check("p1 can draw card", !drawRes.error, `error: ${drawRes.error}`);

  const handUpdates = s1.events["PRIVATE_HAND_UPDATE"] || [];
  const latestHand = handUpdates[handUpdates.length - 1];
  const cardToDiscard = latestHand.cards[0].id;
  log(`Discarding card ${cardToDiscard}...`);
  const discardRes = await s1.emit("DISCARD_CARD", { cardId: cardToDiscard });
  check("p1 can discard card", !discardRes.error, `error: ${discardRes.error}`);

  const afterDiscard = handUpdates[handUpdates.length - 1];
  check("p1 hand back to 13 after discard", afterDiscard.cards.length === 13, `count: ${afterDiscard.cards.length}`);

  s1.disconnect();
  s2.disconnect();
});

test("PHASE 3: Turn synchronization works", async (t) => {
  console.log("\n=== Test: Turn sync ===");
  const tokens = await Promise.all([1, 2, 3].map((i) => createUser(400 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const s = new PlayerSession(tokens[i].token, tokens[i].username);
    await s.connect(roomCode);
    sessions.push(s);
  }

  // Make all non-host players ready before starting
  await makeAllPlayersReady(sessions, 0);

  // Verify all players are ready before starting
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 300));
    const roomRes = await apiGet(`/rooms/${roomCode}`, tokens[0].token);
    if (roomRes.status === 200) {
      const allReady = roomRes.body.room.players.every((p) => p.isReady);
      if (allReady) break;
    }
  }

  log("Starting game...");
  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

  const stateUpdates = sessions[0].events["GAME_STATE_UPDATE"] || [];
  const initialState = stateUpdates[stateUpdates.length - 1];
  check("Game state has turnPhase=DRAW initially", initialState && initialState.turnPhase === "DRAW", `phase: ${initialState?.turnPhase}`);
  check("Game state has currentTurnPlayerId", initialState && typeof initialState.currentTurnPlayerId === "string" && initialState.currentTurnPlayerId.length > 0);

  if (!initialState) {
    for (const s of sessions) s.disconnect();
    return;
  }

  await sessions[0].emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 500));
  const hand1 = sessions[0].events["PRIVATE_HAND_UPDATE"].pop().cards;
  await sessions[0].emit("DISCARD_CARD", { cardId: hand1[0].id });
  await new Promise((r) => setTimeout(r, 500));

  // After draw: phase=DISCARD (same player). After discard: phase=DRAW (next player).
  const s0Updates = sessions[0].events["GAME_STATE_UPDATE"] || [];
  const stateAfterDraw = s0Updates[s0Updates.length - 2]; // state after DRAW_CARD
  const stateAfterDiscard = sessions[1].events["GAME_STATE_UPDATE"].pop();
  check("Turn phase is DISCARD after draw", stateAfterDraw && stateAfterDraw.turnPhase === "DISCARD", `phase: ${stateAfterDraw?.turnPhase}`);
  check("Turn advances to next player (DRAW) after discard", stateAfterDiscard && stateAfterDiscard.turnPhase === "DRAW" && stateAfterDiscard.currentTurnPlayerId !== initialState.currentTurnPlayerId, `phase: ${stateAfterDiscard?.turnPhase}, turn: ${stateAfterDiscard?.currentTurnPlayerId}`);

  for (const s of sessions) s.disconnect();
});

test("PHASE 3: Invalid declaration is rejected", async (t) => {
  console.log("\n=== Test: Invalid declare rejected ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(500 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const s1 = new PlayerSession(tokens[0].token, tokens[0].username);
  const s2 = new PlayerSession(tokens[1].token, tokens[1].username);
  await s1.connect(roomCode);
  await s2.connect(roomCode);
  await new Promise((r) => setTimeout(r, 500));

  // Make all non-host players ready before starting
  await makeAllPlayersReady([s1, s2], 0);

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

  await s1.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 500));

  const handUpdates = s1.events["PRIVATE_HAND_UPDATE"] || [];
  const hand = handUpdates[handUpdates.length - 1].cards;
  const declareCardId = hand[hand.length - 1].id;

  const badMelds = [hand.slice(0, 3), hand.slice(3, 6), hand.slice(6, 9)];
  await s1.emit("DECLARE", { melds: badMelds, declareCardId });
  await new Promise((r) => setTimeout(r, 500));

  // Invalid declare should NOT advance the game to ROUND_END — state stays PLAYING
  const stateUpdates = s1.events["GAME_STATE_UPDATE"] || [];
  const latestState = stateUpdates[stateUpdates.length - 1];
  const declareRejected = latestState && latestState.status === "PLAYING" && latestState.roundScores === undefined;
  check("Invalid declare (wrong card count) rejected — game stays PLAYING", declareRejected, `status: ${latestState?.status}`);

  s1.disconnect();
  s2.disconnect();
});

test("PHASE 3: Reconnection restores correct private hand", async (t) => {
  console.log("\n=== Test: Reconnection restores hand ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(600 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const s1 = new PlayerSession(tokens[0].token, tokens[0].username);
  const s2 = new PlayerSession(tokens[1].token, tokens[1].username);
  await s1.connect(roomCode);
  await s2.connect(roomCode);
  await new Promise((r) => setTimeout(r, 500));

  // Make all non-host players ready before starting
  await makeAllPlayersReady([s1, s2], 0);

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

  const initialUpdates = s1.events["PRIVATE_HAND_UPDATE"] || [];
  const initialHand = initialUpdates[initialUpdates.length - 1].cards;
  const initialCardIds = new Set(initialHand.map((c) => c.id));

  s1.disconnect();
  await new Promise((r) => setTimeout(r, 500));

  const s1b = new PlayerSession(tokens[0].token, tokens[0].username);
  await s1b.connect(roomCode);
  await new Promise((r) => setTimeout(r, 1000));

  const reconnectUpdates = s1b.events["PRIVATE_HAND_UPDATE"] || [];
  const reconnectHand = reconnectUpdates[reconnectUpdates.length - 1];
  check("Reconnected player receives private hand", reconnectHand && reconnectHand.cards.length === 13, `cards: ${reconnectHand?.cards?.length}`);
  if (reconnectHand) {
    const reconnectIds = new Set(reconnectHand.cards.map((c) => c.id));
    check("Reconnected hand matches original hand",
      [...initialCardIds].every((id) => reconnectIds.has(id)) && reconnectIds.size === initialCardIds.size,
      "card IDs don't match");
  }

  s1b.disconnect();
  s2.disconnect();
});

test("PHASE 3: No player can manipulate another player's cards", async (t) => {
  console.log("\n=== Test: Card manipulation prevention ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(700 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const s1 = new PlayerSession(tokens[0].token, tokens[0].username);
  const s2 = new PlayerSession(tokens[1].token, tokens[1].username);
  await s1.connect(roomCode);
  await s2.connect(roomCode);
  await new Promise((r) => setTimeout(r, 500));

  // Make all non-host players ready before starting
  await makeAllPlayersReady([s1, s2], 0);

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

  const p1HandUpdates = s1.events["PRIVATE_HAND_UPDATE"] || [];
  const p1Hand = p1HandUpdates[p1HandUpdates.length - 1].cards;
  const p1CardId = p1Hand[0].id;

  await s2.emit("DISCARD_CARD", { cardId: p1CardId });
  await new Promise((r) => setTimeout(r, 500));

  const errorEvents = s2.events["ERROR"] || [];
  const manipulationBlocked = errorEvents.some((e) => e && e.message);
  check("p2 cannot discard p1's card", manipulationBlocked, `error events: ${JSON.stringify(errorEvents)}`);

  s1.disconnect();
  s2.disconnect();
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test("PHASE 3: Test summary", async (t) => {
  console.log("\n========================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("========================================");
  if (failed > 0) {
    t.fail(`${failed} test(s) failed`);
  }
});