// ============================================================================
// Phase 1 Security, Startup (.env), & Database Integrity Regression Tests
// Boots the real compiled backend (server/dist/index.js) using ONLY a .env
// file (no shell-exported secrets) and verifies all Phase 1 fixes end-to-end.
// ============================================================================

const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const { io: ClientIO } = require("socket.io-client");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SERVER_ENTRY = path.join(REPO_ROOT, "server", "dist", "index.js");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function httpReq(port, method, urlPath, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined && body !== null ? JSON.stringify(body) : "";
    const headers = { ...extraHeaders };
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers,
        timeout: 8000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed = raw;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            // keep raw
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timeout")));
    if (data) req.write(data);
    req.end();
  });
}

function connectSocket(port, token) {
  return new Promise((resolve, reject) => {
    const socket = ClientIO(`http://127.0.0.1:${port}`, {
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
    });
    const events = [];
    socket.onAny((ev, data) => events.push({ ev, data }));
    socket.on("connect", () => resolve({ socket, events }));
    socket.on("connect_error", (err) => reject(err));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("Phase 1: .env-only boot, DB integrity, auth select, friends include, LiveKit authz, Socket room guards, and CORS", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rummy-phase1-"));
  const dbFile = path.join(tempDir, "phase1_custom.db");
  const port = await getFreePort();
  const allowedOrigin = "http://allowed-client.example";

  // Write ONLY a .env file in tempDir; strip all app env vars from child env!
  fs.writeFileSync(
    path.join(tempDir, ".env"),
    [
      `PORT=${port}`,
      `NODE_ENV=test`,
      `DATABASE_URL=file:${dbFile}`,
      `JWT_SECRET=phase1_dotenv_only_jwt_secret_32chars`,
      `CLIENT_URL=${allowedOrigin}`,
      `LIVEKIT_API_KEY=APIphase1key123456`,
      `LIVEKIT_API_SECRET=phase1LiveKitSecretKeyAtLeast32CharsLong`,
      `LIVEKIT_URL=wss://phase1.livekit.example`,
    ].join("\n"),
    "utf8"
  );

  const cleanEnv = { ...process.env };
  for (const k of [
    "PORT",
    "NODE_ENV",
    "DATABASE_URL",
    "JWT_SECRET",
    "CLIENT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "LIVEKIT_URL",
  ]) {
    delete cleanEnv[k];
  }

  let serverLogs = "";
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: tempDir,
    env: cleanEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => (serverLogs += d.toString()));
  child.stderr.on("data", (d) => (serverLogs += d.toString()));

  const socketsToClose = [];

  t.after(async () => {
    for (const s of socketsToClose) {
      try {
        s.disconnect();
      } catch {
        // ignore
      }
    }
    if (!child.killed) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
          resolve();
        }, 2000);
      });
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  });

  // Wait for server health endpoint
  let healthy = false;
  for (let i = 0; i < 40; i++) {
    try {
      const h = await httpReq(port, "GET", "/api/health");
      if (h.status === 200) {
        healthy = true;
        break;
      }
    } catch {
      // retry
    }
    await wait(150);
  }
  assert.strictEqual(healthy, true, `Server failed to boot with .env only. Logs:\n${serverLogs}`);

  // -------------------------------------------------------------------------
  // 1. Register users & verify .env DATABASE_URL + /api/auth/me select filter
  // -------------------------------------------------------------------------
  const regA = await httpReq(port, "POST", "/api/auth/register", {
    username: "phase1_alice",
    email: "alice@phase1.test",
    password: "Password123!",
  });
  const regB = await httpReq(port, "POST", "/api/auth/register", {
    username: "phase1_bob",
    email: "bob@phase1.test",
    password: "Password123!",
  });
  const regC = await httpReq(port, "POST", "/api/auth/register", {
    username: "phase1_carol",
    email: "carol@phase1.test",
    password: "Password123!",
  });

  assert.strictEqual(regA.status, 201, `Register A failed: ${JSON.stringify(regA.body)}`);
  assert.strictEqual(regB.status, 201, `Register B failed: ${JSON.stringify(regB.body)}`);
  assert.strictEqual(regC.status, 201, `Register C failed: ${JSON.stringify(regC.body)}`);
  assert.strictEqual(fs.existsSync(dbFile), true, "Custom DATABASE_URL from .env must be created");

  const meRes = await httpReq(port, "GET", "/api/auth/me", null, regA.body.token);
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.user.username, "phase1_alice");
  assert.strictEqual("passwordHash" in meRes.body.user, false, "GET /api/auth/me MUST NOT expose passwordHash");
  assert.strictEqual("password_hash" in meRes.body.user, false, "GET /api/auth/me MUST NOT expose password_hash");

  // -------------------------------------------------------------------------
  // 2. CORS allowlist verification
  // -------------------------------------------------------------------------
  const corsAllowed = await httpReq(port, "GET", "/api/health", null, null, {
    Origin: allowedOrigin,
  });
  assert.strictEqual(corsAllowed.headers["access-control-allow-origin"], allowedOrigin);
  assert.strictEqual(corsAllowed.headers["access-control-allow-credentials"], "true");

  const corsBlocked = await httpReq(port, "GET", "/api/health", null, null, {
    Origin: "https://evil-attacker.example",
  });
  assert.strictEqual(
    corsBlocked.headers["access-control-allow-origin"],
    undefined,
    "Disallowed origin must NOT receive Access-Control-Allow-Origin"
  );

  // -------------------------------------------------------------------------
  // 3. Friends API include verification (sender & friendUser populated)
  // -------------------------------------------------------------------------
  const reqFriend = await httpReq(
    port,
    "POST",
    "/api/friends/request",
    { username: "phase1_bob" },
    regA.body.token
  );
  assert.strictEqual(reqFriend.status, 201);

  const bobFriendsPending = await httpReq(port, "GET", "/api/friends", null, regB.body.token);
  assert.strictEqual(bobFriendsPending.status, 200);
  assert.strictEqual(bobFriendsPending.body.pendingRequests.length, 1);
  assert.strictEqual(bobFriendsPending.body.pendingRequests[0].sender.username, "phase1_alice");
  assert.strictEqual("passwordHash" in bobFriendsPending.body.pendingRequests[0].sender, false);

  const acceptRes = await httpReq(
    port,
    "POST",
    "/api/friends/respond",
    { requestId: bobFriendsPending.body.pendingRequests[0].id, action: "ACCEPT" },
    regB.body.token
  );
  assert.strictEqual(acceptRes.status, 200);

  const aliceFriends = await httpReq(port, "GET", "/api/friends", null, regA.body.token);
  assert.strictEqual(aliceFriends.status, 200);
  assert.strictEqual(aliceFriends.body.friends.length, 1);
  assert.strictEqual(aliceFriends.body.friends[0].friendUser.username, "phase1_bob");
  assert.strictEqual("passwordHash" in aliceFriends.body.friends[0].friendUser, false);

  // -------------------------------------------------------------------------
  // 4. Room creation, LiveKit authz (404 / 403 / 200), & Full-Room Socket Guard
  // -------------------------------------------------------------------------
  const roomRes = await httpReq(
    port,
    "POST",
    "/api/rooms/create",
    { roomName: "Phase 1 Secure Room", maxPlayers: 2 },
    regA.body.token
  );
  assert.strictEqual(roomRes.status, 201);
  const roomCode = roomRes.body.room.roomCode;
  assert.match(roomCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.strictEqual(roomRes.body.room.inviteUrl, `${allowedOrigin}/room/${roomCode}`);

  // LiveKit: 404 for fake room
  const lkFake = await httpReq(
    port,
    "POST",
    "/api/livekit/token",
    { roomCode: "NOPE99" },
    regA.body.token
  );
  assert.strictEqual(lkFake.status, 404, `Expected 404 for fake room, got ${lkFake.status}`);

  // LiveKit: 403 for non-member (Carol has not joined)
  const lkStranger = await httpReq(
    port,
    "POST",
    "/api/livekit/token",
    { roomCode },
    regC.body.token
  );
  assert.strictEqual(lkStranger.status, 403, `Expected 403 for non-member, got ${lkStranger.status}`);

  // Connect Alice and Bob to the 2-seat room
  const cA = await connectSocket(port, regA.body.token);
  const cB = await connectSocket(port, regB.body.token);
  const cC = await connectSocket(port, regC.body.token);
  socketsToClose.push(cA.socket, cB.socket, cC.socket);

  cA.socket.emit("JOIN_ROOM", { roomCode });
  await wait(200);
  cB.socket.emit("JOIN_ROOM", { roomCode });
  await wait(200);

  // LiveKit: 200 for active room member Bob
  const lkMember = await httpReq(
    port,
    "POST",
    "/api/livekit/token",
    { roomCode },
    regB.body.token
  );
  assert.strictEqual(lkMember.status, 200, `Expected 200 for member, got ${lkMember.status}`);
  const decodedLk = jwt.decode(lkMember.body.token);
  assert.strictEqual(decodedLk.video.room, `rummy_${roomCode}`);

  // Carol attempts to join the full 2-seat room
  cC.socket.emit("JOIN_ROOM", { roomCode });
  await wait(250);
  assert.ok(
    cC.events.some((e) => e.ev === "ERROR" && /full/i.test(e.data?.message)),
    `Expected full room error for Carol, got ${JSON.stringify(cC.events)}`
  );

  // Clear Carol's events; Bob readies up and Alice starts the game
  cC.events.length = 0;
  cB.socket.emit("TOGGLE_READY");
  await wait(200);
  cA.socket.emit("START_GAME");
  await wait(400);

  // Rejected Carol MUST receive 0 ROOM_PLAYERS_UPDATE / GAME_STATE_UPDATE / PRIVATE_HAND_UPDATE
  const carolLeaked = cC.events.filter(
    (e) =>
      e.ev === "ROOM_PLAYERS_UPDATE" ||
      e.ev === "GAME_STATE_UPDATE" ||
      e.ev === "PRIVATE_HAND_UPDATE"
  );
  assert.strictEqual(
    carolLeaked.length,
    0,
    `Full-room rejected socket leaked events: ${JSON.stringify(carolLeaked)}`
  );

  // LiveKit: Carol (still rejected) must STILL get 403
  const lkRejected = await httpReq(
    port,
    "POST",
    "/api/livekit/token",
    { roomCode },
    regC.body.token
  );
  assert.strictEqual(lkRejected.status, 403);

  // -------------------------------------------------------------------------
  // 5. Mid-game join guard on a 4-seat room with open seats
  // -------------------------------------------------------------------------
  const room2Res = await httpReq(
    port,
    "POST",
    "/api/rooms/create",
    { roomName: "MidGame Guard Room", maxPlayers: 4 },
    regA.body.token
  );
  const rc2 = room2Res.body.room.roomCode;
  const mA = await connectSocket(port, regA.body.token);
  const mB = await connectSocket(port, regB.body.token);
  const mC = await connectSocket(port, regC.body.token);
  socketsToClose.push(mA.socket, mB.socket, mC.socket);

  mA.socket.emit("JOIN_ROOM", { roomCode: rc2 });
  await wait(150);
  mB.socket.emit("JOIN_ROOM", { roomCode: rc2 });
  await wait(150);
  mB.socket.emit("TOGGLE_READY");
  await wait(150);
  mA.socket.emit("START_GAME");
  await wait(350);

  // Carol attempts to join mid-game even though 2 seats are open
  mC.events.length = 0;
  mC.socket.emit("JOIN_ROOM", { roomCode: rc2 });
  await wait(250);
  assert.ok(
    mC.events.some((e) => e.ev === "ERROR" && /already started/i.test(e.data?.message)),
    `Expected "Game has already started" error for mid-game joiner, got ${JSON.stringify(mC.events)}`
  );
  const midGameLeaks = mC.events.filter(
    (e) =>
      e.ev === "ROOM_PLAYERS_UPDATE" ||
      e.ev === "GAME_STATE_UPDATE" ||
      e.ev === "PRIVATE_HAND_UPDATE"
  );
  assert.strictEqual(midGameLeaks.length, 0, "Mid-game rejected user must receive 0 room events");
});

