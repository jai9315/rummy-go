// ============================================================================
// Multiplayer Socket Security & Card Privacy Penetration Test
// Runs against the REAL RoomManager + REAL Socket.IO server + REAL node:sqlite
// DB (isolated temp DB in os.tmpdir()) on an ephemeral localhost port.
// ============================================================================

const assert = require("node:assert");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const { Server: SocketIOServer } = require("socket.io");
const { io: ClientIO } = require("socket.io-client");

function waitForEvent(eventsArray, prevCount, timeoutMs = 4000, label = "event") {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (eventsArray.length > prevCount) {
        clearInterval(timer);
        resolve(eventsArray[eventsArray.length - 1]);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, 25);
  });
}

function connectSocket(port, token, openSockets) {
  return new Promise((resolve, reject) => {
    const socket = ClientIO(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    const events = {};
    socket.onAny((eventName, payload) => {
      if (!events[eventName]) events[eventName] = [];
      events[eventName].push(payload);
    });
    socket.on("connect", () => {
      openSockets.push(socket);
      resolve({ socket, events });
    });
    socket.on("connect_error", (err) => reject(err));
  });
}

test("Real RoomManager + Socket.IO: 3-player card privacy, reconnect isolation, and anti-cheat enforcement", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rummy-privacy-real-"));
  const dbPath = path.join(tempDir, "privacy.db");

  const prevEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    LIVEKIT_URL: process.env.LIVEKIT_URL,
  };

  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.JWT_SECRET = "real_roommanager_privacy_test_secret_32chars";
  process.env.LIVEKIT_API_KEY = "test_lk_key";
  process.env.LIVEKIT_API_SECRET = "test_lk_secret_32chars_minimum_len";
  process.env.LIVEKIT_URL = "ws://localhost:7880";

  const { prisma } = require("../dist/db/prisma");
  const { RoomManager } = require("../dist/socket/roomManager");
  const { socketAuthMiddleware } = require("../dist/socket/authMiddleware");

  const httpServer = http.createServer();
  const io = new SocketIOServer(httpServer, {
    transports: ["websocket"],
  });
  io.use(socketAuthMiddleware);

  const roomManager = new RoomManager(io, {
    turnTimeLimitSeconds: 30,
    showTimeLimitSeconds: 20,
  });
  io.on("connection", (socket) => roomManager.handleConnection(socket));

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = httpServer.address().port;
  const openSockets = [];
  const roomCode = "PRV301";

  t.after(async () => {
    for (const s of openSockets) {
      try {
        s.disconnect();
      } catch {}
    }
    const activeGame = roomManager.getActiveGame(roomCode);
    if (activeGame) {
      activeGame.stopTimer();
    }
    await new Promise((resolve) => io.close(() => resolve()));
    await new Promise((resolve) => httpServer.close(() => resolve()));
    await prisma.$disconnect();

    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // 1. Seed 3 real users & private room in isolated SQLite database
  const alice = await prisma.user.create({
    data: { username: "PrivacyAlice", isGuest: true },
  });
  const bob = await prisma.user.create({
    data: { username: "PrivacyBob", isGuest: true },
  });
  const charlie = await prisma.user.create({
    data: { username: "PrivacyCharlie", isGuest: true },
  });

  await prisma.room.create({
    data: {
      roomCode,
      hostId: alice.id,
      roomName: "3-Player Real RoomManager Privacy Table",
      maxPlayers: 6,
      roundCount: 1,
      entryPoints: 80,
      status: "WAITING",
    },
  });

  const sign = (u) =>
    jwt.sign(
      { userId: u.id, username: u.username, isGuest: true },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

  const cAlice = await connectSocket(port, sign(alice), openSockets);
  const cBob = await connectSocket(port, sign(bob), openSockets);
  const cCharlie = await connectSocket(port, sign(charlie), openSockets);

  // Join room sequentially so seat assignment & host status are deterministic
  cAlice.socket.emit("JOIN_ROOM", { roomCode });
  await new Promise((r) => setTimeout(r, 150));
  cBob.socket.emit("JOIN_ROOM", { roomCode });
  await new Promise((r) => setTimeout(r, 150));
  cCharlie.socket.emit("JOIN_ROOM", { roomCode });
  await new Promise((r) => setTimeout(r, 150));

  // Non-host players ready up
  cBob.socket.emit("TOGGLE_READY");
  cCharlie.socket.emit("TOGGLE_READY");
  await new Promise((r) => setTimeout(r, 200));

  // Host starts game through the REAL RoomManager
  cAlice.socket.emit("START_GAME");

  await Promise.all([
    waitForEvent(cAlice.events.PRIVATE_HAND_UPDATE || (cAlice.events.PRIVATE_HAND_UPDATE = []), 0, 4000, "Alice PRIVATE_HAND_UPDATE"),
    waitForEvent(cBob.events.PRIVATE_HAND_UPDATE || (cBob.events.PRIVATE_HAND_UPDATE = []), 0, 4000, "Bob PRIVATE_HAND_UPDATE"),
    waitForEvent(cCharlie.events.PRIVATE_HAND_UPDATE || (cCharlie.events.PRIVATE_HAND_UPDATE = []), 0, 4000, "Charlie PRIVATE_HAND_UPDATE"),
    waitForEvent(cAlice.events.GAME_STATE_UPDATE || (cAlice.events.GAME_STATE_UPDATE = []), 0, 4000, "Alice GAME_STATE_UPDATE"),
  ]);
  await new Promise((r) => setTimeout(r, 150));

  // -------------------------------------------------------------------------
  // CHECK 1: 3 players receive disjoint 13-card hands via PRIVATE_HAND_UPDATE
  // -------------------------------------------------------------------------
  const aliceHandUpdate = cAlice.events.PRIVATE_HAND_UPDATE.slice(-1)[0];
  const bobHandUpdate = cBob.events.PRIVATE_HAND_UPDATE.slice(-1)[0];
  const charlieHandUpdate = cCharlie.events.PRIVATE_HAND_UPDATE.slice(-1)[0];

  assert.strictEqual(aliceHandUpdate.playerId, alice.id, "Alice must only receive her own playerId");
  assert.strictEqual(bobHandUpdate.playerId, bob.id, "Bob must only receive his own playerId");
  assert.strictEqual(charlieHandUpdate.playerId, charlie.id, "Charlie must only receive his own playerId");

  assert.strictEqual(aliceHandUpdate.cards.length, 13, "Alice must receive exactly 13 cards");
  assert.strictEqual(bobHandUpdate.cards.length, 13, "Bob must receive exactly 13 cards");
  assert.strictEqual(charlieHandUpdate.cards.length, 13, "Charlie must receive exactly 13 cards");

  const allPrivateIds = new Set([
    ...aliceHandUpdate.cards.map((c) => c.id),
    ...bobHandUpdate.cards.map((c) => c.id),
    ...charlieHandUpdate.cards.map((c) => c.id),
  ]);
  assert.strictEqual(
    allPrivateIds.size,
    39,
    `All 3 players must hold 39 strictly disjoint card IDs (got ${allPrivateIds.size})`
  );

  // -------------------------------------------------------------------------
  // CHECK 2: Public GAME_STATE_UPDATE broadcasts contain ZERO private card IDs
  // -------------------------------------------------------------------------
  for (const [label, client] of [
    ["Alice", cAlice],
    ["Bob", cBob],
    ["Charlie", cCharlie],
  ]) {
    const states = client.events.GAME_STATE_UPDATE || [];
    assert.ok(states.length > 0, `${label} must receive public GAME_STATE_UPDATE`);
    const latest = states[states.length - 1];
    assert.strictEqual(latest.players.length, 3, "Public state lists all 3 players");

    for (const pubPlayer of latest.players) {
      assert.strictEqual(pubPlayer.hand, undefined, "Public player must NOT expose hand");
      assert.strictEqual(pubPlayer.cards, undefined, "Public player must NOT expose cards");
      assert.strictEqual(pubPlayer.cardCount, 13, "Public player exposes only cardCount=13");
    }

    const serialized = JSON.stringify(latest);
    for (const privateCardId of allPrivateIds) {
      assert.strictEqual(
        serialized.includes(privateCardId),
        false,
        `SECURITY LEAK: Private card ID ${privateCardId} leaked in ${label}'s public GAME_STATE_UPDATE!`
      );
    }
  }

  // -------------------------------------------------------------------------
  // CHECK 3: Reconnecting player receives ONLY their own private hand
  // -------------------------------------------------------------------------
  const aliceUpdatesBeforeReconnect = cAlice.events.PRIVATE_HAND_UPDATE.length;
  const charlieUpdatesBeforeReconnect = cCharlie.events.PRIVATE_HAND_UPDATE.length;
  const originalBobIds = bobHandUpdate.cards.map((c) => c.id);

  cBob.socket.disconnect();
  await new Promise((r) => setTimeout(r, 200));

  const cBobReconnected = await connectSocket(port, sign(bob), openSockets);
  cBobReconnected.events.PRIVATE_HAND_UPDATE = [];
  cBobReconnected.socket.emit("JOIN_ROOM", { roomCode });

  const bobRestored = await waitForEvent(
    cBobReconnected.events.PRIVATE_HAND_UPDATE,
    0,
    4000,
    "Bob reconnected PRIVATE_HAND_UPDATE"
  );
  await new Promise((r) => setTimeout(r, 150));

  assert.strictEqual(bobRestored.playerId, bob.id, "Reconnected hand belongs to Bob");
  assert.deepStrictEqual(
    bobRestored.cards.map((c) => c.id),
    originalBobIds,
    "Reconnecting Bob receives his exact original 13-card hand"
  );
  assert.strictEqual(
    cAlice.events.PRIVATE_HAND_UPDATE.length,
    aliceUpdatesBeforeReconnect,
    "Alice must NOT receive Bob's private hand on Bob's reconnect"
  );
  assert.strictEqual(
    cCharlie.events.PRIVATE_HAND_UPDATE.length,
    charlieUpdatesBeforeReconnect,
    "Charlie must NOT receive Bob's private hand on Bob's reconnect"
  );

  // -------------------------------------------------------------------------
  // CHECK 4: Real RoomManager rejects out-of-turn draw, unowned discard,
  //          and forged declaration
  // -------------------------------------------------------------------------
  const currentState = cAlice.events.GAME_STATE_UPDATE.slice(-1)[0];
  const turnPlayerId = currentState.currentTurnPlayerId;
  const playersById = new Map([
    [alice.id, { user: alice, client: cAlice, cards: aliceHandUpdate.cards }],
    [bob.id, { user: bob, client: cBobReconnected, cards: bobRestored.cards }],
    [charlie.id, { user: charlie, client: cCharlie, cards: charlieHandUpdate.cards }],
  ]);

  const activeEntry = playersById.get(turnPlayerId);
  const nonTurnEntry = Array.from(playersById.values()).find(
    (entry) => entry.user.id !== turnPlayerId
  );
  assert.ok(activeEntry && nonTurnEntry, "Found active and non-turn players");

  // 4a. Out-of-turn draw rejected
  const nonTurnErrors =
    nonTurnEntry.client.events.ERROR || (nonTurnEntry.client.events.ERROR = []);
  const errCountBeforeDraw = nonTurnErrors.length;
  nonTurnEntry.client.socket.emit("DRAW_CARD", { source: "CLOSED" });
  const drawErr = await waitForEvent(
    nonTurnErrors,
    errCountBeforeDraw,
    3000,
    "Out-of-turn DRAW_CARD ERROR"
  );
  assert.match(
    drawErr.message,
    /not your turn/i,
    `Expected out-of-turn error, got: ${drawErr.message}`
  );

  // Active player legitimately draws from closed deck (now 14 cards, DISCARD phase)
  const activeHandUpdates =
    activeEntry.client.events.PRIVATE_HAND_UPDATE ||
    (activeEntry.client.events.PRIVATE_HAND_UPDATE = []);
  const handCountBeforeDraw = activeHandUpdates.length;
  activeEntry.client.socket.emit("DRAW_CARD", { source: "CLOSED" });
  const drawnHandUpdate = await waitForEvent(
    activeHandUpdates,
    handCountBeforeDraw,
    3000,
    "Active player drawn PRIVATE_HAND_UPDATE"
  );
  assert.strictEqual(drawnHandUpdate.cards.length, 14, "Active player holds 14 cards after draw");

  // 4b. Unowned card discard rejected (attempting to discard opponent's card ID)
  const activeErrors =
    activeEntry.client.events.ERROR || (activeEntry.client.events.ERROR = []);
  const errCountBeforeDiscard = activeErrors.length;
  const stolenCardId = nonTurnEntry.cards[0].id;
  activeEntry.client.socket.emit("DISCARD_CARD", { cardId: stolenCardId });
  const discardErr = await waitForEvent(
    activeErrors,
    errCountBeforeDiscard,
    3000,
    "Unowned DISCARD_CARD ERROR"
  );
  assert.match(
    discardErr.message,
    /not found|does not belong|hand/i,
    `Expected unowned card discard rejection, got: ${discardErr.message}`
  );

  // Verify active player STILL holds all 14 cards on server
  const activeGame = roomManager.getActiveGame(roomCode);
  assert.strictEqual(
    activeGame.getPlayer(turnPlayerId).hand.length,
    14,
    "Server hand remains intact (14 cards) after rejected unowned discard"
  );

  // 4c. Forged declaration rejected (client fabricates winning suits/ranks on real/fake IDs)
  const errCountBeforeForge = activeErrors.length;
  const forgedMelds = [
    [
      { id: "FORGED_H4", suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_H5", suit: "HEARTS", rank: "5", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_H6", suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
    ],
    [
      { id: "FORGED_S7", suit: "SPADES", rank: "7", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_S8", suit: "SPADES", rank: "8", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_S9", suit: "SPADES", rank: "9", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_S10", suit: "SPADES", rank: "10", isWildJoker: false, isPrintedJoker: false },
    ],
    [
      { id: "FORGED_DK", suit: "DIAMONDS", rank: "K", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_CK", suit: "CLUBS", rank: "K", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_SK", suit: "SPADES", rank: "K", isWildJoker: false, isPrintedJoker: false },
    ],
    [
      { id: "FORGED_H2", suit: "HEARTS", rank: "2", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_D2", suit: "DIAMONDS", rank: "2", isWildJoker: false, isPrintedJoker: false },
      { id: "FORGED_C2", suit: "CLUBS", rank: "2", isWildJoker: false, isPrintedJoker: false },
    ],
  ];
  const declareCardId = drawnHandUpdate.cards[0].id;
  activeEntry.client.socket.emit("DECLARE", {
    melds: forgedMelds,
    declareCardId,
  });

  const forgeErr = await waitForEvent(
    activeErrors,
    errCountBeforeForge,
    3000,
    "Forged DECLARE ERROR"
  );
  assert.ok(forgeErr && forgeErr.message, "Forged declaration must emit ERROR");
  assert.strictEqual(
    activeGame.getPublicState().winnerId,
    undefined,
    "Forged declaration must NEVER crown a winner"
  );
  assert.strictEqual(
    activeGame.getPublicState().status,
    "PLAYING",
    "Game remains PLAYING after forged declaration rejection"
  );
  assert.strictEqual(
    activeGame.getPlayer(turnPlayerId).hand.length,
    14,
    "Server hand remains 14 cards after forged-ID declaration rejection"
  );

  // 4d. Forged card VALUES using the player's own real card IDs (mutating suit/rank to fake a winning hand)
  // Server must look up authoritative server card objects by ID, reject the invalid declaration, and never crown winner
  const remaining13RealIds = drawnHandUpdate.cards.slice(1).map((c) => c.id);
  const forgedValueMelds = [
    [
      { id: remaining13RealIds[0], suit: "HEARTS", rank: "4", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[1], suit: "HEARTS", rank: "5", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[2], suit: "HEARTS", rank: "6", isWildJoker: false, isPrintedJoker: false },
    ],
    [
      { id: remaining13RealIds[3], suit: "SPADES", rank: "7", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[4], suit: "SPADES", rank: "8", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[5], suit: "SPADES", rank: "9", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[6], suit: "SPADES", rank: "10", isWildJoker: false, isPrintedJoker: false },
    ],
    [
      { id: remaining13RealIds[7], suit: "DIAMONDS", rank: "K", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[8], suit: "CLUBS", rank: "K", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[9], suit: "SPADES", rank: "K", isWildJoker: false, isPrintedJoker: false },
    ],
    [
      { id: remaining13RealIds[10], suit: "HEARTS", rank: "2", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[11], suit: "DIAMONDS", rank: "2", isWildJoker: false, isPrintedJoker: false },
      { id: remaining13RealIds[12], suit: "CLUBS", rank: "2", isWildJoker: false, isPrintedJoker: false },
    ],
  ];
  // Guarantee real server cards cannot accidentally be a valid winning hand (replace with known non-winning cards)
  const mkReal = (id, suit, rank) => ({ id, suit, rank, isWildJoker: false, isPrintedJoker: false });
  const serverHand = activeGame.getPlayer(turnPlayerId).hand;
  const fixedNonWinningCards = [
    mkReal(declareCardId, "CLUBS", "9"),
    mkReal(remaining13RealIds[0], "HEARTS", "2"),
    mkReal(remaining13RealIds[1], "CLUBS", "5"),
    mkReal(remaining13RealIds[2], "DIAMONDS", "8"),
    mkReal(remaining13RealIds[3], "SPADES", "J"),
    mkReal(remaining13RealIds[4], "HEARTS", "K"),
    mkReal(remaining13RealIds[5], "CLUBS", "3"),
    mkReal(remaining13RealIds[6], "DIAMONDS", "6"),
    mkReal(remaining13RealIds[7], "SPADES", "9"),
    mkReal(remaining13RealIds[8], "HEARTS", "Q"),
    mkReal(remaining13RealIds[9], "CLUBS", "4"),
    mkReal(remaining13RealIds[10], "DIAMONDS", "7"),
    mkReal(remaining13RealIds[11], "SPADES", "10"),
    mkReal(remaining13RealIds[12], "HEARTS", "A"),
  ];
  serverHand.splice(0, serverHand.length, ...fixedNonWinningCards);

  const errCountBeforeValueForge = activeErrors.length;
  activeEntry.client.socket.emit("DECLARE", {
    melds: forgedValueMelds,
    declareCardId,
  });
  const valueForgeErr = await waitForEvent(
    activeErrors,
    errCountBeforeValueForge,
    3000,
    "Forged-value DECLARE ERROR"
  );
  assert.ok(valueForgeErr && valueForgeErr.message, "Forged-value declaration must emit ERROR");
  assert.strictEqual(
    activeGame.getPublicState().winnerId,
    undefined,
    "Forged-value declaration must NEVER crown a winner"
  );
});
