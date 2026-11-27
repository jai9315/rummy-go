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

function apiPatch(path, body, token) {
  return apiRequest("PATCH", path, body, token);
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

  connect(roomCode, password) {
    return new Promise((resolve, reject) => {
      this.socket = io(SOCKET_URL, {
        auth: { token: this.token },
        transports: ["websocket", "polling"],
      });

      this.socket.on("connect", () => {
        this.connected = true;
        log(`${this.username}: Socket connected`);
        if (roomCode) {
          const payload = password !== undefined ? { roomCode, password } : { roomCode };
          this.socket.emit("JOIN_ROOM", payload);
        }
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
// Helper: resolve the session + token whose turn it currently is (post-TOSS)
// ---------------------------------------------------------------------------
function getTurnOrder(sessions, tokens) {
  const latestState = (sessions[0].events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  const ordered = [];
  if (latestState && Array.isArray(latestState.players)) {
    const sortedPlayers = [...latestState.players].sort((a, b) => a.seatNumber - b.seatNumber);
    for (const p of sortedPlayers) {
      const idx = tokens.findIndex((t) => t.userId === p.id);
      if (idx !== -1) ordered.push({ session: sessions[idx], token: tokens[idx], index: idx });
    }
  }
  if (ordered.length === sessions.length) return ordered;
  return sessions.map((s, idx) => ({ session: s, token: tokens[idx], index: idx }));
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
async function createRoom(token, overrides = {}) {
  log("Creating room...");
  const res = await apiPost("/rooms/create", {
    roomName: "E2E Test Table",
    maxPlayers: 4,
    roundCount: 1,
    entryPoints: 80,
    ...overrides,
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

  // Wait for all JOIN_ROOMs to be fully processed before toggling ready
  await new Promise((r) => setTimeout(r, 1000));

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

  const [firstPlayer] = getTurnOrder([s1, s2], tokens);
  log(`Drawing card as toss winner ${firstPlayer.token.username}...`);
  const drawRes = await firstPlayer.session.emit("DRAW_CARD", { source: "CLOSED" });
  check("first-turn player can draw card", !drawRes.error, `error: ${drawRes.error}`);
  await new Promise((r) => setTimeout(r, 400));

  const handUpdates = firstPlayer.session.events["PRIVATE_HAND_UPDATE"] || [];
  const latestHand = handUpdates[handUpdates.length - 1];
  const cardToDiscard = latestHand.cards[0].id;
  log(`Discarding card ${cardToDiscard}...`);
  const discardRes = await firstPlayer.session.emit("DISCARD_CARD", { cardId: cardToDiscard });
  check("first-turn player can discard card", !discardRes.error, `error: ${discardRes.error}`);
  await new Promise((r) => setTimeout(r, 400));

  const afterDiscard = handUpdates[handUpdates.length - 1];
  check("first-turn player hand back to 13 after discard", afterDiscard.cards.length === 13, `count: ${afterDiscard.cards.length}`);

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

  // Wait for all JOIN_ROOMs to be fully processed before toggling ready
  await new Promise((r) => setTimeout(r, 1000));

  // Make all non-host players ready before starting
  // (TOGGLE_READY updates in-memory lobby state; REST reads from DB and won't reflect it)
  await makeAllPlayersReady(sessions, 0);

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

  const ordered = getTurnOrder(sessions, tokens);
  const active = ordered[0].session;
  const next = ordered[1].session;

  await active.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 500));
  const hand1 = active.events["PRIVATE_HAND_UPDATE"].pop().cards;
  await active.emit("DISCARD_CARD", { cardId: hand1[0].id });
  await new Promise((r) => setTimeout(r, 500));

  // After draw: phase=DISCARD (same player). After discard: phase=DRAW (next player).
  const activeUpdates = active.events["GAME_STATE_UPDATE"] || [];
  const stateAfterDraw = activeUpdates[activeUpdates.length - 2]; // state after DRAW_CARD
  const stateAfterDiscard = next.events["GAME_STATE_UPDATE"].pop();
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

  const [activeP] = getTurnOrder([s1, s2], tokens);
  await activeP.session.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 500));

  const handUpdates = activeP.session.events["PRIVATE_HAND_UPDATE"] || [];
  const hand = handUpdates[handUpdates.length - 1].cards;
  const declareCardId = hand[hand.length - 1].id;

  const badMelds = [hand.slice(0, 3), hand.slice(3, 6), hand.slice(6, 9)];
  await activeP.session.emit("DECLARE", { melds: badMelds, declareCardId });
  await new Promise((r) => setTimeout(r, 500));

  // Invalid declare should NOT advance the game to ROUND_END — state stays PLAYING
  const stateUpdates = activeP.session.events["GAME_STATE_UPDATE"] || [];
  const latestState = stateUpdates[stateUpdates.length - 1];
  const declareRejected = latestState && latestState.status === "PLAYING";
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

test("PHASE 3: 3-player invalid declaration emits ERROR to declarer and broadcasts GAME_STATE_UPDATE to all players", async () => {
  console.log("\n=== Test: 3-player invalid declaration sync ===");
  const tokens = await Promise.all([1, 2, 3].map((i) => createUser(800 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const s = new PlayerSession(tokens[i].token, tokens[i].username);
    await s.connect(roomCode);
    sessions.push(s);
  }
  await new Promise((r) => setTimeout(r, 800));
  await makeAllPlayersReady(sessions, 0);

  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

  const [firstP] = getTurnOrder(sessions, tokens);
  await firstP.session.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 500));

  const hand = firstP.session.events["PRIVATE_HAND_UPDATE"].slice(-1)[0].cards;
  const declareCardId = hand[hand.length - 1].id;
  // 13 valid server card IDs in one giant invalid meld -> fails Evaluator (drops declarer, advances turn)
  const invalidMelds = [hand.slice(0, 13)];

  // Record counts before DECLARE
  const preStateCounts = sessions.map((s) => (s.events["GAME_STATE_UPDATE"] || []).length);
  const preErrorCount = (firstP.session.events["ERROR"] || []).length;

  await firstP.session.emit("DECLARE", { melds: invalidMelds, declareCardId });
  await new Promise((r) => setTimeout(r, 700));

  const declarerErrors = (firstP.session.events["ERROR"] || []).slice(preErrorCount);
  check(
    "3-player invalid declare emits ERROR to declarer",
    declarerErrors.length >= 1 && typeof declarerErrors[0].message === "string",
    `errors: ${JSON.stringify(declarerErrors)}`
  );

  for (let i = 0; i < 3; i++) {
    const updates = (sessions[i].events["GAME_STATE_UPDATE"] || []).slice(preStateCounts[i]);
    const latest = updates[updates.length - 1];
    check(
      `Player ${i + 1} received GAME_STATE_UPDATE after 3p invalid declare`,
      Boolean(latest),
      `newUpdates: ${updates.length}`
    );
    if (latest) {
      check(
        `Player ${i + 1} sees turn advanced away from dropped declarer`,
        latest.status === "PLAYING" &&
          latest.currentTurnPlayerId !== firstP.token.userId &&
          latest.players.find((p) => p.id === firstP.token.userId)?.hasDropped === true,
        `status=${latest.status}, turn=${latest.currentTurnPlayerId}`
      );
    }
  }

  for (const s of sessions) s.disconnect();
});

test("PHASE 3: 3-player DROP round end populates winnerId, per-player first drop, all roundScores, and persists GameResult", async () => {
  console.log("\n=== Test: 3-player drop round end & persistence ===");
  const tokens = await Promise.all([1, 2, 3].map((i) => createUser(900 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const s = new PlayerSession(tokens[i].token, tokens[i].username);
    await s.connect(roomCode);
    sessions.push(s);
  }
  await new Promise((r) => setTimeout(r, 800));
  await makeAllPlayersReady(sessions, 0);

  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

  const [firstP, secondP, thirdP] = getTurnOrder(sessions, tokens);

  // First seat drops (First Drop: 20 pts)
  await firstP.session.emit("DROP");
  await new Promise((r) => setTimeout(r, 500));

  // Second seat drops on their own first turn (per-player First Drop: 20 pts) -> Third seat wins!
  await secondP.session.emit("DROP");
  await new Promise((r) => setTimeout(r, 800));

  const latestState = (thirdP.session.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  check("Single-round drop ends with status GAME_OVER", latestState?.status === "GAME_OVER", `status=${latestState?.status}`);
  check("winnerId populated as remaining player", latestState?.winnerId === thirdP.token.userId, `winnerId=${latestState?.winnerId}`);
  check("All 3 players appear in roundScores", latestState?.roundScores && Object.keys(latestState.roundScores).length === 3, `keys=${Object.keys(latestState?.roundScores || {})}`);
  check("first seat drop is 20 pts", latestState?.roundScores?.[firstP.token.userId]?.points === 20);
  check("second seat per-player first drop is 20 pts", latestState?.roundScores?.[secondP.token.userId]?.points === 20);
  check("winner score is 0 pts", latestState?.roundScores?.[thirdP.token.userId]?.points === 0);

  // Verify DROP-ended round persisted GameResult in DB via /api/friends/history
  const historyRes = await apiGet("/friends/history", thirdP.token.token);
  const matchingResult = (historyRes.body.history || []).find(
    (item) => item.game?.room?.roomCode === roomCode
  );
  check(
    "DROP-ended round persisted GameResult & COMPLETED game in DB",
    Boolean(matchingResult && matchingResult.isWinner === true && matchingResult.game?.gameStatus === "COMPLETED"),
    `history=${JSON.stringify(matchingResult)}`
  );

  for (const s of sessions) s.disconnect();
});

test("PHASE 3: SORT_HAND persists sorted order on server across reconnect", async () => {
  console.log("\n=== Test: SORT_HAND persistence ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(950 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const s1 = new PlayerSession(tokens[0].token, tokens[0].username);
  const s2 = new PlayerSession(tokens[1].token, tokens[1].username);
  await s1.connect(roomCode);
  await s2.connect(roomCode);
  await new Promise((r) => setTimeout(r, 500));
  await makeAllPlayersReady([s1, s2], 0);

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 900));

  await s1.emit("SORT_HAND", { by: "RANK" });
  await new Promise((r) => setTimeout(r, 400));

  const sortUpdate = (s1.events["PRIVATE_HAND_UPDATE"] || []).slice(-1)[0];
  check("SORT_HAND emits sortedBy='RANK' in PRIVATE_HAND_UPDATE", sortUpdate?.sortedBy === "RANK", `sortedBy=${sortUpdate?.sortedBy}`);
  const sortedIds = (sortUpdate?.cards || []).map((c) => c.id);

  // Disconnect & reconnect s1 -> server must return the persisted sorted order
  s1.disconnect();
  await new Promise((r) => setTimeout(r, 400));
  const s1Reconnected = new PlayerSession(tokens[0].token, tokens[0].username);
  await s1Reconnected.connect(roomCode);
  await new Promise((r) => setTimeout(r, 800));

  const reconnectUpdate = (s1Reconnected.events["PRIVATE_HAND_UPDATE"] || []).slice(-1)[0];
  const reconnectIds = (reconnectUpdate?.cards || []).map((c) => c.id);
  check(
    "Reconnected hand retains server-persisted sorted order",
    JSON.stringify(reconnectIds) === JSON.stringify(sortedIds),
    `expected=${sortedIds.slice(0, 4)}, got=${reconnectIds.slice(0, 4)}`
  );

  s1Reconnected.disconnect();
  s2.disconnect();
});

test("PHASE 3: Multi-round NEXT_ROUND increments roundNumber, accumulates totalScores, and finishes in GAME_OVER", async () => {
  console.log("\n=== Test: Multi-round NEXT_ROUND & totalScores ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(1010 + i)));
  const roomCode = await createRoom(tokens[0].token, { roundCount: 2 });

  const s1 = new PlayerSession(tokens[0].token, tokens[0].username);
  const s2 = new PlayerSession(tokens[1].token, tokens[1].username);
  await s1.connect(roomCode);
  await s2.connect(roomCode);
  await new Promise((r) => setTimeout(r, 600));
  await makeAllPlayersReady([s1, s2], 0);

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 900));

  const [firstP, secondP] = getTurnOrder([s1, s2], tokens);

  // Round 1: first turn player drops (+20 pts) -> ROUND_END (round 1 of 2)
  await firstP.session.emit("DROP");
  await new Promise((r) => setTimeout(r, 700));

  const r1End = (s1.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  check("Round 1 of 2 ends in ROUND_END", r1End?.status === "ROUND_END", `status=${r1End?.status}`);
  check("Round 1 roundNumber=1 and roundCount=2", r1End?.roundNumber === 1 && r1End?.roundCount === 2);
  check("Round 1 totalScores tracks dropped=20, winner=0", r1End?.totalScores?.[firstP.token.userId] === 20 && r1End?.totalScores?.[secondP.token.userId] === 0);

  // Non-host NEXT_ROUND must be rejected
  const preS2Errors = (s2.events["ERROR"] || []).length;
  await s2.emit("NEXT_ROUND");
  await new Promise((r) => setTimeout(r, 400));
  const s2NewErrors = (s2.events["ERROR"] || []).slice(preS2Errors);
  check("Non-host NEXT_ROUND rejected with ERROR", s2NewErrors.length >= 1, `errors=${JSON.stringify(s2NewErrors)}`);

  // Host emits NEXT_ROUND -> Round 2 starts cleanly
  const preHandCount1 = (s1.events["PRIVATE_HAND_UPDATE"] || []).length;
  const preHandCount2 = (s2.events["PRIVATE_HAND_UPDATE"] || []).length;
  await s1.emit("NEXT_ROUND");
  await new Promise((r) => setTimeout(r, 900));

  const r2Start = (s1.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  const r2Hand1 = (s1.events["PRIVATE_HAND_UPDATE"] || []).slice(preHandCount1).slice(-1)[0];
  const r2Hand2 = (s2.events["PRIVATE_HAND_UPDATE"] || []).slice(preHandCount2).slice(-1)[0];
  check("NEXT_ROUND transitions to PLAYING with roundNumber=2", r2Start?.status === "PLAYING" && r2Start?.roundNumber === 2, `status=${r2Start?.status}, round=${r2Start?.roundNumber}`);
  check("NEXT_ROUND deals fresh 13 cards to both players", r2Hand1?.cards?.length === 13 && r2Hand2?.cards?.length === 13);
  check("NEXT_ROUND sets server-authoritative turnEndsAt", typeof r2Start?.turnEndsAt === "number" && r2Start.turnEndsAt > Date.now());
  check("Round 2 preserves cumulative totalScores from Round 1", r2Start?.totalScores?.[firstP.token.userId] === 20);

  // Round 2: first turn player drops again (+20 -> cumulative 40 pts) -> GAME_OVER
  await firstP.session.emit("DROP");
  await new Promise((r) => setTimeout(r, 800));

  const r2End = (s1.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  check("Final round transitions to GAME_OVER", r2End?.status === "GAME_OVER", `status=${r2End?.status}`);
  check("Cumulative totalScores accumulates across rounds (dropped=40, winner=0)", r2End?.totalScores?.[firstP.token.userId] === 40 && r2End?.totalScores?.[secondP.token.userId] === 0, `totalScores=${JSON.stringify(r2End?.totalScores)}`);
  check("GAME_OVER includes sorted rankings (lowest score first)", Array.isArray(r2End?.rankings) && r2End.rankings[0]?.playerId === secondP.token.userId && r2End.rankings[1]?.totalScore === 40, `rankings=${JSON.stringify(r2End?.rankings)}`);

  // Return to lobby without leaving room
  await s1.emit("RETURN_TO_LOBBY");
  await new Promise((r) => setTimeout(r, 400));
  check("RETURN_TO_LOBBY emits RETURNED_TO_LOBBY", (s1.events["RETURNED_TO_LOBBY"] || []).length >= 1);

  s1.disconnect();
  s2.disconnect();
});

test("PHASE 3: Overlapping reconnect (dual-tab) keeps active socket receiving PRIVATE_HAND_UPDATE", async () => {
  console.log("\n=== Test: Overlapping reconnect / dual-tab ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(1020 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const s1Old = new PlayerSession(tokens[0].token, tokens[0].username);
  const s2 = new PlayerSession(tokens[1].token, tokens[1].username);
  await s1Old.connect(roomCode);
  await s2.connect(roomCode);
  await new Promise((r) => setTimeout(r, 600));
  await makeAllPlayersReady([s1Old, s2], 0);

  await s1Old.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 900));

  // Determine who holds first turn after TOSS and test dual-tab reconnect for that player
  const [firstP, otherP] = getTurnOrder([s1Old, s2], tokens);
  const targetOld = firstP.session;
  const targetToken = firstP.token;

  // Open overlapping second socket for the SAME user BEFORE closing old socket
  const targetNew = new PlayerSession(targetToken.token, targetToken.username);
  await targetNew.connect(roomCode);
  await new Promise((r) => setTimeout(r, 700));

  // Now disconnect the old socket -> MUST NOT delete userSockets mapping for targetNew!
  targetOld.disconnect();
  await new Promise((r) => setTimeout(r, 500));

  const preUpdates = (targetNew.events["PRIVATE_HAND_UPDATE"] || []).length;
  await targetNew.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 600));

  const newUpdates = (targetNew.events["PRIVATE_HAND_UPDATE"] || []).slice(preUpdates);
  const latestHand = newUpdates[newUpdates.length - 1];
  check(
    "Active socket still receives PRIVATE_HAND_UPDATE after old socket disconnects",
    Boolean(latestHand && latestHand.cards && latestHand.cards.length === 14),
    `updates=${newUpdates.length}, cards=${latestHand?.cards?.length}`
  );

  if (latestHand?.cards?.length === 14) {
    await targetNew.emit("DISCARD_CARD", { cardId: latestHand.cards[0].id });
    await new Promise((r) => setTimeout(r, 400));
    const afterDiscard = (targetNew.events["PRIVATE_HAND_UPDATE"] || []).slice(-1)[0];
    check("Active socket receives 13-card hand after discard", afterDiscard?.cards?.length === 13);
  }

  targetNew.disconnect();
  otherP.session.disconnect();
});

test("PHASE 3: All-disconnect pauses timer and reconnect restarts paused turn timer", async () => {
  console.log("\n=== Test: All-disconnect -> reconnect timer restart ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(1030 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const s1 = new PlayerSession(tokens[0].token, tokens[0].username);
  const s2 = new PlayerSession(tokens[1].token, tokens[1].username);
  await s1.connect(roomCode);
  await s2.connect(roomCode);
  await new Promise((r) => setTimeout(r, 600));
  await makeAllPlayersReady([s1, s2], 0);

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 900));

  const initialState = (s1.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  check("Initial PLAYING state includes future turnEndsAt", typeof initialState?.turnEndsAt === "number" && initialState.turnEndsAt > Date.now());

  // Disconnect ALL players -> server pauses turn timer
  s1.disconnect();
  s2.disconnect();
  await new Promise((r) => setTimeout(r, 1200));

  // Reconnect player 1 -> server must restart the paused turn timer with a fresh turnEndsAt
  const beforeReconnect = Date.now();
  const s1b = new PlayerSession(tokens[0].token, tokens[0].username);
  await s1b.connect(roomCode);
  await new Promise((r) => setTimeout(r, 800));

  const resumedState = (s1b.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  check(
    "Reconnecting after all-disconnect restores active turnEndsAt in the future",
    resumedState?.status === "PLAYING" &&
      typeof resumedState?.turnEndsAt === "number" &&
      resumedState.turnEndsAt > beforeReconnect,
    `status=${resumedState?.status}, turnEndsAt=${resumedState?.turnEndsAt}`
  );

  s1b.disconnect();
});

test("PHASE 3: LEAVE_ROOM host transfer, KICK_PLAYER in lobby, and room password enforcement", async () => {
  console.log("\n=== Test: LEAVE_ROOM host transfer, KICK_PLAYER, & room password ===");
  const tokens = await Promise.all([1, 2, 3].map((i) => createUser(1040 + i)));
  const roomCode = await createRoom(tokens[0].token, { password: "TableSecret42" });

  // Verify REST exposes hasPassword=true and never passwordHash
  const roomMeta = await apiGet(`/rooms/${roomCode}`);
  check("GET /api/rooms/:code exposes hasPassword=true", roomMeta.status === 200 && roomMeta.body.room?.hasPassword === true);
  check("GET /api/rooms/:code never exposes passwordHash", roomMeta.body.room?.passwordHash === undefined);

  // Host joins without needing password
  const sA = new PlayerSession(tokens[0].token, tokens[0].username);
  await sA.connect(roomCode);
  await new Promise((r) => setTimeout(r, 500));

  // Non-host joining without password must be rejected
  const sBNoPwd = new PlayerSession(tokens[1].token, tokens[1].username);
  await sBNoPwd.connect(roomCode);
  await new Promise((r) => setTimeout(r, 400));
  check(
    "Joining password-protected room without password is rejected",
    (sBNoPwd.events["ERROR"] || []).some((e) => /password/i.test(e?.message || "")) &&
      (sBNoPwd.events["ROOM_PLAYERS_UPDATE"] || []).length === 0,
    `errors=${JSON.stringify(sBNoPwd.events["ERROR"])}`
  );
  sBNoPwd.disconnect();

  // Non-host joining with wrong password must be rejected
  const sBWrongPwd = new PlayerSession(tokens[1].token, tokens[1].username);
  await sBWrongPwd.connect(roomCode, "WrongPassword!");
  await new Promise((r) => setTimeout(r, 400));
  check(
    "Joining password-protected room with wrong password is rejected",
    (sBWrongPwd.events["ERROR"] || []).some((e) => /incorrect.*password/i.test(e?.message || "")) &&
      (sBWrongPwd.events["ROOM_PLAYERS_UPDATE"] || []).length === 0,
    `errors=${JSON.stringify(sBWrongPwd.events["ERROR"])}`
  );
  sBWrongPwd.disconnect();

  // Non-hosts B and C join with correct password
  const sB = new PlayerSession(tokens[1].token, tokens[1].username);
  const sC = new PlayerSession(tokens[2].token, tokens[2].username);
  await sB.connect(roomCode, "TableSecret42");
  await sC.connect(roomCode, "TableSecret42");
  await new Promise((r) => setTimeout(r, 700));

  const lobby3 = (sA.events["ROOM_PLAYERS_UPDATE"] || []).slice(-1)[0];
  check("Players B & C join with correct password (3 players in lobby)", lobby3?.players?.length === 3, `count=${lobby3?.players?.length}`);

  // Non-host B cannot kick C
  const preBErrors = (sB.events["ERROR"] || []).length;
  await sB.emit("KICK_PLAYER", { targetUserId: tokens[2].userId });
  await new Promise((r) => setTimeout(r, 400));
  check("Non-host KICK_PLAYER rejected with ERROR", (sB.events["ERROR"] || []).slice(preBErrors).length >= 1);

  // Host A kicks C
  await sA.emit("KICK_PLAYER", { targetUserId: tokens[2].userId });
  await new Promise((r) => setTimeout(r, 500));

  const cKickedEvents = sC.events["KICKED"] || [];
  const lobbyAfterKick = (sA.events["ROOM_PLAYERS_UPDATE"] || []).slice(-1)[0];
  check("Kicked player C receives KICKED event", cKickedEvents.length >= 1);
  check(
    "Lobby removes kicked player C (2 players remain)",
    lobbyAfterKick?.players?.length === 2 && !lobbyAfterKick.players.some((p) => p.userId === tokens[2].userId),
    `players=${JSON.stringify(lobbyAfterKick?.players?.map((p) => p.username))}`
  );

  // Verify kicked player C receives no further lobby broadcasts
  const cLobbyCountBefore = (sC.events["ROOM_PLAYERS_UPDATE"] || []).length;
  await sB.emit("TOGGLE_READY");
  await new Promise((r) => setTimeout(r, 400));
  check("Kicked player C receives 0 subsequent ROOM_PLAYERS_UPDATE", (sC.events["ROOM_PLAYERS_UPDATE"] || []).length === cLobbyCountBefore);

  // Host A leaves via LEAVE_ROOM -> host transfers to next connected player B!
  await sA.emit("LEAVE_ROOM");
  await new Promise((r) => setTimeout(r, 600));

  const lobbyAfterLeave = (sB.events["ROOM_PLAYERS_UPDATE"] || []).slice(-1)[0];
  check("Host A receives LEFT_ROOM", (sA.events["LEFT_ROOM"] || []).length >= 1);
  check(
    "LEAVE_ROOM transfers host status to next connected player B",
    lobbyAfterLeave?.players?.length === 1 &&
      lobbyAfterLeave.players[0].userId === tokens[1].userId &&
      lobbyAfterLeave.players[0].isHost === true,
    `players=${JSON.stringify(lobbyAfterLeave?.players)}`
  );

  sA.disconnect();
  sB.disconnect();
  sC.disconnect();
});

test("PHASE 3: Socket.IO DECLARE -> SHOW -> SUBMIT_MELDS reduced score & all-disconnect timer pause/resume (in-process RoomManager)", async (t) => {
  console.log("\n=== Test: Socket.IO SHOW + SUBMIT_MELDS & timer pause/resume ===");
  const { Server: SocketIOServer } = require("socket.io");
  const jwt = require("jsonwebtoken");
  const os = require("node:os");
  const fs = require("node:fs");
  const path = require("node:path");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rummy-phase2b-sock-"));
  const prevDbUrl = process.env.DATABASE_URL;
  const prevJwtSecret = process.env.JWT_SECRET;
  process.env.DATABASE_URL = `file:${path.join(tempDir, "phase2b.db")}`;
  process.env.JWT_SECRET = "phase2b_inprocess_test_secret_32chars";

  const { prisma } = require("../dist/db/prisma");
  const { RoomManager } = require("../dist/socket/roomManager");
  const { socketAuthMiddleware } = require("../dist/socket/authMiddleware");

  const httpServer = http.createServer();
  const ioServer = new SocketIOServer(httpServer, { transports: ["websocket"] });
  ioServer.use(socketAuthMiddleware);
  const rm = new RoomManager(ioServer, {
    turnTimeLimitSeconds: 20,
    showTimeLimitSeconds: 20,
    tossDurationMs: 50,
  });
  ioServer.on("connection", (sock) => rm.handleConnection(sock));

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = httpServer.address().port;
  const socketsToClose = [];

  t.after(async () => {
    for (const s of socketsToClose) {
      try { s.disconnect(); } catch {}
    }
    const g = rm.getActiveGame("SHW202");
    if (g) g.stopTimer();
    await new Promise((resolve) => ioServer.close(() => resolve()));
    await new Promise((resolve) => httpServer.close(() => resolve()));
    // Allow trailing async disconnect DB updates to settle before closing SQLite handle (Windows EPERM fix)
    await new Promise((resolve) => setTimeout(resolve, 150));
    await prisma.$disconnect();
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
    if (prevJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwtSecret;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Ignore transient OS temp-dir lock on Windows after DB handle release
    }
  });

  const u1 = await prisma.user.create({ data: { username: "show_alice", isGuest: true } });
  const u2 = await prisma.user.create({ data: { username: "show_bob", isGuest: true } });
  await prisma.room.create({
    data: {
      roomCode: "SHW202",
      hostId: u1.id,
      roomName: "Show Phase Room",
      maxPlayers: 4,
      roundCount: 2,
      entryPoints: 80,
      status: "WAITING",
    },
  });

  const tok1 = jwt.sign({ userId: u1.id, username: u1.username, isGuest: true }, process.env.JWT_SECRET);
  const tok2 = jwt.sign({ userId: u2.id, username: u2.username, isGuest: true }, process.env.JWT_SECRET);

  const connectLocal = (tok) =>
    new Promise((resolve, reject) => {
      const s = io(`http://127.0.0.1:${port}`, { auth: { token: tok }, transports: ["websocket"], reconnection: false });
      const ev = {};
      s.onAny((name, data) => {
        if (!ev[name]) ev[name] = [];
        ev[name].push(data);
      });
      s.on("connect", () => resolve({ socket: s, events: ev }));
      s.on("connect_error", reject);
      socketsToClose.push(s);
    });

  const c1 = await connectLocal(tok1);
  const c2 = await connectLocal(tok2);

  c1.socket.emit("JOIN_ROOM", { roomCode: "SHW202" });
  await new Promise((r) => setTimeout(r, 150));
  c2.socket.emit("JOIN_ROOM", { roomCode: "SHW202" });
  await new Promise((r) => setTimeout(r, 150));
  c2.socket.emit("TOGGLE_READY");
  await new Promise((r) => setTimeout(r, 150));
  c1.socket.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 300));

  const activeGame = rm.getActiveGame("SHW202");
  check("In-process game started and timer is running", Boolean(activeGame && activeGame.isTimerRunning()));

  // Verify all-disconnect pauses timer -> reconnect restarts timer
  c1.socket.disconnect();
  c2.socket.disconnect();
  await new Promise((r) => setTimeout(r, 250));
  check("All-disconnect pauses server turn timer (isTimerRunning=false)", activeGame.isTimerRunning() === false);

  const c1b = await connectLocal(tok1);
  const c2b = await connectLocal(tok2);
  c1b.socket.emit("JOIN_ROOM", { roomCode: "SHW202" });
  await new Promise((r) => setTimeout(r, 200));
  check("First player reconnect restarts paused turn timer (isTimerRunning=true)", activeGame.isTimerRunning() === true);
  c2b.socket.emit("JOIN_ROOM", { roomCode: "SHW202" });
  await new Promise((r) => setTimeout(r, 200));

  // Drive DECLARE -> SHOW -> SUBMIT_MELDS over real Socket.IO using the toss winner
  const declarerId = activeGame.getCurrentTurnPlayerId();
  const opponentId = declarerId === u1.id ? u2.id : u1.id;
  const declarerSock = declarerId === u1.id ? c1b : c2b;
  const opponentSock = declarerId === u1.id ? c2b : c1b;

  declarerSock.socket.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 200));

  const mk = (id, suit, rank, isWildJoker = false, isPrintedJoker = false) => ({
    id, suit, rank, isWildJoker, isPrintedJoker,
  });
  const p1Melds = [
    [mk("H4_a", "HEARTS", "4"), mk("H5_a", "HEARTS", "5"), mk("H6_a", "HEARTS", "6")],
    [mk("S8_a", "SPADES", "8"), mk("PJ_a", "JOKER", "PRINTED_JOKER", false, true), mk("S10_a", "SPADES", "10"), mk("SJ_a", "SPADES", "J")],
    [mk("DK_a", "DIAMONDS", "K"), mk("CK_a", "CLUBS", "K"), mk("SK_a", "SPADES", "K")],
    [mk("H3_a", "HEARTS", "3"), mk("D3_a", "DIAMONDS", "3"), mk("C3_a", "CLUBS", "3")],
  ];
  const p1Discard = mk("C9_a", "CLUBS", "9");
  activeGame.getPlayer(declarerId).hand = [...p1Melds.flat(), p1Discard];

  // Opponent has 1 pure + 1 impure + 1 set + 4 low deadwood cards (2 + 3 + 4 + 5 = 14 pts)
  const p2Melds = [
    [mk("D4_b", "DIAMONDS", "4"), mk("D5_b", "DIAMONDS", "5"), mk("D6_b", "DIAMONDS", "6")],
    [mk("C7_b", "CLUBS", "7"), mk("C8_b", "CLUBS", "8"), mk("PJ_b", "JOKER", "PRINTED_JOKER", false, true)],
    [mk("HQ_b", "HEARTS", "Q"), mk("SQ_b", "SPADES", "Q"), mk("DQ_b", "DIAMONDS", "Q")],
    [mk("C2_b", "CLUBS", "2"), mk("H3_b", "HEARTS", "3"), mk("S4_b", "SPADES", "4"), mk("S5_b", "SPADES", "5")],
  ];
  activeGame.getPlayer(opponentId).hand = p2Melds.flat();

  declarerSock.socket.emit("DECLARE", { melds: p1Melds, declareCardId: p1Discard.id });
  await new Promise((r) => setTimeout(r, 300));

  const showState = (opponentSock.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  check("Socket DECLARE transitions game to SHOW phase", showState?.status === "SHOW", `status=${showState?.status}`);
  check("SHOW state broadcasts winnerMelds and showEndsAt", showState?.winnerMelds?.length === 4 && typeof showState?.showEndsAt === "number");

  // Opponent submits melds via Socket SUBMIT_MELDS
  opponentSock.socket.emit("SUBMIT_MELDS", { melds: p2Melds });
  await new Promise((r) => setTimeout(r, 350));

  const roundEndState = (opponentSock.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  check("Socket SUBMIT_MELDS finalizes round to ROUND_END", roundEndState?.status === "ROUND_END", `status=${roundEndState?.status}`);
  check(
    "Opponent receives reduced deadwood score (14 pts, not 80)",
    roundEndState?.roundScores?.[opponentId]?.points === 14 && roundEndState?.roundScores?.[declarerId]?.points === 0,
    `scores=${JSON.stringify(roundEndState?.roundScores)}`
  );
});

test("PHASE 3: PATCH /api/auth/me updates username & avatar without leaking passwordHash", async () => {
  console.log("\n=== Test: PATCH /api/auth/me profile updates & passwordHash safety ===");
  const suffix = `${Date.now().toString().slice(-6)}`;
  const initialUsername = `ProfA_${suffix}`;
  const otherUsername = `ProfB_${suffix}`;

  const regA = await apiPost("/auth/register", {
    username: initialUsername,
    email: `profa_${suffix}@example.com`,
    password: "StrongPassword123!",
  });
  const regB = await apiPost("/auth/register", {
    username: otherUsername,
    email: `profb_${suffix}@example.com`,
    password: "StrongPassword123!",
  });
  check("Registered user A for profile test", regA.status === 201 && Boolean(regA.body.token));
  check("Registered user B for conflict test", regB.status === 201 && Boolean(regB.body.token));

  // Unauthenticated PATCH must be rejected
  const unauthRes = await apiPatch("/auth/me", { username: "NoAuthUser" });
  check("Unauthenticated PATCH /api/auth/me rejected with 401", unauthRes.status === 401, `status=${unauthRes.status}`);

  // Too-short username must be rejected
  const shortRes = await apiPatch("/auth/me", { username: "ab" }, regA.body.token);
  check("Username < 3 chars rejected with 400", shortRes.status === 400, `status=${shortRes.status}`);

  // Duplicate username must be rejected with 409
  const dupRes = await apiPatch("/auth/me", { username: otherUsername }, regA.body.token);
  check("Duplicate username rejected with 409", dupRes.status === 409, `status=${dupRes.status}`);

  // Valid update of username & avatarSeed
  const newUsername = `Renamed_${suffix}`;
  const patchRes = await apiPatch(
    "/auth/me",
    { username: newUsername, avatarSeed: "RoyalAceSeed" },
    regA.body.token
  );
  check("Valid PATCH /api/auth/me returns 200", patchRes.status === 200, `status=${patchRes.status}, body=${JSON.stringify(patchRes.body)}`);
  check(
    "PATCH /api/auth/me updates username and DiceBear avatar URL",
    patchRes.body?.user?.username === newUsername &&
      String(patchRes.body?.user?.profileImage || "").includes("RoyalAceSeed"),
    `user=${JSON.stringify(patchRes.body?.user)}`
  );
  check(
    "PATCH /api/auth/me does NOT leak passwordHash",
    patchRes.body?.user && !("passwordHash" in patchRes.body.user) && !JSON.stringify(patchRes.body).includes("passwordHash"),
    `keys=${Object.keys(patchRes.body?.user || {}).join(",")}`
  );

  // Refreshed token works on GET /api/auth/me and persists new values
  const meRes = await apiGet("/auth/me", patchRes.body.token);
  check(
    "Refreshed token returns updated profile on GET /api/auth/me without passwordHash",
    meRes.status === 200 &&
      meRes.body?.user?.username === newUsername &&
      !("passwordHash" in (meRes.body?.user || {})),
    `me=${JSON.stringify(meRes.body)}`
  );
});

test("PHASE 3: GET /api/friends reflects real online/offline presence on socket connect/disconnect", async () => {
  console.log("\n=== Test: Live online/offline presence in GET /api/friends ===");
  const [userA, userB] = await Promise.all([1, 2].map((i) => createUser(1100 + i)));

  // Send & accept friend request between A and B
  const reqRes = await apiPost("/friends/request", { username: userB.username }, userA.token);
  check("Friend request A -> B created", reqRes.status === 201, `status=${reqRes.status}`);

  const bFriendsPending = await apiGet("/friends", userB.token);
  const pendingReq = (bFriendsPending.body?.pendingRequests || []).find(
    (r) => r.sender?.id === userA.userId
  );
  check("User B sees pending request from User A", Boolean(pendingReq), `pending=${JSON.stringify(bFriendsPending.body?.pendingRequests)}`);

  const acceptRes = await apiPost(
    "/friends/respond",
    { requestId: pendingReq.id, action: "ACCEPT" },
    userB.token
  );
  check("User B accepts friend request", acceptRes.status === 200);

  // 1. Before B connects any socket: A sees B as isOnline: false
  const beforeConnect = await apiGet("/friends", userA.token);
  const friendBefore = (beforeConnect.body?.friends || []).find(
    (f) => f.friendUser?.id === userB.userId
  );
  check(
    "GET /api/friends reports isOnline=false before friend connects socket",
    friendBefore && friendBefore.isOnline === false,
    `friend=${JSON.stringify(friendBefore)}`
  );

  // 2. B connects socket #1 (presence only, no room) -> A sees isOnline: true
  const bTab1 = new PlayerSession(userB.token, userB.username);
  await bTab1.connect(null);
  await new Promise((r) => setTimeout(r, 300));

  const whileOnline = await apiGet("/friends", userA.token);
  const friendOnline = (whileOnline.body?.friends || []).find(
    (f) => f.friendUser?.id === userB.userId
  );
  check(
    "GET /api/friends reports isOnline=true when friend socket connects",
    friendOnline && friendOnline.isOnline === true,
    `friend=${JSON.stringify(friendOnline)}`
  );

  // 3. Multi-tab safety: B opens tab #2, then closes tab #1 -> still isOnline: true
  const bTab2 = new PlayerSession(userB.token, userB.username);
  await bTab2.connect(null);
  await new Promise((r) => setTimeout(r, 200));
  bTab1.disconnect();
  await new Promise((r) => setTimeout(r, 300));

  const whileSecondTabOpen = await apiGet("/friends", userA.token);
  const friendStillOnline = (whileSecondTabOpen.body?.friends || []).find(
    (f) => f.friendUser?.id === userB.userId
  );
  check(
    "Multi-tab presence stays isOnline=true when 1 of 2 sockets disconnects",
    friendStillOnline && friendStillOnline.isOnline === true,
    `friend=${JSON.stringify(friendStillOnline)}`
  );

  // 4. B closes final socket -> A sees isOnline: false
  bTab2.disconnect();
  await new Promise((r) => setTimeout(r, 400));

  const afterDisconnect = await apiGet("/friends", userA.token);
  const friendOffline = (afterDisconnect.body?.friends || []).find(
    (f) => f.friendUser?.id === userB.userId
  );
  check(
    "GET /api/friends reports isOnline=false after all friend sockets disconnect",
    friendOffline && friendOffline.isOnline === false,
    `friend=${JSON.stringify(friendOffline)}`
  );
});

test("PHASE 3: INVITE_FRIEND delivers ROOM_INVITE_RECEIVED to online friend, rejects non-members, & applies room timer settings", async () => {
  console.log("\n=== Test: INVITE_FRIEND & Custom Room Settings ===");
  const [hostA, friendB, outsiderC, offlineD] = await Promise.all(
    [1, 2, 3, 4].map((i) => createUser(1120 + i))
  );

  const createRes = await apiPost(
    "/rooms/create",
    {
      roomName: "VIP Invite Lounge",
      maxPlayers: 4,
      roundCount: 1,
      entryPoints: 160,
      turnTimeLimitSeconds: 45,
    },
    hostA.token
  );
  check("Room created with custom turnTimeLimitSeconds=45 and entryPoints=160", createRes.status === 201 && createRes.body?.room?.turnTimeLimitSeconds === 45 && createRes.body?.room?.entryPoints === 160);
  const roomCode = createRes.body.room.roomCode;

  const getRoomRes = await apiGet(`/rooms/${roomCode}`);
  check("GET /api/rooms/:code reflects turnTimeLimitSeconds=45 and entryPoints=160", getRoomRes.status === 200 && getRoomRes.body?.room?.turnTimeLimitSeconds === 45 && getRoomRes.body?.room?.entryPoints === 160);

  const sHost = new PlayerSession(hostA.token, hostA.username);
  const sFriend = new PlayerSession(friendB.token, friendB.username);
  const sOutsider = new PlayerSession(outsiderC.token, outsiderC.username);

  await sHost.connect(roomCode);
  await sFriend.connect(null); // Online on Home/Profile, not yet in room
  await sOutsider.connect(null); // Online, NOT a member of the room
  await new Promise((r) => setTimeout(r, 400));

  // 1. Non-member outsider attempts INVITE_FRIEND -> MUST be rejected with ERROR & friend receives nothing
  await sOutsider.emit("INVITE_FRIEND", { friendId: friendB.userId, roomCode });
  await new Promise((r) => setTimeout(r, 350));

  const outsiderErrors = sOutsider.events["ERROR"] || [];
  const friendInvitesAfterOutsider = sFriend.events["ROOM_INVITE_RECEIVED"] || [];
  check(
    "Non-member INVITE_FRIEND rejected with ERROR",
    outsiderErrors.length >= 1 && /member/i.test(outsiderErrors[outsiderErrors.length - 1]?.message || ""),
    `errors=${JSON.stringify(outsiderErrors)}`
  );
  check(
    "Friend receives NO ROOM_INVITE_RECEIVED from non-member",
    friendInvitesAfterOutsider.length === 0,
    `invites=${JSON.stringify(friendInvitesAfterOutsider)}`
  );

  // 2. Room member host invites online friend -> friend receives ROOM_INVITE_RECEIVED
  await sHost.emit("INVITE_FRIEND", { friendId: friendB.userId, roomCode });
  await new Promise((r) => setTimeout(r, 350));

  const invites = sFriend.events["ROOM_INVITE_RECEIVED"] || [];
  const inviteSentAcks = sHost.events["INVITE_SENT"] || [];
  const latestInvite = invites[invites.length - 1];
  check(
    "Member INVITE_FRIEND delivers ROOM_INVITE_RECEIVED to target friend socket",
    Boolean(
      latestInvite &&
        latestInvite.roomCode === roomCode &&
        latestInvite.roomName === "VIP Invite Lounge" &&
        latestInvite.fromUsername === hostA.username
    ),
    `invite=${JSON.stringify(latestInvite)}`
  );
  check(
    "Member receives INVITE_SENT confirmation",
    inviteSentAcks.length >= 1 && inviteSentAcks[0]?.friendId === friendB.userId
  );

  // 3. Inviting an offline user -> rejected with ERROR
  const preHostErrors = (sHost.events["ERROR"] || []).length;
  await sHost.emit("INVITE_FRIEND", { friendId: offlineD.userId, roomCode });
  await new Promise((r) => setTimeout(r, 300));
  const postHostErrors = (sHost.events["ERROR"] || []).slice(preHostErrors);
  check(
    "Inviting offline friend emits ERROR",
    postHostErrors.length >= 1 && /offline/i.test(postHostErrors[0]?.message || ""),
    `errors=${JSON.stringify(postHostErrors)}`
  );

  // 4. Friend accepts invite (joins room) and game starts with custom 45s turn timer
  await sFriend.emit("JOIN_ROOM", { roomCode });
  await new Promise((r) => setTimeout(r, 350));
  await sFriend.emit("TOGGLE_READY");
  await new Promise((r) => setTimeout(r, 300));
  await sHost.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 600));

  const startedState = (sHost.events["GAME_STATE_UPDATE"] || []).slice(-1)[0];
  const remainingSec = startedState?.turnEndsAt
    ? Math.round((startedState.turnEndsAt - Date.now()) / 1000)
    : 0;
  check(
    "Started game applies room's custom 45s turnTimeLimitSeconds",
    startedState?.status === "PLAYING" && remainingSec >= 35 && remainingSec <= 46,
    `status=${startedState?.status}, remainingSec=${remainingSec}`
  );

  sHost.disconnect();
  sFriend.disconnect();
  sOutsider.disconnect();
});

test("PHASE 3: TOSS phase draws unique cards, sorts by rank+suit, reshuffles & deals 13 cards, and assigns first turn to #1 winner", async () => {
  console.log("\n=== Test: TOSS -> PLAYING E2E ===");
  const tokens = await Promise.all([1, 2, 3].map((i) => createUser(1200 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const s = new PlayerSession(tokens[i].token, tokens[i].username);
    await s.connect(roomCode);
    sessions.push(s);
  }
  await new Promise((r) => setTimeout(r, 600));
  await makeAllPlayersReady(sessions, 0);

  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 800));

  const allUpdates = sessions[0].events["GAME_STATE_UPDATE"] || [];
  const tossState = allUpdates.find((u) => u.status === "TOSS");
  const playingState = [...allUpdates].reverse().find((u) => u.status === "PLAYING");

  check("Server emits status='TOSS' before PLAYING", Boolean(tossState), `statuses=${allUpdates.map((u) => u.status).join(",")}`);
  check("TOSS state contains 3 tossResults with tossEndsAt", Boolean(tossState?.tossResults?.length === 3 && typeof tossState?.tossEndsAt === "number"));

  if (tossState?.tossResults?.length === 3) {
    const rankP = { A: 14, K: 13, Q: 12, J: 11, "10": 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };
    const suitP = { SPADES: 4, HEARTS: 3, DIAMONDS: 2, CLUBS: 1 };
    const prio = (c) => (rankP[c.rank] || 0) * 10 + (suitP[c.suit] || 0);
    const uniqueKeys = new Set(tossState.tossResults.map((r) => `${r.card.suit}_${r.card.rank}`));
    check("TOSS draws 1 unique non-joker card per player", uniqueKeys.size === 3 && tossState.tossResults.every((r) => !r.card.isPrintedJoker));
    check(
      "TOSS results are sorted strictly descending by Rank + Suit priority",
      prio(tossState.tossResults[0].card) > prio(tossState.tossResults[1].card) &&
        prio(tossState.tossResults[1].card) > prio(tossState.tossResults[2].card)
    );
    check(
      "PLAYING assigns first turn to #1 toss winner",
      Boolean(playingState && playingState.currentTurnPlayerId === tossState.tossResults[0].playerId),
      `tossWinner=${tossState.tossResults[0].playerId}, firstTurn=${playingState?.currentTurnPlayerId}`
    );
  }

  for (let i = 0; i < 3; i++) {
    const handEv = (sessions[i].events["PRIVATE_HAND_UPDATE"] || []).slice(-1)[0];
    check(`Player ${i + 1} receives 13 cards after TOSS reshuffle`, handEv?.cards?.length === 13);
  }

  for (const s of sessions) s.disconnect();
});

test("PHASE 3: CHAT_MESSAGE and SEND_REACTION broadcast within room only (no cross-room leakage)", async () => {
  console.log("\n=== Test: Room-scoped CHAT_MESSAGE & SEND_REACTION ===");
  const [uA1, uA2, uB1] = await Promise.all([1, 2, 3].map((i) => createUser(1300 + i)));
  const roomA = await createRoom(uA1.token, { roomName: "Room Alpha" });
  const roomB = await createRoom(uB1.token, { roomName: "Room Beta" });

  const sA1 = new PlayerSession(uA1.token, uA1.username);
  const sA2 = new PlayerSession(uA2.token, uA2.username);
  const sB1 = new PlayerSession(uB1.token, uB1.username);
  await sA1.connect(roomA);
  await sA2.connect(roomA);
  await sB1.connect(roomB);
  await new Promise((r) => setTimeout(r, 500));

  await sA1.emit("CHAT_MESSAGE", { text: "Good luck at Royal 13!" });
  await sA2.emit("SEND_REACTION", { emoji: "🔥" });
  await new Promise((r) => setTimeout(r, 400));

  const a1Chats = sA1.events["CHAT_MESSAGE"] || [];
  const a2Chats = sA2.events["CHAT_MESSAGE"] || [];
  const b1Chats = sB1.events["CHAT_MESSAGE"] || [];
  check(
    "Same-room members receive CHAT_MESSAGE with sender metadata",
    a1Chats.length === 1 &&
      a2Chats.length === 1 &&
      a2Chats[0].text === "Good luck at Royal 13!" &&
      a2Chats[0].playerId === uA1.userId &&
      a2Chats[0].roomCode === roomA
  );
  check("Other-room socket receives ZERO CHAT_MESSAGE events", b1Chats.length === 0, `b1Chats=${b1Chats.length}`);

  const a1Reacts = sA1.events["SEND_REACTION"] || [];
  const a2Reacts = sA2.events["SEND_REACTION"] || [];
  const b1Reacts = sB1.events["SEND_REACTION"] || [];
  check(
    "Same-room members receive SEND_REACTION with emoji & playerId",
    a1Reacts.length === 1 &&
      a2Reacts.length === 1 &&
      a1Reacts[0].emoji === "🔥" &&
      a1Reacts[0].playerId === uA2.userId &&
      a1Reacts[0].roomCode === roomA
  );
  check("Other-room socket receives ZERO SEND_REACTION events", b1Reacts.length === 0, `b1Reacts=${b1Reacts.length}`);

  sA1.disconnect();
  sA2.disconnect();
  sB1.disconnect();
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test("PHASE 3: Test summary", async () => {
  console.log("\n========================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("========================================");
  if (failed > 0) {
    assert.fail(`${failed} test(s) failed`);
  }
});