/**
 * Comprehensive Unit & Socket.IO Integration Tests for all 7 Part 1 Fixes:
 * 1. Pool Points Mode (101 / 201) + automatic elimination & continuation until <= 1 active player remains.
 * 2. Dynamic Deck Count (<= 3 active players -> 1 deck 54 cards; 4-6 players -> 2 decks 108 cards).
 * 3. Per-Round Reshuffle, New Wild Joker, Circular Opening Turn, and Round-End Hand Reveal Privacy.
 * 4. Offline Player Handling (1st missed turn skip, 2nd missed turn auto-drop, mid-round reconnect wait + next-round auto-resume, 1-full-circle offline removal).
 * 5. Block New Players After Game Starts ("Game has already started") while allowing existing members to reconnect.
 * 6. Block Discarded Printed/Wild Joker Pickup from Open Pile ("Cannot pick a Joker from the Open Pile").
 * 7. Instant Rematch (RESTART_MATCH host-only in GAME_OVER) & WAITING-only KICK_PLAYER.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { io: Client } = require("socket.io-client");

const { Deck } = require("../dist/engine/Deck");
const { Game } = require("../dist/engine/Game");

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// =========================================================================
// 1. POOL POINTS MODE (101 / 201) + ELIMINATION
// =========================================================================
test("FIX 1: Pool 101 & 201 mode continues rounds automatically, eliminates >= targetPoints players, and ends only when <= 1 active survivor remains", () => {
  const game = new Game("pool-101-test", "room-pool", "POOL01", {
    targetPoints: 101,
  });
  try {
    game.addPlayer("p1", "Alice", "", 1);
    game.addPlayer("p2", "Bob", "", 2);
    game.addPlayer("p3", "Carol", "", 3);
    game.startRound();

    assert.strictEqual(game.getPublicState().targetPoints, 101);

    // Push p1 to 80 pts via wrong declaration (invalid melds), then p2 drops (+20) -> round 1 ends
    const makeInvalid = (pid) => {
      const turnId = game.getCurrentTurnPlayerId();
      assert.strictEqual(turnId, pid);
      game.drawCard(pid, "CLOSED");
      const hand = game.getPlayerCards(pid);
      const declareCard = hand[hand.length - 1];
      const rest = hand.slice(0, 13);
      return game.declare(pid, [rest], declareCard.id);
    };

    // Round 1: p1 wrong declare (+80), p2 first drop (+20) -> p3 wins round 1. Nobody >= 101 yet -> ROUND_END!
    const d1 = makeInvalid("p1");
    assert.strictEqual(d1.isValid, false);
    const r1Drop = game.drop("p2");
    assert.strictEqual(r1Drop.publicState.status, "ROUND_END", "Must stay ROUND_END while >= 2 players < 101");
    assert.strictEqual(r1Drop.publicState.players.find((p) => p.id === "p1").isEliminated, false);
    assert.strictEqual(r1Drop.publicState.players.find((p) => p.id === "p1").score, 80);

    // Round 2: opening turn rotates circularly to p2. p2 draws+discards, p3 draws+discards, p1 drops (+20 -> 100, still < 101!)
    // Actually let's give p1 another wrong declare (+80 -> 160 >= 101 -> ELIMINATED!) and p2 drops (+20 -> 40)
    game.startNextRound("pool-101-r2");
    assert.strictEqual(game.getCurrentTurnPlayerId(), "p2", "Round 2 opens with seat #2");
    game.drawCard("p2", "CLOSED");
    let h2 = game.getPlayerCards("p2");
    game.discardCard("p2", h2[h2.length - 1].id);
    game.drawCard("p3", "CLOSED");
    let h3 = game.getPlayerCards("p3");
    game.discardCard("p3", h3[h3.length - 1].id);
    makeInvalid("p1"); // p1 now 160 pts!
    const r2Drop = game.drop("p2"); // p2 middle drop +40 -> 60 pts; p3 wins round 2 -> p1 ELIMINATED, p2 & p3 survive -> ROUND_END!
    assert.strictEqual(r2Drop.publicState.status, "ROUND_END", "2 active survivors (p2=60, p3=0) remain -> ROUND_END");
    assert.strictEqual(r2Drop.publicState.players.find((p) => p.id === "p1").isEliminated, true, "p1 (>=101) must be eliminated");
    assert.strictEqual(r2Drop.publicState.players.find((p) => p.id === "p2").isEliminated, false);
    assert.strictEqual(r2Drop.publicState.players.find((p) => p.id === "p3").isEliminated, false);

    // Round 3: p1 sits out (0 cards dealt), only p2 & p3 play!
    game.startNextRound("pool-101-r3");
    assert.strictEqual(game.getPlayerCards("p1").length, 0, "Eliminated p1 sits out with 0 cards");
    assert.strictEqual(game.getPlayerCards("p2").length, 13);
    assert.strictEqual(game.getPlayerCards("p3").length, 13);
    assert.strictEqual(game.getCurrentTurnPlayerId(), "p3", "Round 3 opens with seat #3 (skipping eliminated p1)");

    // p3 draws+discards, p2 wrong declares (+80 -> 140 >= 101 -> ELIMINATED) -> ONLY p3 survives -> GAME_OVER!
    game.drawCard("p3", "CLOSED");
    h3 = game.getPlayerCards("p3");
    game.discardCard("p3", h3[h3.length - 1].id);
    const r3End = makeInvalid("p2");
    assert.strictEqual(r3End.publicState.status, "GAME_OVER", "Must end in GAME_OVER once <= 1 active player remains < targetPoints");
    assert.strictEqual(r3End.publicState.players.find((p) => p.id === "p2").isEliminated, true);
    assert.strictEqual(r3End.publicState.players.find((p) => p.id === "p3").isEliminated, false);
    assert.strictEqual(r3End.publicState.rankings[0].playerId, "p3", "Last surviving player p3 wins rank #1");
  } finally {
    game.stopTimer();
  }

  // Verify Pool 201 target stays in ROUND_END even at 120 pts
  const game201 = new Game("pool-201-test", "room-201", "POOL02", {
    targetPoints: 201,
  });
  try {
    game201.addPlayer("a", "A", "", 1);
    game201.addPlayer("b", "B", "", 2);
    game201.startRound();
    assert.strictEqual(game201.getPublicState().targetPoints, 201);
    game201.drawCard("a", "CLOSED");
    const ha = game201.getPlayerCards("a");
    const res = game201.declare("a", [ha.slice(0, 13)], ha[13].id); // +80 pts (< 201)
    assert.strictEqual(res.publicState.status, "ROUND_END");
    assert.strictEqual(res.publicState.players.find((p) => p.id === "a").isEliminated, false);
  } finally {
    game201.stopTimer();
  }
});

// =========================================================================
// 2. DYNAMIC DECK COUNT (<=3 -> 1 DECK 54 CARDS; 4-6 -> 2 DECKS 108 CARDS)
// =========================================================================
test("FIX 2: Dynamic Deck Count uses 1 deck (54 cards) for <= 3 players and 2 decks (108 cards) for 4-6 players", () => {
  const deck1 = new Deck(1);
  assert.strictEqual(deck1.count, 54, "1 deck must have 52 + 2 Printed Jokers = 54 cards");
  assert.strictEqual(deck1.deckCount, 1);

  const deck2 = new Deck(2);
  assert.strictEqual(deck2.count, 108, "2 decks must have 104 + 4 Printed Jokers = 108 cards");
  assert.strictEqual(deck2.deckCount, 2);

  for (const playerCount of [2, 3, 4, 5, 6]) {
    const g = new Game(`deck-count-${playerCount}`, "r", `DC000${playerCount}`, {
      targetPoints: 101,
    });
    try {
      for (let i = 1; i <= playerCount; i++) {
        g.addPlayer(`p${i}`, `Player${i}`, "", i);
      }
      g.startRound();
      const st = g.getPublicState();
      const expectedDecks = playerCount <= 3 ? 1 : 2;
      const expectedTotal = expectedDecks * 54;
      // dealt (playerCount * 13) + 1 wild joker cut + 1 open discard + closedDeckCount === expectedTotal
      assert.strictEqual(st.deckCount, expectedDecks, `${playerCount} players must use ${expectedDecks} deck(s)`);
      assert.strictEqual(
        playerCount * 13 + 1 + 1 + st.closedDeckCount,
        expectedTotal,
        `${playerCount} players total card conservation must equal ${expectedTotal}`
      );
    } finally {
      g.stopTimer();
    }
  }
});

// =========================================================================
// 3. PER-ROUND RESHUFFLE, CIRCULAR OPENING TURN & ROUND-END REVEAL PRIVACY
// =========================================================================
test("FIX 3: Circular opening turn (#1 -> #2 -> #3 -> #1), per-round reshuffle, and roundRevealedHands strictly hidden during PLAYING", () => {
  const game = new Game("circ-turn", "room-c", "CIRC01", { targetPoints: 101 });
  try {
    game.addPlayer("p1", "Alice", "", 1);
    game.addPlayer("p2", "Bob", "", 2);
    game.addPlayer("p3", "Carol", "", 3);
    game.startRound();

    // Round 1: seat #1 (p1) starts; roundRevealedHands MUST be undefined during PLAYING!
    let st = game.getPublicState();
    assert.strictEqual(st.currentTurnPlayerId, "p1");
    assert.strictEqual(st.roundRevealedHands, undefined, "Card privacy: roundRevealedHands must NEVER exist during PLAYING");

    // End Round 1 via drops
    game.drop("p1");
    const r1End = game.drop("p2").publicState;
    assert.strictEqual(r1End.status, "ROUND_END");
    assert.ok(r1End.roundRevealedHands && r1End.roundRevealedHands["p3"], "roundRevealedHands populated on ROUND_END");

    // Round 2: seat #2 (p2) starts; fresh 13-card hands; roundRevealedHands cleared back to undefined
    game.startNextRound("circ-r2");
    st = game.getPublicState();
    assert.strictEqual(st.currentTurnPlayerId, "p2", "Round 2 opens with #2");
    assert.strictEqual(st.roundRevealedHands, undefined, "roundRevealedHands cleared on new round");
    assert.strictEqual(st.closedDeckCount, 13, "Fresh 1-deck reshuffle for 3 players -> 13 closed cards");

    // End Round 2 via drops
    game.drop("p2");
    game.drop("p3");

    // Round 3: seat #3 (p3) starts
    game.startNextRound("circ-r3");
    assert.strictEqual(game.getCurrentTurnPlayerId(), "p3", "Round 3 opens with #3");
    game.drop("p3");
    game.drop("p1");

    // Round 4: wraps back to seat #1 (p1)
    game.startNextRound("circ-r4");
    assert.strictEqual(game.getCurrentTurnPlayerId(), "p1", "Round 4 wraps circularly back to #1");
  } finally {
    game.stopTimer();
  }
});

// =========================================================================
// 4. OFFLINE PLAYER HANDLING (SKIP 1ST -> AUTO-DROP 2ND -> REJOIN WAIT -> 1-ROUND REMOVAL)
// =========================================================================
test("FIX 4: Offline player skips 1st missed turn, auto-drops on 2nd missed turn, sits out if rejoining mid-round, and auto-resumes next round", () => {
  const removedOffline = [];
  const broadcasts = [];
  const game = new Game("offline-test", "room-off", "OFF001", {
    targetPoints: 101,
    onStateUpdate: (s) => broadcasts.push(s),
    onRemoveOfflinePlayer: (pid) => removedOffline.push(pid),
  });
  try {
    game.addPlayer("p1", "Alice", "", 1);
    game.addPlayer("p2", "Bob", "", 2);
    game.addPlayer("p3", "Carol", "", 3);
    game.startRound();

    // Bob (p2) goes offline while Alice (p1) is taking her turn
    game.setPlayerConnection("p2", "DISCONNECTED");

    // Alice draws & discards -> turn arrives at Bob -> 1st missed turn SKIPS cleanly to Carol (p3)!
    game.drawCard("p1", "CLOSED");
    let h1 = game.getPlayerCards("p1");
    game.discardCard("p1", h1[h1.length - 1].id);

    let st = game.getPublicState();
    assert.strictEqual(st.currentTurnPlayerId, "p3", "1st missed offline turn must skip Bob and advance to Carol");
    assert.strictEqual(st.players.find((p) => p.id === "p2").offlineTurnsMissed, 1);
    assert.strictEqual(st.players.find((p) => p.id === "p2").hasDropped, false);
    assert.ok(
      broadcasts.some((b) => b.lastAction?.type === "SKIP_OFFLINE" && b.lastAction?.playerId === "p2"),
      "Must broadcast SKIP_OFFLINE action when offline player is skipped on 1st missed turn"
    );

    // Carol draws & discards -> Alice draws & discards -> turn arrives at Bob a 2nd time -> AUTO-DROP!
    game.drawCard("p3", "CLOSED");
    let h3 = game.getPlayerCards("p3");
    game.discardCard("p3", h3[h3.length - 1].id);

    game.drawCard("p1", "CLOSED");
    h1 = game.getPlayerCards("p1");
    game.discardCard("p1", h1[h1.length - 1].id);

    st = game.getPublicState();
    const bobInfo = st.players.find((p) => p.id === "p2");
    assert.strictEqual(bobInfo.offlineTurnsMissed, 2);
    assert.strictEqual(bobInfo.hasDropped, true, "2nd missed offline turn must auto-drop Bob");
    assert.strictEqual(bobInfo.canPlayCurrentRound, false);
    assert.strictEqual(bobInfo.score, 20, "Offline auto-drop before drawing applies 20-pt First Drop penalty");
    assert.strictEqual(st.currentTurnPlayerId, "p3", "Turn must advance immediately to Carol after Bob auto-drops");

    // Bob reconnects mid-round -> allowed back in, but cannot play until next round
    game.setPlayerConnection("p2", "CONNECTED");
    assert.strictEqual(game.getPublicState().players.find((p) => p.id === "p2").canPlayCurrentRound, false);
    assert.throws(() => game.drawCard("p2", "CLOSED"), /next round|Not your turn/i);

    // Carol drops -> Round 1 ends -> Round 2 starts -> Bob automatically resumes!
    game.drop("p3");
    assert.strictEqual(game.status, "ROUND_END");
    game.startNextRound("offline-r2");
    const bobR2 = game.getPublicState().players.find((p) => p.id === "p2");
    assert.strictEqual(bobR2.canPlayCurrentRound, true, "Reconnected Bob must auto-resume next round");
    assert.strictEqual(bobR2.hasDropped, false);
    assert.strictEqual(bobR2.cardCount, 13);
    assert.strictEqual(removedOffline.length, 0, "Reconnected Bob must NOT be removed");

    // Now test 1-full-circle offline removal: Carol disconnects and NEVER returns for a full round
    game.setPlayerConnection("p3", "DISCONNECTED");
    // Bob drops -> Alice drops? No, 3 players: Bob drops (+20), Carol skips then auto-drops -> Round 2 ends with Carol still disconnected!
    game.drop("p2");
    // Turn is now Alice (since Carol skipped on 1st missed turn); Alice draws & discards -> Carol auto-drops -> Round 2 ends!
    game.drawCard("p1", "CLOSED");
    h1 = game.getPlayerCards("p1");
    game.discardCard("p1", h1[h1.length - 1].id);
    assert.strictEqual(game.status, "ROUND_END");

    // Starting Round 3 removes Carol who stayed offline for 1 full round
    game.startNextRound("offline-r3");
    assert.deepStrictEqual(removedOffline, ["p3"], "Player offline for 1 full circle must be removed on next round");
    assert.strictEqual(game.getPublicState().players.some((p) => p.id === "p3"), false);
  } finally {
    game.stopTimer();
  }
});

// =========================================================================
// 5. BLOCK OPEN PILE JOKER PICKUP (PRINTED & WILDCARD JOKER)
// =========================================================================
test("FIX 6: drawCard from OPEN / DISCARD rejects Printed Joker and Wildcard Joker with exact error", () => {
  const game = new Game("joker-block", "room-jk", "JKR001", { targetPoints: 101 });
  try {
    game.addPlayer("p1", "Alice", "", 1);
    game.addPlayer("p2", "Bob", "", 2);
    game.startRound();

    // Inject Printed Joker on top of Open Discard Pile
    game["discardPile"].push({
      id: "TEST_PRINTED_JOKER",
      suit: "JOKER",
      rank: "PRINTED_JOKER",
      isWildJoker: true,
      isPrintedJoker: true,
    });
    assert.throws(
      () => game.drawCard("p1", "DISCARD"),
      /Cannot pick a Joker from the Open Pile/
    );
    assert.throws(
      () => game.drawCard("p1", "OPEN"),
      /Cannot pick a Joker from the Open Pile/
    );

    // Inject Wildcard Joker (matching wildRank) on top of Open Discard Pile
    const wildRank = game.getPublicState().wildRank;
    game["discardPile"].push({
      id: "TEST_WILD_JOKER",
      suit: "HEARTS",
      rank: wildRank,
      isWildJoker: true,
      isPrintedJoker: false,
    });
    assert.throws(
      () => game.drawCard("p1", "DISCARD"),
      /Cannot pick a Joker from the Open Pile/
    );

    // Inject a normal non-joker card -> drawing from Open Pile succeeds cleanly!
    const nonWildRank = wildRank === "7" ? "8" : "7";
    game["discardPile"].push({
      id: "TEST_NORMAL_CARD",
      suit: "SPADES",
      rank: nonWildRank,
      isWildJoker: false,
      isPrintedJoker: false,
    });
    const res = game.drawCard("p1", "OPEN");
    assert.strictEqual(res.drawnCard.id, "TEST_NORMAL_CARD");
  } finally {
    game.stopTimer();
  }
});

// =========================================================================
// 6 & 7. REAL SOCKET.IO ROOM MANAGER: BLOCK JOIN AFTER START, WAITING-ONLY KICK & RESTART_MATCH
// =========================================================================
test("FIX 5 & 7: Socket.IO RoomManager blocks non-member JOIN_ROOM after start, restricts KICK_PLAYER to WAITING, and supports host-only RESTART_MATCH", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rummy-sprint7-"));
  const dbPath = path.join(tempDir, "test.db");
  process.env.DATABASE_URL = `file:${dbPath}`;

  const { prisma } = require("../dist/db/prisma");
  const { RoomManager } = require("../dist/socket/roomManager");
  const TEST_SECRET = process.env.JWT_SECRET || "sprint7_test_secret";

  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: "*" } });
  const roomManager = new RoomManager(io, {
    tossDurationMs: 0,
    roundEndAutoAdvanceMs: 0,
    turnTimeLimitSeconds: 30,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    socket.data.user = jwt.verify(token, TEST_SECRET);
    next();
  });
  io.on("connection", (socket) => roomManager.handleConnection(socket));

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = httpServer.address().port;
  const sockets = [];

  t.after(async () => {
    for (const s of sockets) s.disconnect();
    io.close();
    httpServer.close();
    await prisma.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeUser = async (name) => {
    const u = await prisma.user.create({
      data: { username: name, isGuest: true },
    });
    const token = jwt.sign({ userId: u.id, username: u.username }, TEST_SECRET);
    const events = [];
    const socket = Client(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ["websocket"],
    });
    sockets.push(socket);
    for (const ev of ["ROOM_PLAYERS_UPDATE", "GAME_STATE_UPDATE", "PRIVATE_HAND_UPDATE", "ERROR", "KICKED"]) {
      socket.on(ev, (data) => events.push({ ev, data }));
    }
    await new Promise((resolve) => socket.on("connect", resolve));
    return { user: u, token, socket, events };
  };

  const alice = await makeUser("HostAlice");
  const bob = await makeUser("PlayerBob");
  const charlie = await makeUser("IntruderCharlie");
  const kickee = await makeUser("KickTarget");

  const roomCode = "SPR701";
  await prisma.room.create({
    data: {
      roomCode,
      roomName: "Sprint 7 Table",
      hostId: alice.user.id,
      maxPlayers: 6,
      targetPoints: 20, // Low threshold so 1 first-drop hits >= 20 -> instant GAME_OVER for fast rematch test
      status: "WAITING",
    },
  });

  // 1. Join in WAITING lobby & test WAITING-only KICK_PLAYER
  alice.socket.emit("JOIN_ROOM", { roomCode });
  await wait(80);
  bob.socket.emit("JOIN_ROOM", { roomCode });
  await wait(80);
  kickee.socket.emit("JOIN_ROOM", { roomCode });
  await wait(80);

  kickee.events.length = 0;
  alice.socket.emit("KICK_PLAYER", { targetUserId: kickee.user.id });
  await wait(120);
  assert.ok(
    kickee.events.some((e) => e.ev === "KICKED"),
    "Host must be able to kick a player in WAITING lobby"
  );

  // 2. Ready up & START_GAME
  bob.socket.emit("TOGGLE_READY");
  await wait(80);
  alice.socket.emit("START_GAME");
  await wait(250);

  const latestPlaying = [...alice.events].reverse().find((e) => e.ev === "GAME_STATE_UPDATE")?.data;
  assert.strictEqual(latestPlaying.status, "PLAYING");

  // 3. Block new non-member JOIN_ROOM once game has started
  charlie.events.length = 0;
  charlie.socket.emit("JOIN_ROOM", { roomCode });
  await wait(150);
  assert.ok(
    charlie.events.some((e) => e.ev === "ERROR" && e.data?.message === "Game has already started"),
    `Non-member joining after start must receive "Game has already started", got ${JSON.stringify(charlie.events)}`
  );

  // 4. Block KICK_PLAYER during active game
  alice.events.length = 0;
  alice.socket.emit("KICK_PLAYER", { targetUserId: bob.user.id });
  await wait(100);
  assert.ok(
    alice.events.some((e) => e.ev === "ERROR" && /cannot kick/i.test(e.data?.message)),
    "KICK_PLAYER must be rejected once game has started"
  );

  // 5. Finish game -> GAME_OVER (since targetPoints=20 and 1st drop = 20 eliminates dropper!)
  const firstTurnId = latestPlaying.currentTurnPlayerId;
  const dropperSocket = firstTurnId === alice.user.id ? alice.socket : bob.socket;
  dropperSocket.emit("DROP");
  await wait(200);

  const gameOverState = [...alice.events].reverse().find((e) => e.ev === "GAME_STATE_UPDATE")?.data;
  assert.strictEqual(gameOverState.status, "GAME_OVER", "Match must end in GAME_OVER when dropper reaches targetPoints");

  // 6. Block KICK_PLAYER even during GAME_OVER (strictly WAITING lobby only)
  alice.events.length = 0;
  alice.socket.emit("KICK_PLAYER", { targetUserId: bob.user.id });
  await wait(100);
  assert.ok(
    alice.events.some((e) => e.ev === "ERROR" && /cannot kick/i.test(e.data?.message)),
    "KICK_PLAYER must be strictly restricted to WAITING lobby"
  );

  // 7. Non-host RESTART_MATCH rejected; Host RESTART_MATCH resets scores & starts fresh match in same room!
  bob.events.length = 0;
  bob.socket.emit("RESTART_MATCH");
  await wait(100);
  assert.ok(
    bob.events.some((e) => e.ev === "ERROR" && /only the room host/i.test(e.data?.message)),
    "Non-host RESTART_MATCH must be rejected"
  );

  alice.events.length = 0;
  bob.events.length = 0;
  alice.socket.emit("RESTART_MATCH");
  await wait(250);

  const rematchState = [...alice.events].reverse().find((e) => e.ev === "GAME_STATE_UPDATE")?.data;
  assert.strictEqual(rematchState.status, "PLAYING", "Host RESTART_MATCH must launch a fresh match");
  assert.strictEqual(rematchState.roundNumber, 1, "Rematch must reset roundNumber to 1");
  assert.ok(
    rematchState.players.every((p) => p.score === 0 && !p.isEliminated && p.cardCount === 13),
    "Rematch must reset all scores, clear elimination flags, and deal 13 fresh cards"
  );
});
