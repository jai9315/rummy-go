// ============================================================================
// Multiplayer Socket Security & Card Privacy Penetration Test
// Runs without Prisma (uses node:sqlite sync API) to avoid network-dependent
// prisma generate step.
// ============================================================================

const assert = require("node:assert");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const jwt = require("jsonwebtoken");
const { io: ClientIO } = require("socket.io-client");
const { Server } = require("socket.io");
const { Game } = require("../dist/engine/Game");
const { v4: uuidv4 } = require("uuid");

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_privacy_test";
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL || "./prisma/dev.db";

// ---------------------------------------------------------------------------
// SQLite helpers (sync, replaces Prisma)
// ---------------------------------------------------------------------------
function openDb() {
  const db = new DatabaseSync(DATABASE_URL);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      profile_image TEXT,
      is_guest INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      room_code TEXT UNIQUE NOT NULL,
      host_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      max_players INTEGER DEFAULT 6,
      status TEXT DEFAULT 'WAITING',
      password_hash TEXT,
      round_count INTEGER DEFAULT 1,
      entry_points INTEGER DEFAULT 80,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS room_players (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      is_ready INTEGER DEFAULT 0,
      connection_status TEXT DEFAULT 'CONNECTED',
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE (room_id, user_id),
      UNIQUE (room_id, seat_number)
    );
  `);
  return db;
}

function createUser(db, username, isGuest = true) {
  const id = uuidv4();
  db.prepare(`INSERT INTO users (id, username, is_guest) VALUES (?, ?, ?)`).run(id, username, isGuest ? 1 : 0);
  return { id, username, isGuest };
}

function createRoom(db, roomCode, hostId, roomName, maxPlayers) {
  const id = uuidv4();
  db.prepare(`INSERT INTO rooms (id, room_code, host_id, room_name, max_players, status) VALUES (?, ?, ?, ?, ?, 'WAITING')`)
    .run(id, roomCode, hostId, roomName, maxPlayers);
  return { id, roomCode, hostId, roomName, maxPlayers, status: "WAITING" };
}

function addRoomPlayer(db, roomId, userId, seatNumber, isHost = false) {
  const id = uuidv4();
  db.prepare(`INSERT INTO room_players (id, room_id, user_id, seat_number, is_ready, connection_status) VALUES (?, ?, ?, ?, ?, 'CONNECTED')`)
    .run(id, roomId, userId, seatNumber, isHost ? 1 : 0);
  return { id, roomId, userId, seatNumber, isReady: isHost, connectionStatus: "CONNECTED" };
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

// ---------------------------------------------------------------------------
// In-memory room manager (minimal, no Prisma)
// ---------------------------------------------------------------------------
class TestRoomManager {
  constructor(io) {
    this.io = io;
    this.games = new Map();
    this.lobbyPlayers = new Map();
    this.userSockets = new Map();
    this.socketSessions = new Map();
    this.roomHosts = new Map(); // roomCode -> hostUserId
  }

  handleConnection(socket) {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.disconnect();
      return;
    }

    let user;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      user = { userId: decoded.userId, username: decoded.username, isGuest: decoded.isGuest };
    } catch (e) {
      socket.disconnect();
      return;
    }

    this.userSockets.set(user.userId, socket.id);

    socket.on("JOIN_ROOM", ({ roomCode }) => {
      const code = roomCode.toUpperCase();
      socket.join(`room_${code}`);
      this.socketSessions.set(socket.id, { userId: user.userId, roomCode: code });

      if (!this.lobbyPlayers.has(code)) {
        this.lobbyPlayers.set(code, new Map());
      }

      const playersMap = this.lobbyPlayers.get(code);
      let existingPlayer = playersMap.get(user.userId);

      if (existingPlayer) {
        existingPlayer.socketId = socket.id;
        existingPlayer.connectionStatus = "CONNECTED";
      } else {
        if (playersMap.size >= 6) {
          socket.emit("ERROR", { message: "Room is full" });
          return;
        }

        const takenSeats = new Set(Array.from(playersMap.values()).map((p) => p.seatNumber));
        let seat = 1;
        while (takenSeats.has(seat) && seat <= 6) seat++;

        const isHost = this.roomHosts.get(code) === user.userId;
        existingPlayer = {
          userId: user.userId,
          username: user.username,
          profileImage: "",
          seatNumber: seat,
          isReady: isHost, // host is ready by default
          connectionStatus: "CONNECTED",
          socketId: socket.id,
          isHost: isHost,
        };

        playersMap.set(user.userId, existingPlayer);
      }

      this.broadcastLobby(code);
    });

    socket.on("TOGGLE_READY", () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const { roomCode, userId } = session;
      const players = this.lobbyPlayers.get(roomCode);
      const player = players && players.get(userId);
      if (player) {
        player.isReady = !player.isReady;
        this.broadcastLobby(roomCode);
      }
    });

    socket.on("START_GAME", () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const { roomCode, userId } = session;
      const playersMap = this.lobbyPlayers.get(roomCode);
      if (!playersMap) return;

      const hostPlayer = playersMap.get(userId);
      if (!hostPlayer || !hostPlayer.isHost) {
        socket.emit("ERROR", { message: "Only the room host can start the game" });
        return;
      }

      const activePlayers = Array.from(playersMap.values());
      if (activePlayers.length < 2) {
        socket.emit("ERROR", { message: "At least 2 players are required to start" });
        return;
      }

      const notReady = activePlayers.find((p) => !p.isReady);
      if (notReady) {
        socket.emit("ERROR", { message: `Waiting for ${notReady.username} to get ready` });
        return;
      }

      const game = new Game(`game_${roomCode}_${Date.now()}`, "room_id", roomCode, {
        turnTimeLimitSeconds: 30,
        onStateUpdate: (state) => {
          this.io.to(`room_${roomCode}`).emit("GAME_STATE_UPDATE", state);
        },
        onPrivateUpdate: (playerId, cards) => {
          const targetSocketId = this.userSockets.get(playerId);
          if (targetSocketId) {
            const targetSocket = this.io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
              targetSocket.emit("PRIVATE_HAND_UPDATE", {
                type: "PRIVATE_HAND_UPDATE",
                playerId,
                cards,
                timestamp: Date.now(),
              });
            }
          }
        },
      });

      for (const p of activePlayers) {
        game.addPlayer(p.userId, p.username, p.profileImage, p.seatNumber);
        game.setPlayerReady(p.userId, true);
      }

      this.games.set(roomCode, game);
      game.startRound();
    });

    socket.on("DRAW_CARD", ({ source }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.games.get(session.roomCode);
      if (!game) return;
      try {
        game.drawCard(session.userId, source);
      } catch (e) {
        socket.emit("ERROR", { message: e.message });
      }
    });

    socket.on("DISCARD_CARD", ({ cardId }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.games.get(session.roomCode);
      if (!game) return;
      try {
        game.discardCard(session.userId, cardId);
      } catch (e) {
        socket.emit("ERROR", { message: e.message });
      }
    });

    socket.on("disconnect", () => {
      const session = this.socketSessions.get(socket.id);
      if (session) {
        const { roomCode, userId } = session;
        const players = this.lobbyPlayers.get(roomCode);
        const player = players && players.get(userId);
        if (player) player.connectionStatus = "DISCONNECTED";
        this.socketSessions.delete(socket.id);
      }
      this.userSockets.delete(user.userId);
    });
  }

  broadcastLobby(roomCode) {
    const playersMap = this.lobbyPlayers.get(roomCode);
    if (!playersMap) return;
    const playersList = Array.from(playersMap.values()).map((p) => ({
      userId: p.userId,
      username: p.username,
      profileImage: p.profileImage,
      seatNumber: p.seatNumber,
      isReady: p.isReady,
      connectionStatus: p.connectionStatus,
      isHost: p.isHost,
    }));
    this.io.to(`room_${roomCode}`).emit("ROOM_PLAYERS_UPDATE", { roomCode, players: playersList });
  }

  setRoomHost(roomCode, hostUserId) {
    this.roomHosts.set(roomCode, hostUserId);
    // If the host player is already in the lobby, mark them as host and ready
    const players = this.lobbyPlayers.get(roomCode);
    const player = players && players.get(hostUserId);
    if (player) {
      player.isHost = true;
      player.isReady = true;
      this.broadcastLobby(roomCode);
    }
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------
test("Multiplayer Socket Security & Card Privacy Penetration Test", async (t) => {
  const db = openDb();

  t.after(() => {
    db.close();
  });

  // 1. Create two test users in database
  const user1 = createUser(db, `Tester1_${Date.now()}`, true);
  const user2 = createUser(db, `Tester2_${Date.now()}`, true);

  const token1 = generateToken({ userId: user1.id, username: user1.username, isGuest: true });
  const token2 = generateToken({ userId: user2.id, username: user2.username, isGuest: true });

  // 2. Create Socket.IO server on random free port
  const http = require("http");
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    transports: ["websocket"],
  });

  const roomManager = new TestRoomManager(io);
  io.on("connection", (socket) => roomManager.handleConnection(socket));

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const testPort = httpServer.address().port;

  t.after(() => {
    httpServer.close();
  });

  // 3. Create room in database
  const roomCode = `TST${Math.floor(100 + Math.random() * 900)}`;
  const room = createRoom(db, roomCode, user1.id, "Penetration Test Table", 6);

  // Add both players as room players (user1 is host)
  addRoomPlayer(db, room.id, user1.id, 1, true);
  addRoomPlayer(db, room.id, user2.id, 2, false);

  // Set room host in the in-memory manager
  roomManager.setRoomHost(roomCode, user1.id);

  // 4. Connect both players via Socket.IO
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

  // 5. Both players join the room
  socket1.emit("JOIN_ROOM", { roomCode });
  socket2.emit("JOIN_ROOM", { roomCode });

  // Wait for players to appear in lobby
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Player 2 marks ready
  socket2.emit("TOGGLE_READY");
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 6. Setup event interception to verify card privacy
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

  // 7. Host starts the game
  socket1.emit("START_GAME");

  // Wait for game start events (with timeout)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Game start timeout - no PRIVATE_HAND_UPDATE received")), 5000);
    const check = setInterval(() => {
      if (player1PrivateCards && player2PrivateCards && interceptedPublicStates.length > 0) {
        clearInterval(check);
        clearTimeout(timeout);
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

  nonTurnSocket.emit("DRAW_CARD", { source: "CLOSED" });
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.ok(errorReceived, "Server must reject action from player when it is not their turn");
  assert.match(errorReceived.message, /Not your turn/i);

  socket1.disconnect();
  socket2.disconnect();
  io.close();
  httpServer.close(() => {
    process.exit(0);
  });
});
