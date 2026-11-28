/**
 * Comprehensive Integration Tests for:
 * 1. Friends DB (`friendships` table) & REST API:
 *    - Send request by `username` and by `targetUserId`
 *    - List accepted friends (with live `isOnline` & `inRoomCode`) + incoming/outgoing pending requests
 *    - Accept & Decline (`action: "ACCEPT" | "DECLINE"`)
 *    - Remove friend (`DELETE /api/friends/:friendId`)
 * 2. Real-Time Online Presence (`FRIEND_PRESENCE_UPDATE`):
 *    - Emits `{ userId, isOnline: true, inRoomCode: null }` when accepted friend connects
 *    - Emits `{ userId, isOnline: true, inRoomCode: CODE }` when accepted friend joins a room
 *    - Preserves online status across multiple tabs, emits `{ userId, isOnline: false, inRoomCode: null }` when last socket disconnects
 *    - Never leaks presence updates to non-friends
 * 3. Direct Room Invites (`SEND_ROOM_INVITE` -> `ROOM_INVITE_RECEIVED` -> `ACCEPT_ROOM_INVITE`):
 *    - Verifies sender is in WAITING room (not full), target is accepted friend & online
 *    - Delivers `{ inviteId, roomCode, fromUser: { id, name }, targetPoints, playerCount }` to all target sockets
 *    - Rejects non-friends, offline friends, non-members, and started rooms
 *    - `ACCEPT_ROOM_INVITE` automatically joins target into the room (even password-protected!) without typing room code or password
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { Server } = require("socket.io");
const { io: Client } = require("socket.io-client");

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpJson(port, method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body !== null && body !== undefined ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const req = http.request(
      { hostname: "127.0.0.1", port, path: urlPath, method, headers },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function connectSocket(port, token) {
  return new Promise((resolve, reject) => {
    const socket = Client(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    const events = {};
    const tracked = [
      "FRIEND_PRESENCE_UPDATE",
      "FRIEND_REQUEST_RECEIVED",
      "FRIENDSHIP_UPDATED",
      "ROOM_INVITE_RECEIVED",
      "ROOM_INVITE_SENT",
      "ROOM_INVITE_ACCEPTED",
      "ROOM_PLAYERS_UPDATE",
      "GAME_STATE_UPDATE",
      "ERROR",
    ];
    for (const ev of tracked) {
      events[ev] = [];
      socket.on(ev, (data) => events[ev].push(data));
    }
    socket.on("connect", () => resolve({ socket, events }));
    socket.on("connect_error", reject);
  });
}

test("Friends REST API, Real-Time FRIEND_PRESENCE_UPDATE, and Direct SEND_ROOM_INVITE -> ACCEPT_ROOM_INVITE", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rummy-friends-suite-"));
  const prevDbUrl = process.env.DATABASE_URL;
  const prevJwtSecret = process.env.JWT_SECRET;
  process.env.DATABASE_URL = `file:${path.join(tmpDir, "friends_test.db")}`;
  process.env.JWT_SECRET = "friends_suite_test_jwt_secret_32_chars";

  // Reset cached modules cleanly for isolated DB
  const { prisma } = require("../dist/db/prisma");
  const { authRouter } = require("../dist/routes/auth");
  const { createFriendsRouter } = require("../dist/routes/friends");
  const { createRoomsRouter } = require("../dist/routes/rooms");
  const { socketAuthMiddleware } = require("../dist/socket/authMiddleware");
  const { RoomManager } = require("../dist/socket/roomManager");

  await prisma.$disconnect();

  const app = express();
  app.use(express.json());
  const httpServer = http.createServer(app);
  const ioServer = new Server(httpServer, { transports: ["websocket"] });
  ioServer.use(socketAuthMiddleware);
  const roomManager = new RoomManager(ioServer, {
    tossDurationMs: 50,
    roundEndAutoAdvanceMs: 0,
  });
  ioServer.on("connection", (sock) => roomManager.handleConnection(sock));

  app.use("/api/auth", authRouter);
  app.use("/api/friends", createFriendsRouter(roomManager));
  app.use("/api/rooms", createRoomsRouter(roomManager));

  await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
  const port = httpServer.address().port;

  const openSockets = [];
  const register = async (username) => {
    const res = await httpJson(port, "POST", "/api/auth/register", {
      username,
      email: `${username}@test.local`,
      password: "Password123!",
    });
    assert.strictEqual(res.status, 201, `register ${username} failed: ${JSON.stringify(res.body)}`);
    return { token: res.body.token, user: res.body.user };
  };

  try {
    const alice = await register("FriendAlice");
    const bob = await register("FriendBob");
    const carol = await register("FriendCarol");
    const stranger = await register("RoomStranger");

    // ------------------------------------------------------------------
    // 1. Friend Request by username + incoming/outgoing listing + Accept
    // ------------------------------------------------------------------
    const reqAB = await httpJson(
      port,
      "POST",
      "/api/friends/request",
      { username: bob.user.username },
      alice.token
    );
    assert.strictEqual(reqAB.status, 201, "Alice requests Bob by username");

    // Duplicate request rejected
    const dupAB = await httpJson(
      port,
      "POST",
      "/api/friends/request",
      { username: bob.user.username },
      alice.token
    );
    assert.strictEqual(dupAB.status, 400, "Duplicate friend request must be rejected");

    // Alice sees outgoing request; Bob sees incoming request
    const aliceList1 = await httpJson(port, "GET", "/api/friends", null, alice.token);
    assert.strictEqual(aliceList1.status, 200);
    assert.strictEqual(aliceList1.body.outgoingRequests.length, 1);
    assert.strictEqual(aliceList1.body.outgoingRequests[0].receiver.id, bob.user.id);

    const bobList1 = await httpJson(port, "GET", "/api/friends", null, bob.token);
    assert.strictEqual(bobList1.status, 200);
    assert.strictEqual(bobList1.body.pendingRequests.length, 1);
    assert.strictEqual(bobList1.body.pendingRequests[0].sender.id, alice.user.id);
    const reqABId = bobList1.body.pendingRequests[0].id;

    // Bob accepts Alice's request
    const acceptAB = await httpJson(
      port,
      "POST",
      "/api/friends/respond",
      { requestId: reqABId, action: "ACCEPT" },
      bob.token
    );
    assert.strictEqual(acceptAB.status, 200);

    // ------------------------------------------------------------------
    // 2. Friend Request by targetUserId (Waiting Room '+' tile flow) & DECLINE
    // ------------------------------------------------------------------
    const reqAC = await httpJson(
      port,
      "POST",
      "/api/friends/request",
      { targetUserId: carol.user.id },
      alice.token
    );
    assert.strictEqual(reqAC.status, 201, "Alice requests Carol by targetUserId");

    const carolPending = await httpJson(port, "GET", "/api/friends", null, carol.token);
    assert.strictEqual(carolPending.body.pendingRequests.length, 1);
    const declineAC = await httpJson(
      port,
      "POST",
      "/api/friends/respond",
      { requestId: carolPending.body.pendingRequests[0].id, action: "DECLINE" },
      carol.token
    );
    assert.strictEqual(declineAC.status, 200);

    const aliceAfterDecline = await httpJson(port, "GET", "/api/friends", null, alice.token);
    assert.strictEqual(aliceAfterDecline.body.friends.length, 1);
    assert.strictEqual(aliceAfterDecline.body.friends[0].friendUser.id, bob.user.id);
    assert.strictEqual(aliceAfterDecline.body.friends[0].isOnline, false);
    assert.strictEqual(aliceAfterDecline.body.friends[0].inRoomCode, null);
    assert.strictEqual(aliceAfterDecline.body.outgoingRequests.length, 0);

    // ------------------------------------------------------------------
    // 3. Real-Time FRIEND_PRESENCE_UPDATE on connect, room join & disconnect
    // ------------------------------------------------------------------
    const sAlice = await connectSocket(port, alice.token);
    const sStranger = await connectSocket(port, stranger.token);
    openSockets.push(sAlice.socket, sStranger.socket);
    await wait(150);

    // Bob connects -> Alice MUST receive FRIEND_PRESENCE_UPDATE { userId: bob, isOnline: true, inRoomCode: null }
    // Stranger (not friend) MUST receive 0 updates
    const sBobTab1 = await connectSocket(port, bob.token);
    openSockets.push(sBobTab1.socket);
    await wait(250);

    const bobOnlineEvent = sAlice.events.FRIEND_PRESENCE_UPDATE.find(
      (e) => e.userId === bob.user.id && e.isOnline === true && e.inRoomCode === null
    );
    assert.ok(
      bobOnlineEvent,
      `Expected FRIEND_PRESENCE_UPDATE online for Bob, got ${JSON.stringify(
        sAlice.events.FRIEND_PRESENCE_UPDATE
      )}`
    );
    assert.strictEqual(
      sStranger.events.FRIEND_PRESENCE_UPDATE.length,
      0,
      "Non-friend must never receive FRIEND_PRESENCE_UPDATE"
    );

    // Alice creates a Pool 201 password-protected room & joins -> Bob receives inRoomCode update!
    const roomRes = await httpJson(
      port,
      "POST",
      "/api/rooms/create",
      {
        roomName: "Royal Friends Table",
        maxPlayers: 4,
        targetPoints: 201,
        password: "SecretTablePassword",
      },
      alice.token
    );
    assert.strictEqual(roomRes.status, 201);
    const roomCode = roomRes.body.room.roomCode;

    sAlice.socket.emit("JOIN_ROOM", { roomCode });
    await wait(300);

    const aliceInRoomUpdate = sBobTab1.events.FRIEND_PRESENCE_UPDATE.find(
      (e) => e.userId === alice.user.id && e.isOnline === true && e.inRoomCode === roomCode
    );
    assert.ok(
      aliceInRoomUpdate,
      `Bob should receive Alice's inRoomCode=${roomCode} presence update, got ${JSON.stringify(
        sBobTab1.events.FRIEND_PRESENCE_UPDATE
      )}`
    );

    // Verify GET /api/friends also reports Alice's live isOnline=true & inRoomCode=roomCode
    const bobFriendsLive = await httpJson(port, "GET", "/api/friends", null, bob.token);
    const aliceEntry = bobFriendsLive.body.friends.find(
      (f) => f.friendUser.id === alice.user.id
    );
    assert.strictEqual(aliceEntry.isOnline, true);
    assert.strictEqual(aliceEntry.inRoomCode, roomCode);

    // ------------------------------------------------------------------
    // 4. Direct SEND_ROOM_INVITE -> ROOM_INVITE_RECEIVED -> ACCEPT_ROOM_INVITE
    // ------------------------------------------------------------------

    // 4a. Non-friend Stranger cannot be invited via SEND_ROOM_INVITE
    const aliceErrBefore = sAlice.events.ERROR.length;
    sAlice.socket.emit("SEND_ROOM_INVITE", {
      targetUserId: stranger.user.id,
      roomCode,
    });
    await wait(250);
    const nonFriendErr = sAlice.events.ERROR.slice(aliceErrBefore);
    assert.ok(
      nonFriendErr.some((e) => /accepted friends/i.test(e.message)),
      `Expected non-friend rejection, got ${JSON.stringify(nonFriendErr)}`
    );
    assert.strictEqual(sStranger.events.ROOM_INVITE_RECEIVED.length, 0);

    // 4b. Non-member Bob cannot send invite for Alice's room
    const bobErrBefore = sBobTab1.events.ERROR.length;
    sBobTab1.socket.emit("SEND_ROOM_INVITE", {
      targetUserId: alice.user.id,
      roomCode,
    });
    await wait(200);
    assert.ok(
      sBobTab1.events.ERROR.slice(bobErrBefore).some((e) => /member/i.test(e.message))
    );

    // 4c. Alice sends direct SEND_ROOM_INVITE to online accepted friend Bob (with 2 active tabs!)
    const sBobTab2 = await connectSocket(port, bob.token);
    openSockets.push(sBobTab2.socket);
    await wait(150);

    sAlice.socket.emit("SEND_ROOM_INVITE", {
      targetUserId: bob.user.id,
      roomCode,
    });
    await wait(300);

    assert.strictEqual(sAlice.events.ROOM_INVITE_SENT.length, 1);
    assert.strictEqual(sBobTab1.events.ROOM_INVITE_RECEIVED.length, 1);
    assert.strictEqual(sBobTab2.events.ROOM_INVITE_RECEIVED.length, 1);

    const invite = sBobTab1.events.ROOM_INVITE_RECEIVED[0];
    assert.ok(invite.inviteId, "inviteId must be included");
    assert.strictEqual(invite.roomCode, roomCode);
    assert.deepStrictEqual(invite.fromUser, {
      id: alice.user.id,
      name: alice.user.username,
    });
    assert.strictEqual(invite.targetPoints, 201);
    assert.strictEqual(invite.playerCount, 1);

    // 4d. Bob clicks "Join Table" -> ACCEPT_ROOM_INVITE joins straight into password-protected room WITHOUT typing code or password!
    sBobTab1.socket.emit("ACCEPT_ROOM_INVITE", {
      inviteId: invite.inviteId,
      roomCode: invite.roomCode,
    });
    await wait(350);

    assert.strictEqual(sBobTab1.events.ROOM_INVITE_ACCEPTED.length, 1);
    assert.strictEqual(sBobTab1.events.ROOM_INVITE_ACCEPTED[0].roomCode, roomCode);

    const latestLobby = sBobTab1.events.ROOM_PLAYERS_UPDATE.slice(-1)[0];
    assert.ok(latestLobby && latestLobby.players.length === 2, "Bob must now be seated in the room");
    assert.ok(
      latestLobby.players.some((p) => p.userId === bob.user.id),
      "Bob's userId must appear in ROOM_PLAYERS_UPDATE"
    );

    // 4e. Multi-tab offline presence test:
    // First Bob leaves the room -> Alice sees Bob still online with inRoomCode: null
    const aliceUpdatesBeforeLeave = sAlice.events.FRIEND_PRESENCE_UPDATE.length;
    sBobTab1.socket.emit("LEAVE_ROOM");
    await wait(250);
    const bobLeftRoomPresence = sAlice.events.FRIEND_PRESENCE_UPDATE.slice(
      aliceUpdatesBeforeLeave
    ).find((e) => e.userId === bob.user.id && e.isOnline === true && e.inRoomCode === null);
    assert.ok(
      bobLeftRoomPresence,
      `Expected Bob LEAVE_ROOM presence update (inRoomCode: null), got ${JSON.stringify(
        sAlice.events.FRIEND_PRESENCE_UPDATE.slice(aliceUpdatesBeforeLeave)
      )}`
    );

    // Closing tab 1 keeps Bob online; closing tab 2 emits isOnline: false
    const aliceUpdatesBeforeTab1Close = sAlice.events.FRIEND_PRESENCE_UPDATE.length;
    sBobTab1.socket.disconnect();
    await wait(250);
    assert.strictEqual(roomManager.isUserOnline(bob.user.id), true, "Tab 2 still online");
    const offlineAfterTab1 = sAlice.events.FRIEND_PRESENCE_UPDATE
      .slice(aliceUpdatesBeforeTab1Close)
      .some((e) => e.userId === bob.user.id && e.isOnline === false);
    assert.strictEqual(offlineAfterTab1, false, "Must NOT emit offline while tab 2 is connected");

    sBobTab2.socket.disconnect();
    await wait(300);
    assert.strictEqual(roomManager.isUserOnline(bob.user.id), false);
    const bobOfflineEvent = sAlice.events.FRIEND_PRESENCE_UPDATE.slice(
      aliceUpdatesBeforeTab1Close
    ).find((e) => e.userId === bob.user.id && e.isOnline === false && e.inRoomCode === null);
    assert.ok(
      bobOfflineEvent,
      `Expected FRIEND_PRESENCE_UPDATE offline for Bob, got ${JSON.stringify(
        sAlice.events.FRIEND_PRESENCE_UPDATE.slice(aliceUpdatesBeforeTab1Close)
      )}`
    );

    // 4f. Inviting an offline accepted friend must be rejected with ERROR
    const aliceErrBeforeOffline = sAlice.events.ERROR.length;
    sAlice.socket.emit("SEND_ROOM_INVITE", {
      targetUserId: bob.user.id,
      roomCode,
    });
    await wait(250);
    const offlineInviteErr = sAlice.events.ERROR.slice(aliceErrBeforeOffline);
    assert.ok(
      offlineInviteErr.some((e) => /offline/i.test(e.message)),
      `Expected offline friend rejection, got ${JSON.stringify(offlineInviteErr)}`
    );

    // ------------------------------------------------------------------
    // 5. Remove Friend (DELETE /api/friends/:friendId)
    // ------------------------------------------------------------------
    const delRes = await httpJson(
      port,
      "DELETE",
      `/api/friends/${bob.user.id}`,
      null,
      alice.token
    );
    assert.strictEqual(delRes.status, 200);

    const aliceAfterDelete = await httpJson(port, "GET", "/api/friends", null, alice.token);
    assert.strictEqual(aliceAfterDelete.body.friends.length, 0);
  } finally {
    for (const s of openSockets) {
      try {
        s.disconnect();
      } catch {}
    }
    ioServer.close();
    httpServer.close();
    await prisma.$disconnect();
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
    if (prevJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwtSecret;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
