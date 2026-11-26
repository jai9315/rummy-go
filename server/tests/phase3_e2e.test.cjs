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

// ---------------------------------------------------------------------------
// REST helpers
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
// Socket client wrapper
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
      });

      this.socket.on("connect_error", (err) => {
        reject(new Error(`Socket connect error: ${err.message}`));
      });

      this.socket.onAny((event, data) => {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(data);
      });

      this.socket.on("JOIN_ROOM_ACK", () => resolve());

      this.socket.once("connect", () => {
        this.socket.emit("JOIN_ROOM", { roomCode });
      });

      setTimeout(() => {
        if (!this.connected) reject(new Error("Socket connect timeout"));
      }, 10000);
    });
  }

  emit(event, data) {
    return new Promise((resolve) => {
      if (!this.socket || !this.connected) {
        resolve({ error: "Socket not connected" });
        return;
      }
      this.socket.emit(event, data, (resp) => {
        resolve(resp || {});
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: register + login a user, return token
// ---------------------------------------------------------------------------
async function createUser(suffix) {
  const username = `testuser_${suffix}_${Date.now()}`;
  const email = `${username}@example.com`;
  const password = "TestPass123!";

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
  const res = await apiPost("/rooms/create", {
    roomName: "E2E Test Table",
    maxPlayers: 4,
    roundCount: 1,
    entryPoints: 80,
  }, token);
  assert.strictEqual(res.status, 201, `Room create failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.room.roomCode, "No roomCode returned");
  return res.body.room.roomCode;
}

// ---------------------------------------------------------------------------
// PHASE 3 TESTS
// ---------------------------------------------------------------------------

test("PHASE 3: Four players join same private room", async (t) => {
  console.log("\n=== Test: 4 players join same room ===");
  const tokens = await Promise.all([1, 2, 3, 4].map((i) => createUser(i)));
  const roomCode = await createRoom(tokens[0].token);

  const sessions = [];
  for (let i = 0; i < 4; i++) {
    const s = new PlayerSession(tokens[i].token, tokens[i].username);
    await s.connect(roomCode);
    sessions.push(s);
  }

  await new Promise((r) => setTimeout(r, 1000));

  let connectedCount = 0;
  for (const s of sessions) if (s.connected) connectedCount++;
  check("All 4 players connected", connectedCount === 4, `connected: ${connectedCount}`);

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

  await new Promise((r) => setTimeout(r, 1000));

  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

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

  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 1000));

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

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 800));

  const drawRes = await s1.emit("DRAW_CARD", { source: "CLOSED" });
  check("p1 can draw card", !drawRes.error, `error: ${drawRes.error}`);

  const handUpdates = s1.events["PRIVATE_HAND_UPDATE"] || [];
  const latestHand = handUpdates[handUpdates.length - 1];
  const cardToDiscard = latestHand.cards[0].id;
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

  await sessions[0].emit("START_GAME");
  await new Promise((r) => setTimeout(r, 800));

  const stateUpdates = sessions[0].events["GAME_STATE_UPDATE"] || [];
  const initialState = stateUpdates[stateUpdates.length - 1];
  check("Game state has turnPhase=DRAW initially", initialState.turnPhase === "DRAW", `phase: ${initialState.turnPhase}`);
  check("Game state has currentTurnPlayerId", typeof initialState.currentTurnPlayerId === "string" && initialState.currentTurnPlayerId.length > 0);

  await sessions[0].emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 300));
  const hand1 = sessions[0].events["PRIVATE_HAND_UPDATE"].pop().cards;
  await sessions[0].emit("DISCARD_CARD", { cardId: hand1[0].id });
  await new Promise((r) => setTimeout(r, 300));

  const stateAfter = sessions[1].events["GAME_STATE_UPDATE"].pop();
  check("Turn phase is DISCARD after draw", stateAfter.turnPhase === "DISCARD", `phase: ${stateAfter.turnPhase}`);

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

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 800));

  await s1.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((r) => setTimeout(r, 300));

  const handUpdates = s1.events["PRIVATE_HAND_UPDATE"] || [];
  const hand = handUpdates[handUpdates.length - 1].cards;
  const declareCardId = hand[hand.length - 1].id;

  const badMelds = [hand.slice(0, 3), hand.slice(3, 6), hand.slice(6, 9)];
  const res = await s1.emit("DECLARE", { melds: badMelds, declareCardId });
  check("Invalid declare (wrong card count) rejected", res.isValid === false, `isValid: ${res.isValid}`);

  s1.disconnect();
  s2.disconnect();
});

test("PHASE 3: Reconnection restores correct private hand", async (t) => {
  console.log("\n=== Test: Reconnection restores hand ===");
  const tokens = await Promise.all([1, 2].map((i) => createUser(600 + i)));
  const roomCode = await createRoom(tokens[0].token);

  const s1 = new PlayerSession(tokens[0].token, tokens[0].username);
  await s1.connect(roomCode);
  await new Promise((r) => setTimeout(r, 500));

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 800));

  const initialUpdates = s1.events["PRIVATE_HAND_UPDATE"] || [];
  const initialHand = initialUpdates[initialUpdates.length - 1].cards;
  const initialCardIds = new Set(initialHand.map((c) => c.id));

  s1.disconnect();
  await new Promise((r) => setTimeout(r, 500));

  const s1b = new PlayerSession(tokens[0].token, tokens[0].username);
  await s1b.connect(roomCode);
  await new Promise((r) => setTimeout(r, 800));

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

  await s1.emit("START_GAME");
  await new Promise((r) => setTimeout(r, 800));

  const p1HandUpdates = s1.events["PRIVATE_HAND_UPDATE"] || [];
  const p1Hand = p1HandUpdates[p1HandUpdates.length - 1].cards;
  const p1CardId = p1Hand[0].id;

  const res = await s2.emit("DISCARD_CARD", { cardId: p1CardId });
  check("p2 cannot discard p1's card", !!res.error || res.isValid === false, `result: ${JSON.stringify(res)}`);

  s1.disconnect();
  s2.disconnect();
});

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------
async function main() {
  console.log("========================================");
  console.log("PHASE 3 E2E Multiplayer Tests");
  console.log("========================================");
  console.log(`Server: ${BASE_URL}`);

  try {
    await apiGet("/health");
    console.log("Server is reachable ✓");
  } catch (e) {
    console.error("ERROR: Cannot reach server at", BASE_URL);
    console.error("Make sure the backend is running: npm run start:server");
    process.exit(1);
  }

  console.log("\n========================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("========================================");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});