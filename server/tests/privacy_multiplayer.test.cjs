const assert = require("node:assert");
const test = require("node:test");
const { io: ClientIO } = require("socket.io-client");
const { app, server } = require("../dist/index");
const { generateToken } = require("../dist/routes/auth");
const { prisma } = require("../dist/db/prisma");

test("Multiplayer Socket Security & Card Privacy Penetration Test", async (t) => {
  // Listen on random free port
  await new Promise((resolve) => server.listen(0, resolve));
  const testPort = server.address().port;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  // 1. Create two test users in database
  const user1 = await prisma.user.create({
    data: {
      username: `Tester1_${Date.now()}`,
      isGuest: true,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      username: `Tester2_${Date.now()}`,
      isGuest: true,
    },
  });

  const token1 = generateToken({ userId: user1.id, username: user1.username, isGuest: true });
  const token2 = generateToken({ userId: user2.id, username: user2.username, isGuest: true });

  // 2. Connect Player 1 and Player 2 via Socket.IO
  const socket1 = ClientIO(`http://localhost:${testPort}`, {
    auth: { token: token1 },
    transports: ["websocket"],
  });

  const socket2 = ClientIO(`http://localhost:${testPort}`, {
    auth: { token: token2 },
    transports: ["websocket"],
  });

  await Promise.all([
    new Promise((resolve) => socket1.on("connect", resolve)),
    new Promise((resolve) => socket2.on("connect", resolve)),
  ]);

  // 3. Create room in database
  const roomCode = `TST${Math.floor(100 + Math.random() * 900)}`;
  const room = await prisma.room.create({
    data: {
      roomCode,
      roomName: "Penetration Test Table",
      hostId: user1.id,
      maxPlayers: 6,
      status: "WAITING",
    },
  });

  // 4. Both players join the room
  socket1.emit("JOIN_ROOM", { roomCode });
  socket2.emit("JOIN_ROOM", { roomCode });

  // Wait for players to appear in lobby
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Player 2 marks ready
  socket2.emit("TOGGLE_READY");
  await new Promise((resolve) => setTimeout(resolve, 200));

  // 5. Setup event interception to verify card privacy
  let player1PrivateCards = null;
  let player2PrivateCards = null;
  const interceptedPublicStates = [];

  socket1.on("PRIVATE_HAND_UPDATE", (data) => {
    player1PrivateCards = data.cards;
  });

  socket2.on("PRIVATE_HAND_UPDATE", (data) => {
    player2PrivateCards = data.cards;
  });

  socket1.on("GAME_STATE_UPDATE", (state) => {
    interceptedPublicStates.push(state);
  });

  // 6. Host starts the game
  socket1.emit("START_GAME");

  // Wait for game start events
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (player1PrivateCards && player2PrivateCards && interceptedPublicStates.length > 0) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  // SECURITY VERIFICATION 1: Private hand integrity
  assert.ok(player1PrivateCards, "Player 1 must receive private cards");
  assert.ok(player2PrivateCards, "Player 2 must receive private cards");
  assert.strictEqual(player1PrivateCards.length, 13, "Player 1 must have 13 cards");
  assert.strictEqual(player2PrivateCards.length, 13, "Player 2 must have 13 cards");

  // SECURITY VERIFICATION 2: Strict cross-player isolation
  const p1CardIds = new Set(player1PrivateCards.map((c) => c.id));

  // No card held by Player 1 should be held by Player 2
  for (const card of player2PrivateCards) {
    assert.strictEqual(
      p1CardIds.has(card.id),
      false,
      `SECURITY LEAK: Player 2 holds card ${card.id} which is also in Player 1 hand!`
    );
  }

  // SECURITY VERIFICATION 3: Public state leak penetration check
  const latestPublicState = interceptedPublicStates[interceptedPublicStates.length - 1];
  assert.ok(latestPublicState.players, "Public state has players array");

  for (const pubPlayer of latestPublicState.players) {
    // Under no circumstances should pubPlayer contain .hand or .cards
    assert.strictEqual(pubPlayer.hand, undefined, "Public player MUST NOT have hand field");
    assert.strictEqual(pubPlayer.cards, undefined, "Public player MUST NOT have cards field");
    assert.strictEqual(pubPlayer.cardCount, 13, "Public player only exposes card count");
  }

  // SECURITY VERIFICATION 4: Turn order enforcement
  const currentTurn = latestPublicState.currentTurnPlayerId;
  const nonTurnSocket = currentTurn === user1.id ? socket2 : socket1;

  let errorReceived = null;
  nonTurnSocket.once("ERROR", (err) => {
    errorReceived = err;
  });

  // Non-turn player attempts to draw
  nonTurnSocket.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.ok(errorReceived, "Server must reject action from player when it is not their turn");
  assert.match(errorReceived.message, /Not your turn/i);

  socket1.disconnect();
  socket2.disconnect();
});