test("Phase 1: Strictly-typed SQLite prisma layer unit checks (create ID preservation, count number, safe update, foreign keys, nested include)", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rummy-prisma-unit-"));
  const dbPath = path.join(tempDir, "unit.db");
  const prevDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `file:${dbPath}`;

  const { prisma } = require("../dist/db/prisma");

  t.after(async () => {
    await prisma.$disconnect();
    if (prevDbUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = prevDbUrl;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  });

  // Create user + verify count() returns plain number
  const user = await prisma.user.create({
    data: {
      username: "db_unit_user",
      email: "dbunit@test.com",
      passwordHash: "$2a$10$secretHashValue",
      isGuest: false,
    },
  });

  const userCount = await prisma.user.count();
  assert.strictEqual(typeof userCount, "number");
  assert.strictEqual(userCount, 1);

  // Verify select hides passwordHash on findUnique, findFirst, findMany
  const projectedUnique = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, username: true },
  });
  assert.deepStrictEqual(Object.keys(projectedUnique).sort(), ["id", "username"]);

  const projectedFirst = await prisma.user.findFirst({
    where: { username: "db_unit_user" },
    select: { id: true, email: true },
  });
  assert.deepStrictEqual(Object.keys(projectedFirst).sort(), ["email", "id"]);

  const projectedMany = await prisma.user.findMany({
    select: { id: true, username: true },
  });
  assert.strictEqual(projectedMany.length, 1);
  assert.strictEqual("passwordHash" in projectedMany[0], false);

  // Safe update on missing row returns null without crashing
  const missingUpdate = await prisma.user.update({
    where: { id: "does-not-exist" },
    data: { username: "nope" },
  });
  assert.strictEqual(missingUpdate, null);

  // Caller-supplied id preserved on create() + PRAGMA foreign_keys = ON
  const room = await prisma.room.create({
    data: {
      roomCode: "UNIT99",
      hostId: user.id,
      roomName: "Unit Table",
      maxPlayers: 4,
    },
  });

  const customGameId = "game_UNIT99_1234567890";
  const createdGame = await prisma.game.create({
    data: {
      id: customGameId,
      roomId: room.id,
      roundNumber: 1,
      gameStatus: "IN_PROGRESS",
    },
  });
  assert.strictEqual(createdGame.id, customGameId, "create() must preserve caller-supplied id");

  // Foreign key constraint must reject orphaned game_results row
  await assert.rejects(
    async () => {
      await prisma.gameResult.create({
        data: {
          gameId: "non_existent_game_id",
          playerId: user.id,
          points: 20,
          isWinner: false,
        },
      });
    },
    /FOREIGN KEY constraint failed/i,
    "PRAGMA foreign_keys = ON must reject orphaned gameId"
  );

  // Valid gameResult + nested findMany include (matches GET /api/friends/history)
  await prisma.gameResult.create({
    data: {
      gameId: customGameId,
      playerId: user.id,
      points: 0,
      isWinner: true,
      hasDropped: false,
    },
  });

  const history = await prisma.gameResult.findMany({
    where: { playerId: user.id },
    include: {
      game: {
        include: {
          room: { select: { roomName: true, roomCode: true } },
          results: { include: { player: { select: { username: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].game.id, customGameId);
  assert.strictEqual(history[0].game.room.roomName, "Unit Table");
  assert.strictEqual(history[0].game.room.roomCode, "UNIT99");
  assert.strictEqual(history[0].game.results.length, 1);
  assert.strictEqual(history[0].game.results[0].player.username, "db_unit_user");
  assert.strictEqual("passwordHash" in history[0].game.results[0].player, false);
});
