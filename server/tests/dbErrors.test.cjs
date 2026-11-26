const assert = require("node:assert");
const test = require("node:test");
const Module = require("module");

// ---------------------------------------------------------------------------
// Mock the Prisma module before requiring roomManager, so we can simulate
// database write failures without needing @prisma/client (which is blocked
// in this sandbox by the binaries.prisma.sh TLS restriction).
// The mock object is mutable so tests can reconfigure which call throws.
// ---------------------------------------------------------------------------
const mockPrisma = {
  room: {
    findUnique: async () => ({
      id: "room-1",
      roomCode: "ABC123",
      roomName: "Test Room",
      hostId: "user-1",
      maxPlayers: 6,
      status: "WAITING",
    }),
  },
  roomPlayer: {
    upsert: async () => ({}),
  },
  game: {
    create: async () => ({}),
  },
  user: {
    findUnique: async () => ({
      id: "user-1",
      username: "Alice",
      profileImage: "",
    }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (String(request).includes("db/prisma")) {
    return { prisma: mockPrisma };
  }
  return originalLoad.apply(this, arguments);
};

// Load roomManager once (with mocked prisma)
const { RoomManager } = require("../dist/socket/roomManager");

// ---------------------------------------------------------------------------
// Mock Socket.IO Server and Socket for roomManager testing
// ---------------------------------------------------------------------------
function createMockIo() {
  return {
    to: () => ({
      emit: () => {},
    }),
  };
}

function createMockSocket(io, sid) {
  const listeners = {};

  const socket = {
    id: sid,
    handshake: { auth: {}, headers: {} },
    data: { user: { userId: "user-1", username: "Alice", isGuest: false } },
    _listeners: listeners,
    on: (event, handler) => {
      listeners[event] = handler;
    },
    emit: (event, data) => {
      if (listeners[event]) listeners[event](data);
    },
    join: () => {},
    disconnect: () => {},
  };

  return socket;
}

test("JOIN_ROOM: DB write failure for RoomPlayer upsert is caught and logged", async () => {
  // Configure mock: upsert throws
  mockPrisma.roomPlayer.upsert = async () => {
    throw new Error("DB write failed: RoomPlayer upsert");
  };
  mockPrisma.game.create = async () => ({});

  const io = createMockIo();
  const roomManager = new RoomManager(io);

  const socket = createMockSocket(io, "socket-1");
  roomManager.handleConnection(socket);

  const origError = console.error;
  let errorLogged = false;
  console.error = (...args) => {
    errorLogged = true;
  };

  // Emit JOIN_ROOM - room.findUnique returns a room, then upsert throws
  socket.emit("JOIN_ROOM", { roomCode: "ABC123" });

  // Wait a tick for async handler to complete
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(errorLogged, "DB write failure should be logged via console.error");
  console.error = origError;
});

test("START_GAME: DB write failure for Game create is caught and logged", async () => {
  // Configure mock: game.create throws, upsert succeeds
  mockPrisma.roomPlayer.upsert = async () => ({});
  mockPrisma.game.create = async () => {
    throw new Error("DB write failed: Game create");
  };

  const io = createMockIo();
  const roomManager = new RoomManager(io);

  const socket = createMockSocket(io, "socket-2");
  roomManager.handleConnection(socket);

  // First join the room (populates socketSessions and lobbyPlayers)
  mockPrisma.roomPlayer.upsert = async () => ({});
  socket.emit("JOIN_ROOM", { roomCode: "ABC123" });
  await new Promise((resolve) => setImmediate(resolve));

  // Add a second player to lobby so START_GAME passes the >=2 check
  const lobbyPlayers = roomManager.lobbyPlayers;
  const playersMap = lobbyPlayers.get("ABC123");
  playersMap.set("user-2", {
    userId: "user-2",
    username: "Bob",
    profileImage: "",
    seatNumber: 2,
    isReady: true,
    connectionStatus: "CONNECTED",
    socketId: "socket-3",
    isHost: false,
  });

  const origError = console.error;
  let errorLogged = false;
  console.error = (...args) => {
    errorLogged = true;
  };

  // Emit START_GAME - Game create throws
  socket.emit("START_GAME");

  // Wait a tick for async handler to complete
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(errorLogged, "DB write failure should be logged via console.error");
  console.error = origError;
});

// Restore original module loader
Module._load = originalLoad;
