import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Server, Socket } from "socket.io";
import { prisma } from "../db/prisma";
import { Game } from "../engine/Game";
import { Card, PublicGameState } from "../engine/types";
import { AuthTokenPayload } from "../routes/auth";

interface ActiveLobbyPlayer {
  userId: string;
  username: string;
  profileImage: string;
  seatNumber: number;
  isReady: boolean;
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  socketId: string;
  isHost: boolean;
}

interface SocketSession {
  userId: string;
  roomCode: string;
}

interface SocketUserData {
  user?: AuthTokenPayload;
}

interface PendingRoomInvite {
  inviteId: string;
  roomCode: string;
  roomName: string;
  fromUserId: string;
  fromUsername: string;
  targetUserId: string;
  targetPoints: number;
  playerCount: number;
  expiresAt: number;
}

export interface RoomManagerOptions {
  hostDisconnectGraceMs?: number;
  turnTimeLimitSeconds?: number;
  showTimeLimitSeconds?: number;
  tossDurationMs?: number;
  roundEndAutoAdvanceMs?: number;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export class RoomManager {
  private io: Server;
  private hostDisconnectGraceMs: number;
  private turnTimeLimitSeconds: number;
  private showTimeLimitSeconds: number;
  private tossDurationMs: number;
  private roundEndAutoAdvanceMs: number;

  // roomCode -> Map of userId -> ActiveLobbyPlayer
  private lobbyPlayers: Map<string, Map<string, ActiveLobbyPlayer>> = new Map();
  // roomCode -> Game instance
  private activeGames: Map<string, Game> = new Map();
  // userId -> primary active socketId
  private userSockets: Map<string, string> = new Map();
  // Global onlineUsers map: userId -> Set of all currently connected socketIds (multi-tab safe)
  private onlineUsers: Map<string, Set<string>> = new Map();
  // inviteId -> PendingRoomInvite (60s TTL)
  private pendingRoomInvites: Map<string, PendingRoomInvite> = new Map();
  // roomCode -> Map<userId, expiresAt> direct invite pass (allows invited friend to join without password/code)
  private directInvitePasses: Map<string, Map<string, number>> = new Map();
  // roomCode -> optional custom turnTimeLimitSeconds configured at creation
  private roomTurnTimeLimits: Map<string, number> = new Map();
  // socketId -> { userId, roomCode }
  private socketSessions: Map<string, SocketSession> = new Map();
  // roundGameId -> deduplicated round-end persistence promise
  private persistRoundPromises: Map<string, Promise<void>> = new Map();
  // roomCode -> pending host transfer timeout after host disconnect
  private hostTransferTimers: Map<string, NodeJS.Timeout> = new Map();
  // roomCode -> pending auto-advance timeout after ROUND_END in Pool Points mode
  private roundEndTimers: Map<string, NodeJS.Timeout> = new Map();
  // roomCode -> Set of userIds who returned to lobby after GAME_OVER
  private returnedToLobby: Map<string, Set<string>> = new Map();

  constructor(io: Server, options: RoomManagerOptions = {}) {
    this.io = io;
    this.hostDisconnectGraceMs = options.hostDisconnectGraceMs ?? 15000;
    this.turnTimeLimitSeconds = options.turnTimeLimitSeconds ?? 30;
    this.showTimeLimitSeconds = options.showTimeLimitSeconds ?? 30;
    const envTossMs =
      process.env.TOSS_DURATION_MS !== undefined &&
      process.env.TOSS_DURATION_MS.trim() !== ""
        ? Number(process.env.TOSS_DURATION_MS)
        : NaN;
    this.tossDurationMs =
      options.tossDurationMs !== undefined
        ? Math.max(0, options.tossDurationMs)
        : !Number.isNaN(envTossMs)
        ? Math.max(0, envTossMs)
        : 3500;
    this.roundEndAutoAdvanceMs =
      options.roundEndAutoAdvanceMs !== undefined
        ? Math.max(0, options.roundEndAutoAdvanceMs)
        : process.env.NODE_ENV === "test"
        ? 0
        : 9000;
  }

  /**
   * Returns true if the given user is currently an active (connected) member
   * of the specified room in memory (lobby or ongoing game).
   */
  public isActiveMember(roomCode: string, userId: string): boolean {
    const code = roomCode.trim().toUpperCase();
    const lobbyPlayer = this.lobbyPlayers.get(code)?.get(userId);
    if (lobbyPlayer && lobbyPlayer.connectionStatus === "CONNECTED") {
      return true;
    }
    const gamePlayer = this.activeGames.get(code)?.getPlayer(userId);
    if (gamePlayer && gamePlayer.connectionStatus === "CONNECTED") {
      return true;
    }
    return false;
  }

  /**
   * Exposes the in-memory Game instance for a room (useful for tests & diagnostics).
   */
  public getActiveGame(roomCode: string): Game | undefined {
    return this.activeGames.get(roomCode.trim().toUpperCase());
  }

  /**
   * Returns true if the user currently has at least one active Socket.IO connection.
   */
  public isUserOnline(userId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  /**
   * Returns the list of all userIds currently connected via Socket.IO.
   */
  public getOnlineUserIds(): string[] {
    const online: string[] = [];
    for (const [uid, sockets] of this.onlineUsers.entries()) {
      if (sockets.size > 0) {
        online.push(uid);
      }
    }
    return online;
  }

  /**
   * Returns the roomCode the user is currently connected in, or null if not in a room.
   */
  public getUserRoomCode(userId: string): string | null {
    for (const sess of this.socketSessions.values()) {
      if (sess.userId === userId && sess.roomCode) {
        return sess.roomCode;
      }
    }
    for (const [code, playersMap] of this.lobbyPlayers.entries()) {
      const p = playersMap.get(userId);
      if (p && p.connectionStatus === "CONNECTED") {
        return code;
      }
    }
    for (const [code, game] of this.activeGames.entries()) {
      const p = game.getPlayer(userId);
      if (p && p.connectionStatus === "CONNECTED") {
        return code;
      }
    }
    return null;
  }

  /**
   * Emits a Socket.IO event to every currently active socket of `targetUserId`.
   */
  public emitToUser(targetUserId: string, event: string, payload: unknown): number {
    const socketIds = this.onlineUsers.get(targetUserId);
    if (!socketIds || socketIds.size === 0) return 0;
    let delivered = 0;
    for (const sid of socketIds) {
      const targetSocket = this.findSocketById(sid);
      if (targetSocket) {
        targetSocket.emit(event, payload);
        delivered++;
      }
    }
    return delivered;
  }

  /**
   * Broadcasts `FRIEND_PRESENCE_UPDATE` ({ userId, isOnline, inRoomCode }) to all
   * accepted friends of `userId` who are currently online.
   */
  public async broadcastPresenceToFriends(userId: string): Promise<void> {
    try {
      if (typeof prisma.friendship?.findMany !== "function") return;
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
      });
      if (!friendships || friendships.length === 0) return;

      const payload = {
        userId,
        isOnline: this.isUserOnline(userId),
        inRoomCode: this.getUserRoomCode(userId),
      };

      for (const f of friendships) {
        const friendUserId = f.requesterId === userId ? f.addresseeId : f.requesterId;
        if (friendUserId && friendUserId !== userId) {
          this.emitToUser(friendUserId, "FRIEND_PRESENCE_UPDATE", payload);
        }
      }
    } catch {
      // Best-effort presence broadcast (safe in unit tests with mocked prisma)
    }
  }

  /**
   * Notifies target user in real time when someone sends them a friend request.
   */
  public notifyFriendRequestReceived(
    targetUserId: string,
    payload: {
      requestId: string;
      fromUser: { id: string; username: string; profileImage?: string | null };
    }
  ): void {
    this.emitToUser(targetUserId, "FRIEND_REQUEST_RECEIVED", payload);
  }

  /**
   * Notifies both users when a friend request is accepted so live presence syncs immediately.
   */
  public notifyFriendshipAccepted(userAId: string, userBId: string): void {
    this.emitToUser(userAId, "FRIENDSHIP_UPDATED", { action: "ACCEPTED", friendUserId: userBId });
    this.emitToUser(userBId, "FRIENDSHIP_UPDATED", { action: "ACCEPTED", friendUserId: userAId });
    this.emitToUser(userAId, "FRIEND_PRESENCE_UPDATE", {
      userId: userBId,
      isOnline: this.isUserOnline(userBId),
      inRoomCode: this.getUserRoomCode(userBId),
    });
    this.emitToUser(userBId, "FRIEND_PRESENCE_UPDATE", {
      userId: userAId,
      isOnline: this.isUserOnline(userAId),
      inRoomCode: this.getUserRoomCode(userAId),
    });
  }

  /**
   * Notifies both users when a friendship is removed or declined.
   */
  public notifyFriendshipRemoved(userAId: string, userBId: string): void {
    this.emitToUser(userAId, "FRIENDSHIP_UPDATED", { action: "REMOVED", friendUserId: userBId });
    this.emitToUser(userBId, "FRIENDSHIP_UPDATED", { action: "REMOVED", friendUserId: userAId });
  }

  private grantDirectInvitePass(roomCode: string, userId: string): void {
    const code = roomCode.trim().toUpperCase();
    if (!this.directInvitePasses.has(code)) {
      this.directInvitePasses.set(code, new Map());
    }
    // Pass valid for 2 minutes so SPA route transition -> socket reconnect succeeds seamlessly
    this.directInvitePasses.get(code)!.set(userId, Date.now() + 120_000);
  }

  private hasDirectInvitePass(roomCode: string, userId: string): boolean {
    const code = roomCode.trim().toUpperCase();
    const roomPasses = this.directInvitePasses.get(code);
    if (!roomPasses) return false;
    const exp = roomPasses.get(userId);
    if (!exp) return false;
    if (Date.now() > exp) {
      roomPasses.delete(userId);
      return false;
    }
    return true;
  }

  private pruneExpiredInvites(): void {
    const now = Date.now();
    for (const [id, inv] of this.pendingRoomInvites.entries()) {
      if (now > inv.expiresAt) {
        this.pendingRoomInvites.delete(id);
      }
    }
  }

  /**
   * Configures a custom per-room turn timer limit (15..120 seconds).
   */
  public setRoomTurnTimeLimit(roomCode: string, seconds: number): void {
    const clamped = Math.min(120, Math.max(15, Math.floor(seconds)));
    this.roomTurnTimeLimits.set(roomCode.trim().toUpperCase(), clamped);
  }

  public getRoomTurnTimeLimit(roomCode: string): number {
    return (
      this.roomTurnTimeLimits.get(roomCode.trim().toUpperCase()) ??
      this.turnTimeLimitSeconds
    );
  }

  /**
   * Shared room-joining implementation used by both `JOIN_ROOM` and `ACCEPT_ROOM_INVITE`.
   * Returns true if the user was seated/reconnected cleanly, false if rejected.
   */
  private async joinUserToRoom(
    socket: Socket,
    user: AuthTokenPayload,
    rawCode: string,
    providedPassword?: string,
    options?: { bypassPassword?: boolean }
  ): Promise<boolean> {
    if (!rawCode) {
      socket.emit("ERROR", { message: "Invalid room code" });
      return false;
    }

    const code = rawCode.toUpperCase();
    const room = await prisma.room.findUnique({
      where: { roomCode: code },
      include: { host: true },
    });

    if (!room) {
      socket.emit("ERROR", { message: "Room not found" });
      return false;
    }

    const existingPlayersMap = this.lobbyPlayers.get(code);
    const activeGame = this.activeGames.get(code);
    const existingLobbyPlayer = existingPlayersMap?.get(user.userId);
    const existingGamePlayer = activeGame?.getPlayer(user.userId);
    const isReconnectingPlayer = Boolean(
      existingLobbyPlayer || existingGamePlayer
    );

    // Determine effective current host (in-memory host transfer takes precedence)
    const currentHostEntry = existingPlayersMap
      ? Array.from(existingPlayersMap.values()).find((p) => p.isHost)
      : undefined;
    const currentHostId = currentHostEntry?.userId ?? room.hostId;

    const bypassPassword = Boolean(
      options?.bypassPassword || this.hasDirectInvitePass(code, user.userId)
    );

    // Enforce optional room password on new non-host joins BEFORE joining channel
    if (
      room.passwordHash &&
      !isReconnectingPlayer &&
      !bypassPassword &&
      user.userId !== currentHostId
    ) {
      const pwd = typeof providedPassword === "string" ? providedPassword : "";
      if (!pwd) {
        socket.emit("ERROR", {
          message: "Room password is required",
          code: "PASSWORD_REQUIRED",
        });
        return false;
      }
      const passwordMatches = await bcrypt.compare(pwd, room.passwordHash);
      if (!passwordMatches) {
        socket.emit("ERROR", {
          message: "Incorrect room password",
          code: "INVALID_PASSWORD",
        });
        return false;
      }
    }

    // Block ANY new non-member user once status !== "WAITING".
    // Existing room members reconnecting are always permitted back in.
    if (!isReconnectingPlayer) {
      const gameHasStarted =
        (activeGame && activeGame.status !== "WAITING") ||
        room.status !== "WAITING";

      if (gameHasStarted) {
        socket.emit("ERROR", { message: "Game has already started" });
        return false;
      }

      const currentCount = existingPlayersMap?.size ?? 0;
      if (currentCount >= room.maxPlayers) {
        socket.emit("ERROR", { message: "Room is full" });
        return false;
      }
    }

    // Cleanly leave any previously joined room on this socket
    const prevSession = this.socketSessions.get(socket.id);
    if (prevSession && prevSession.roomCode !== code) {
      socket.leave(`room_${prevSession.roomCode}`);
    }

    if (!this.lobbyPlayers.has(code)) {
      this.lobbyPlayers.set(code, new Map());
    }

    const playersMap = this.lobbyPlayers.get(code)!;
    let playerEntry = playersMap.get(user.userId);

    if (playerEntry) {
      // Reconnection / dual-tab handoff to existing seat
      playerEntry.socketId = socket.id;
      playerEntry.connectionStatus = "CONNECTED";
      if (playerEntry.isHost) {
        this.clearHostTransferTimer(code);
      }
    } else {
      // Reserve the seat in memory IMMEDIATELY (before any async yield) so
      // a concurrent JOIN_ROOM for another user cannot compute the same seat
      // and violate the unique (roomId, seatNumber) constraint.
      const seat = existingGamePlayer
        ? existingGamePlayer.seatNumber
        : this.findNextAvailableSeat(playersMap, room.maxPlayers);

      const isHost = user.userId === currentHostId;
      playerEntry = {
        userId: user.userId,
        username: user.username,
        profileImage: existingGamePlayer?.profileImage || "",
        seatNumber: seat,
        isReady: isHost, // Host is ready by default
        connectionStatus: "CONNECTED",
        socketId: socket.id,
        isHost,
      };
      playersMap.set(user.userId, playerEntry);
      if (isHost) {
        this.clearHostTransferTimer(code);
      }
    }

    // Keep latest active socket mapping synced
    this.userSockets.set(user.userId, socket.id);

    // Guards passed and seat reserved — now join channel and record session
    const roomChannel = `room_${code}`;
    socket.join(roomChannel);
    this.socketSessions.set(socket.id, { userId: user.userId, roomCode: code });

    if (!existingLobbyPlayer) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
      playerEntry.profileImage =
        dbUser?.profileImage ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`;

      // Persist RoomPlayer to DB before broadcasting lobby.
      try {
        await prisma.roomPlayer.upsert({
          where: {
            roomId_userId: { roomId: room.id, userId: user.userId },
          },
          create: {
            roomId: room.id,
            userId: user.userId,
            seatNumber: playerEntry.seatNumber,
            isReady: playerEntry.isReady,
            connectionStatus: "CONNECTED",
          },
          update: {
            connectionStatus: "CONNECTED",
          },
        });
      } catch (dbErr: unknown) {
        const dbErrMsg = getErrorMessage(dbErr, String(dbErr));
        if (/unique constraint/i.test(dbErrMsg)) {
          const newSeat = this.findNextAvailableSeat(playersMap, room.maxPlayers);
          if (newSeat <= room.maxPlayers) {
            playerEntry.seatNumber = newSeat;
            playersMap.set(user.userId, playerEntry);
            try {
              await prisma.roomPlayer.upsert({
                where: {
                  roomId_userId: { roomId: room.id, userId: user.userId },
                },
                create: {
                  roomId: room.id,
                  userId: user.userId,
                  seatNumber: newSeat,
                  isReady: playerEntry.isReady,
                  connectionStatus: "CONNECTED",
                },
                update: {
                  connectionStatus: "CONNECTED",
                },
              });
            } catch (dbErr2: unknown) {
              console.error(
                `Failed to persist RoomPlayer (retry) for user ${user.userId} in room ${code}:`,
                getErrorMessage(dbErr2, String(dbErr2))
              );
            }
          } else {
            console.error(
              `Room ${code} is full — could not assign seat to user ${user.userId}`
            );
          }
        } else {
          console.error(
            `Failed to persist RoomPlayer for user ${user.userId} in room ${code}:`,
            dbErrMsg
          );
        }
      }
    } else if (typeof prisma.roomPlayer?.update === "function") {
      prisma.roomPlayer
        .update({
          where: { roomId: room.id, userId: user.userId },
          data: { connectionStatus: "CONNECTED" },
        })
        .catch(() => {});
    }

    // Broadcast updated lobby (after DB write attempt so lobby reflects persisted state)
    this.broadcastLobby(code);

    // Notify accepted friends of live inRoomCode presence update
    void this.broadcastPresenceToFriends(user.userId);

    // Check if an active game is in progress (Reconnection & Timer Resume Handling)
    const game = this.activeGames.get(code);
    const playerReturnedToLobby =
      game?.status === "GAME_OVER" &&
      this.returnedToLobby.get(code)?.has(user.userId);

    if (game && game.getPlayer(user.userId) && !playerReturnedToLobby) {
      game.setPlayerConnection(user.userId, "CONNECTED");

      // If turn/show/toss timer was paused because all players had disconnected,
      // restart it automatically on reconnect!
      if (
        (game.status === "TOSS" ||
          game.status === "PLAYING" ||
          game.status === "SHOW") &&
        !game.isTimerRunning()
      ) {
        game.resumeTimer();
      }

      const refreshedState = game.getPublicState();
      // Broadcast updated public state (connection status + restarted turnEndsAt)
      this.io.to(roomChannel).emit("GAME_STATE_UPDATE", refreshedState);
      // Also emit directly to reconnecting socket in case mock IO doesn't route room broadcasts
      socket.emit("GAME_STATE_UPDATE", refreshedState);

      // CRITICAL: Emit private cards ONLY to this player (once cards have been dealt)
      const privateCards = game.getPlayerCards(user.userId);
      if (privateCards.length > 0) {
        socket.emit("PRIVATE_HAND_UPDATE", {
          type: "PRIVATE_HAND_UPDATE",
          playerId: user.userId,
          cards: privateCards,
          timestamp: Date.now(),
        });
      }
    }

    return true;
  }

  public handleConnection(socket: Socket): void {
    const user = (socket.data as SocketUserData).user;
    if (!user) {
      socket.disconnect();
      return;
    }

    const wasOffline = !this.isUserOnline(user.userId);
    this.userSockets.set(user.userId, socket.id);
    if (!this.onlineUsers.has(user.userId)) {
      this.onlineUsers.set(user.userId, new Set());
    }
    this.onlineUsers.get(user.userId)!.add(socket.id);

    // Notify accepted online friends when user comes online
    if (wasOffline) {
      void this.broadcastPresenceToFriends(user.userId);
    }

    // Event: JOIN_ROOM
    socket.on(
      "JOIN_ROOM",
      async (payload: { roomCode?: unknown; password?: unknown }) => {
        try {
          const rawCode =
            typeof payload?.roomCode === "string" ? payload.roomCode.trim() : "";
          const providedPassword =
            typeof payload?.password === "string" ? payload.password : undefined;
          await this.joinUserToRoom(socket, user, rawCode, providedPassword);
        } catch (err: unknown) {
          console.error("JOIN_ROOM error:", err);
          socket.emit("ERROR", {
            message: getErrorMessage(err, "Failed to join room"),
          });
        }
      }
    );

    // Event: LEAVE_ROOM
    socket.on("LEAVE_ROOM", async () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const { roomCode, userId } = session;

      socket.leave(`room_${roomCode}`);
      this.socketSessions.delete(socket.id);

      const playersMap = this.lobbyPlayers.get(roomCode);
      const leavingPlayer = playersMap?.get(userId);
      const wasHost = Boolean(leavingPlayer?.isHost);

      if (playersMap) {
        playersMap.delete(userId);
      }

      // Remove DB RoomPlayer record (best-effort)
      this.deleteRoomPlayerInDb(roomCode, userId);

      // Update active game state if applicable
      const game = this.activeGames.get(roomCode);
      if (game) {
        if (game.status === "WAITING") {
          game.removePlayer(userId);
        } else if (
          game.status === "TOSS" ||
          game.status === "PLAYING" ||
          game.status === "SHOW"
        ) {
          game.setPlayerConnection(userId, "DISCONNECTED");
          const publicState = game.getPublicState();
          this.io.to(`room_${roomCode}`).emit("GAME_STATE_UPDATE", publicState);
          const anyConnected = publicState.players.some(
            (p) => !p.hasDropped && !p.isEliminated && p.connectionStatus === "CONNECTED"
          );
          const hasActive = publicState.players.some(
            (p) => !p.hasDropped && !p.isEliminated
          );
          if (hasActive && !anyConnected) {
            game.stopTimer();
          }
        }
      }

      if (!playersMap || playersMap.size === 0) {
        this.clearHostTransferTimer(roomCode);
        this.clearRoundEndTimer(roomCode);
        this.lobbyPlayers.delete(roomCode);
        this.returnedToLobby.delete(roomCode);
        if (
          game &&
          (game.status === "WAITING" ||
            game.status === "TOSS" ||
            game.status === "GAME_OVER")
        ) {
          game.stopTimer();
          this.activeGames.delete(roomCode);
        }
      } else {
        if (wasHost) {
          await this.transferHostIfNeeded(roomCode);
        }
        this.broadcastLobby(roomCode);
      }

      socket.emit("LEFT_ROOM", { roomCode });
      void this.broadcastPresenceToFriends(userId);
    });

    // Event: KICK_PLAYER (Host only, WAITING lobby only)
    socket.on("KICK_PLAYER", async (payload: { targetUserId?: unknown }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const { roomCode, userId } = session;

      const targetUserId =
        typeof payload?.targetUserId === "string" ? payload.targetUserId.trim() : "";
      if (!targetUserId) {
        socket.emit("ERROR", { message: "Invalid player to kick" });
        return;
      }

      const playersMap = this.lobbyPlayers.get(roomCode);
      if (!playersMap) return;

      const caller = playersMap.get(userId);
      if (!caller || !caller.isHost) {
        socket.emit("ERROR", { message: "Only the room host can kick players" });
        return;
      }

      if (targetUserId === userId) {
        socket.emit("ERROR", { message: "Host cannot kick themselves" });
        return;
      }

      const activeGame = this.activeGames.get(roomCode);
      if (activeGame && activeGame.status !== "WAITING") {
        socket.emit("ERROR", {
          message: "Cannot kick players once the game has started",
        });
        return;
      }

      const targetPlayer = playersMap.get(targetUserId);
      if (!targetPlayer) {
        socket.emit("ERROR", { message: "Player not found in room" });
        return;
      }

      playersMap.delete(targetUserId);
      this.returnedToLobby.get(roomCode)?.delete(targetUserId);

      if (activeGame && activeGame.status === "WAITING") {
        activeGame.removePlayer(targetUserId);
      }

      // Remove DB RoomPlayer record (best-effort)
      this.deleteRoomPlayerInDb(roomCode, targetUserId);

      // Evict all active sockets of targetUserId from this room
      const kickedMessage = "You were kicked from the room by the host";
      const evictedSocketIds = new Set<string>();
      if (targetPlayer.socketId) {
        evictedSocketIds.add(targetPlayer.socketId);
      }
      for (const [sid, sess] of this.socketSessions.entries()) {
        if (sess.userId === targetUserId && sess.roomCode === roomCode) {
          evictedSocketIds.add(sid);
        }
      }

      for (const sid of evictedSocketIds) {
        this.socketSessions.delete(sid);
        const targetSocket = this.findSocketById(sid);
        if (targetSocket) {
          targetSocket.leave(`room_${roomCode}`);
          targetSocket.emit("KICKED", { roomCode, message: kickedMessage });
          targetSocket.emit("ERROR", { message: kickedMessage });
        }
      }
      void this.broadcastPresenceToFriends(targetUserId);

      this.broadcastLobby(roomCode);
    });

    // Event: TOGGLE_READY
    socket.on("TOGGLE_READY", async () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const { roomCode, userId } = session;
      const players = this.lobbyPlayers.get(roomCode);
      const player = players?.get(userId);
      if (player) {
        player.isReady = !player.isReady;
        const game = this.activeGames.get(roomCode);
        if (game && game.status === "WAITING") {
          game.setPlayerReady(userId, player.isReady);
        }
        this.broadcastLobby(roomCode);
      }
    });

    // Event: START_GAME (Host only)
    socket.on("START_GAME", async () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) {
        console.error("START_GAME: no session for socket", socket.id);
        return;
      }
      const { roomCode, userId } = session;
      console.log(`START_GAME: received from user ${userId} in room ${roomCode}`);

      const playersMap = this.lobbyPlayers.get(roomCode);
      if (!playersMap) {
        console.error(`START_GAME: no players map for room ${roomCode}`);
        return;
      }

      const hostPlayer = playersMap.get(userId);
      if (!hostPlayer || !hostPlayer.isHost) {
        console.error(`START_GAME: user ${userId} is not host in room ${roomCode}`);
        socket.emit("ERROR", { message: "Only the room host can start the game" });
        return;
      }

      const existingGame = this.activeGames.get(roomCode);
      if (
        existingGame &&
        existingGame.status !== "WAITING" &&
        existingGame.status !== "GAME_OVER"
      ) {
        socket.emit("ERROR", { message: "Game is already in progress" });
        return;
      }

      const activePlayers = Array.from(playersMap.values());
      console.log(
        `START_GAME: ${activePlayers.length} players in room ${roomCode}, ready states:`,
        activePlayers.map((p) => `${p.username}:${p.isReady}`).join(", ")
      );
      if (activePlayers.length < 2) {
        socket.emit("ERROR", { message: "At least 2 players are required to start" });
        return;
      }

      // Check all players ready
      const notReady = activePlayers.find((p) => !p.isReady);
      if (notReady) {
        console.error(`START_GAME: waiting for ${notReady.username} to get ready`);
        socket.emit("ERROR", {
          message: `Waiting for ${notReady.username} to get ready`,
        });
        return;
      }

      try {
        const room = await prisma.room.findUnique({ where: { roomCode } });
        if (!room) return;

        if (existingGame) {
          existingGame.stopTimer();
        }
        this.clearRoundEndTimer(roomCode);
        this.returnedToLobby.delete(roomCode);

        // Initialize Game Engine in Pool Points Mode (101 / 201 targetPoints)
        const targetPoints = room.targetPoints || 101;
        const game = new Game(`game_${roomCode}_${Date.now()}`, room.id, roomCode, {
          turnTimeLimitSeconds: this.getRoomTurnTimeLimit(roomCode),
          showTimeLimitSeconds: this.showTimeLimitSeconds,
          tossDurationMs: this.tossDurationMs,
          targetPoints,
          entryPoints: room.entryPoints,
          onStateUpdate: (state) => {
            console.log(
              `START_GAME: onStateUpdate called, status=${state.status}, round=${state.roundNumber} (Pool ${state.targetPoints}), turn=${state.currentTurnPlayerId}`
            );
            // Keep lobby seat numbers synced with toss-determined seat order
            if (state.status === "TOSS") {
              const lMap = this.lobbyPlayers.get(roomCode);
              if (lMap) {
                for (const sp of state.players) {
                  const lp = lMap.get(sp.id);
                  if (lp) lp.seatNumber = sp.seatNumber;
                }
              }
            }
            if (state.status === "ROUND_END" && game.canStartNextRound()) {
              this.scheduleAutoNextRound(roomCode, game);
              state.nextRoundEndsAt = game.getPublicState().nextRoundEndsAt;
            } else if (state.status !== "ROUND_END") {
              this.clearRoundEndTimer(roomCode);
            }
            this.io.to(`room_${roomCode}`).emit("GAME_STATE_UPDATE", state);
            if (state.status === "ROUND_END" || state.status === "GAME_OVER") {
              void this.persistRoundEnd(game, state);
            }
          },
          onPrivateUpdate: (playerId, cards) => {
            this.deliverPrivateHand(roomCode, playerId, cards);
          },
          onRemoveOfflinePlayer: (offlineUserId) => {
            const lMap = this.lobbyPlayers.get(roomCode);
            const removed = lMap?.get(offlineUserId);
            if (lMap) {
              lMap.delete(offlineUserId);
            }
            this.deleteRoomPlayerInDb(roomCode, offlineUserId);
            if (removed?.isHost) {
              void this.transferHostIfNeeded(roomCode).then(() =>
                this.broadcastLobby(roomCode)
              );
            } else {
              this.broadcastLobby(roomCode);
            }
          },
        });

        for (const p of activePlayers) {
          game.addPlayer(p.userId, p.username, p.profileImage, p.seatNumber);
          game.setPlayerReady(p.userId, true);
        }

        // Persist to DB before registering the game in memory.
        await prisma.game.create({
          data: {
            id: game.id,
            roomId: room.id,
            roundNumber: 1,
            gameStatus: "IN_PROGRESS",
          },
        });

        await prisma.room.update({
          where: { roomCode },
          data: { status: "PLAYING" },
        });

        // Only now register the game and start with the Toss phase
        this.activeGames.set(roomCode, game);
        console.log(
          `START_GAME: game ${game.id} registered in room ${roomCode} with ${activePlayers.length} players`
        );
        try {
          game.startToss();
          console.log(
            `START_GAME: game ${game.id} startToss() complete, status=${game.status}, turn=${game.getCurrentTurnPlayerId()}`
          );
        } catch (roundErr: unknown) {
          console.error(`START_GAME: game ${game.id} startToss() failed:`, roundErr);
          this.activeGames.delete(roomCode);
          throw roundErr;
        }
      } catch (err: unknown) {
        console.error("START_GAME error:", err);
        socket.emit("ERROR", {
          message: getErrorMessage(err, "Failed to start game"),
        });
      }
    });

    // Event: NEXT_ROUND (Host only, when ROUND_END and >= 2 survivors remain)
    socket.on("NEXT_ROUND", async () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const { roomCode, userId } = session;

      const playersMap = this.lobbyPlayers.get(roomCode);
      const hostPlayer = playersMap?.get(userId);
      if (!hostPlayer || !hostPlayer.isHost) {
        socket.emit("ERROR", {
          message: "Only the room host can start the next round",
        });
        return;
      }

      const game = this.activeGames.get(roomCode);
      if (!game) {
        socket.emit("ERROR", { message: "No active game found" });
        return;
      }

      if (game.status !== "ROUND_END") {
        socket.emit("ERROR", {
          message: "Next round can only be started after the current round finishes",
        });
        return;
      }

      if (!game.canStartNextRound()) {
        socket.emit("ERROR", {
          message: "Match is already complete",
        });
        return;
      }

      this.clearRoundEndTimer(roomCode);
      try {
        await this.advanceGameToNextRound(roomCode, game);
      } catch (err: unknown) {
        console.error("NEXT_ROUND error:", err);
        socket.emit("ERROR", {
          message: getErrorMessage(err, "Failed to start next round"),
        });
      }
    });

    // Event: RESTART_MATCH (Host only, allowed when GAME_OVER — instant rematch in same room)
    socket.on("RESTART_MATCH", async () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const { roomCode, userId } = session;

      const playersMap = this.lobbyPlayers.get(roomCode);
      const hostPlayer = playersMap?.get(userId);
      if (!hostPlayer || !hostPlayer.isHost) {
        socket.emit("ERROR", {
          message: "Only the room host can restart the match",
        });
        return;
      }

      const game = this.activeGames.get(roomCode);
      if (!game) {
        socket.emit("ERROR", { message: "No completed game found to restart" });
        return;
      }

      if (game.status !== "GAME_OVER") {
        socket.emit("ERROR", {
          message: "Match can only be restarted after GAME_OVER",
        });
        return;
      }

      this.clearRoundEndTimer(roomCode);
      this.returnedToLobby.delete(roomCode);

      try {
        const rematchGameId = `game_${roomCode}_rematch_${Date.now()}`;
        if (typeof prisma.game?.create === "function") {
          await prisma.game.create({
            data: {
              id: rematchGameId,
              roomId: game.roomId,
              roundNumber: 1,
              gameStatus: "IN_PROGRESS",
            },
          });
        }
        if (typeof prisma.room?.update === "function") {
          prisma.room
            .update({ where: { roomCode }, data: { status: "PLAYING" } })
            .catch(() => {});
        }
        game.restartMatch(rematchGameId);
      } catch (err: unknown) {
        console.error("RESTART_MATCH error:", err);
        socket.emit("ERROR", {
          message: getErrorMessage(err, "Failed to restart match"),
        });
      }
    });

    // Event: RETURN_TO_LOBBY (Returns player to room lobby without leaving the room)
    socket.on("RETURN_TO_LOBBY", () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const { roomCode, userId } = session;

      const playersMap = this.lobbyPlayers.get(roomCode);
      const player = playersMap?.get(userId);
      if (player) {
        player.isReady = player.isHost;
      }

      const game = this.activeGames.get(roomCode);
      if (game && game.status === "GAME_OVER") {
        if (!this.returnedToLobby.has(roomCode)) {
          this.returnedToLobby.set(roomCode, new Set());
        }
        this.returnedToLobby.get(roomCode)!.add(userId);

        if (playersMap) {
          const allConnectedReturned = Array.from(playersMap.values())
            .filter((p) => p.connectionStatus === "CONNECTED")
            .every((p) => this.returnedToLobby.get(roomCode)!.has(p.userId));
          if (allConnectedReturned) {
            this.clearRoundEndTimer(roomCode);
            game.stopTimer();
            this.activeGames.delete(roomCode);
            this.returnedToLobby.delete(roomCode);
            if (typeof prisma.room?.update === "function") {
              prisma.room
                .update({ where: { roomCode }, data: { status: "WAITING" } })
                .catch(() => {});
            }
          }
        }
      }

      this.broadcastLobby(roomCode);
      socket.emit("RETURNED_TO_LOBBY", { roomCode });
    });

    // Event: DRAW_CARD
    socket.on("DRAW_CARD", ({ source }: { source: "CLOSED" | "DISCARD" | "OPEN" }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.activeGames.get(session.roomCode);
      if (!game) return;

      try {
        game.drawCard(session.userId, source);
      } catch (err: unknown) {
        socket.emit("ERROR", {
          message: getErrorMessage(err, "Invalid draw action"),
        });
      }
    });

    // Event: DISCARD_CARD
    socket.on("DISCARD_CARD", ({ cardId }: { cardId: string }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.activeGames.get(session.roomCode);
      if (!game) return;

      try {
        game.discardCard(session.userId, cardId);
      } catch (err: unknown) {
        socket.emit("ERROR", {
          message: getErrorMessage(err, "Invalid discard action"),
        });
      }
    });

    // Event: DECLARE
    socket.on(
      "DECLARE",
      async ({ melds, declareCardId }: { melds: Card[][]; declareCardId: string }) => {
        const session = this.socketSessions.get(socket.id);
        if (!session) return;
        const game = this.activeGames.get(session.roomCode);
        if (!game) return;

        try {
          const result = game.declare(session.userId, melds, declareCardId);
          if (!result.isValid) {
            socket.emit("ERROR", {
              message: result.reason || "Invalid declaration",
            });
          }
          if (game.status === "ROUND_END" || game.status === "GAME_OVER") {
            await this.persistRoundEnd(game, result.publicState);
          }
        } catch (err: unknown) {
          socket.emit("ERROR", {
            message: getErrorMessage(err, "Declaration failed"),
          });
        }
      }
    );

    // Event: SUBMIT_MELDS (Opponent show/meld submission during SHOW phase)
    socket.on(
      "SUBMIT_MELDS",
      async (payload: { melds?: Card[][] }) => {
        const session = this.socketSessions.get(socket.id);
        if (!session) return;
        const game = this.activeGames.get(session.roomCode);
        if (!game) return;

        try {
          const melds = Array.isArray(payload?.melds) ? payload.melds : [];
          const result = game.submitMelds(session.userId, melds);
          if (game.status === "ROUND_END" || game.status === "GAME_OVER") {
            await this.persistRoundEnd(game, result.publicState);
          }
        } catch (err: unknown) {
          socket.emit("ERROR", {
            message: getErrorMessage(err, "Failed to submit melds"),
          });
        }
      }
    );

    // Event: DROP
    socket.on("DROP", async () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.activeGames.get(session.roomCode);
      if (!game) return;

      try {
        const result = game.drop(session.userId);
        if (game.status === "ROUND_END" || game.status === "GAME_OVER") {
          await this.persistRoundEnd(game, result.publicState);
        }
      } catch (err: unknown) {
        socket.emit("ERROR", { message: getErrorMessage(err, "Drop failed") });
      }
    });

    // Event: SORT_HAND
    socket.on("SORT_HAND", ({ by }: { by: "SUIT" | "RANK" }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.activeGames.get(session.roomCode);
      if (!game) return;

      const sortBy: "SUIT" | "RANK" = by === "RANK" ? "RANK" : "SUIT";
      const sorted = game.sortPlayerHand(session.userId, sortBy);

      // Send sorted private cards ONLY to this player
      socket.emit("PRIVATE_HAND_UPDATE", {
        type: "PRIVATE_HAND_UPDATE",
        playerId: session.userId,
        cards: sorted,
        sortedBy: sortBy,
        timestamp: Date.now(),
      });
    });

    // Event: SEND_ROOM_INVITE (Strict friend-verified direct room invite — no code needed)
    socket.on(
      "SEND_ROOM_INVITE",
      async (payload: { targetUserId?: unknown; roomCode?: unknown }) => {
        try {
          this.pruneExpiredInvites();
          const targetUserId =
            typeof payload?.targetUserId === "string"
              ? payload.targetUserId.trim()
              : "";
          const rawCode =
            typeof payload?.roomCode === "string" ? payload.roomCode.trim() : "";

          if (!targetUserId || !rawCode) {
            socket.emit("ERROR", {
              message: "targetUserId and roomCode are required to send an invite",
            });
            return;
          }

          if (targetUserId === user.userId) {
            socket.emit("ERROR", { message: "Cannot invite yourself" });
            return;
          }

          const code = rawCode.toUpperCase();
          if (!this.isActiveMember(code, user.userId)) {
            socket.emit("ERROR", {
              message: "You must be an active member of the room to invite friends",
            });
            return;
          }

          const room = await prisma.room.findUnique({ where: { roomCode: code } });
          if (!room) {
            socket.emit("ERROR", { message: "Room not found" });
            return;
          }

          const activeGame = this.activeGames.get(code);
          if (
            room.status !== "WAITING" ||
            (activeGame && activeGame.status !== "WAITING")
          ) {
            socket.emit("ERROR", {
              message: "Cannot invite friends once the game has already started",
            });
            return;
          }

          const playersMap = this.lobbyPlayers.get(code);
          const currentPlayerCount = playersMap?.size ?? 0;
          const roomCap = Math.min(room.maxPlayers || 6, 6);
          if (currentPlayerCount >= roomCap) {
            socket.emit("ERROR", { message: "Room is already full" });
            return;
          }

          if (playersMap?.has(targetUserId)) {
            socket.emit("ERROR", {
              message: "This friend is already seated in the room",
            });
            return;
          }

          // Verify targetUserId is an ACCEPTED friend
          const friendship = await prisma.friendship.findFirst({
            where: {
              status: "ACCEPTED",
              OR: [
                { requesterId: user.userId, addresseeId: targetUserId },
                { requesterId: targetUserId, addresseeId: user.userId },
              ],
            },
          });

          if (!friendship) {
            socket.emit("ERROR", {
              message: "You can only send direct room invites to accepted friends",
            });
            return;
          }

          if (!this.isUserOnline(targetUserId)) {
            socket.emit("ERROR", { message: "Friend is currently offline" });
            return;
          }

          const inviteId = crypto.randomUUID();
          const targetPoints = room.targetPoints ?? 101;
          const pendingInvite: PendingRoomInvite = {
            inviteId,
            roomCode: room.roomCode,
            roomName: room.roomName,
            fromUserId: user.userId,
            fromUsername: user.username,
            targetUserId,
            targetPoints,
            playerCount: currentPlayerCount,
            expiresAt: Date.now() + 60_000,
          };
          this.pendingRoomInvites.set(inviteId, pendingInvite);
          this.grantDirectInvitePass(room.roomCode, targetUserId);

          const invitePayload = {
            inviteId,
            roomCode: room.roomCode,
            roomName: room.roomName,
            fromUser: { id: user.userId, name: user.username },
            fromUsername: user.username,
            fromUserId: user.userId,
            targetPoints,
            playerCount: currentPlayerCount,
            maxPlayers: room.maxPlayers,
            timestamp: Date.now(),
          };

          const delivered = this.emitToUser(
            targetUserId,
            "ROOM_INVITE_RECEIVED",
            invitePayload
          );
          if (delivered === 0) {
            this.pendingRoomInvites.delete(inviteId);
            socket.emit("ERROR", { message: "Friend is currently offline" });
            return;
          }

          const ackPayload = {
            inviteId,
            targetUserId,
            friendId: targetUserId,
            roomCode: room.roomCode,
          };
          socket.emit("ROOM_INVITE_SENT", ackPayload);
          socket.emit("INVITE_SENT", ackPayload);
        } catch (err: unknown) {
          console.error("SEND_ROOM_INVITE error:", err);
          socket.emit("ERROR", {
            message: getErrorMessage(err, "Failed to send room invitation"),
          });
        }
      }
    );

    // Event: ACCEPT_ROOM_INVITE (Instant direct join into roomCode without typing code/password)
    socket.on(
      "ACCEPT_ROOM_INVITE",
      async (payload: { inviteId?: unknown; roomCode?: unknown }) => {
        try {
          this.pruneExpiredInvites();
          const inviteId =
            typeof payload?.inviteId === "string" ? payload.inviteId.trim() : "";
          const rawCode =
            typeof payload?.roomCode === "string" ? payload.roomCode.trim() : "";

          let resolvedCode = rawCode.toUpperCase();
          let matchedInvite: PendingRoomInvite | undefined;

          if (inviteId) {
            const inv = this.pendingRoomInvites.get(inviteId);
            if (!inv || inv.targetUserId !== user.userId) {
              socket.emit("ERROR", {
                message: "Room invite has expired or is invalid",
              });
              return;
            }
            matchedInvite = inv;
            resolvedCode = inv.roomCode;
          } else if (resolvedCode) {
            for (const inv of this.pendingRoomInvites.values()) {
              if (inv.targetUserId === user.userId && inv.roomCode === resolvedCode) {
                matchedInvite = inv;
                break;
              }
            }
          }

          if (!resolvedCode) {
            socket.emit("ERROR", {
              message: "inviteId or roomCode is required to accept an invite",
            });
            return;
          }

          const hasPass =
            Boolean(matchedInvite) ||
            this.hasDirectInvitePass(resolvedCode, user.userId);
          if (!hasPass) {
            socket.emit("ERROR", {
              message: "No valid direct invitation found for this room",
            });
            return;
          }

          // Refresh direct pass so subsequent SPA route transition to /room/[code] also succeeds cleanly
          this.grantDirectInvitePass(resolvedCode, user.userId);

          const joined = await this.joinUserToRoom(
            socket,
            user,
            resolvedCode,
            undefined,
            { bypassPassword: true }
          );

          if (joined) {
            if (matchedInvite) {
              this.pendingRoomInvites.delete(matchedInvite.inviteId);
            }
            socket.emit("ROOM_INVITE_ACCEPTED", {
              inviteId: matchedInvite?.inviteId ?? inviteId,
              roomCode: resolvedCode,
            });
          }
        } catch (err: unknown) {
          console.error("ACCEPT_ROOM_INVITE error:", err);
          socket.emit("ERROR", {
            message: getErrorMessage(err, "Failed to join invited room"),
          });
        }
      }
    );

    // Event: INVITE_FRIEND (Legacy alias preserved for backwards compatibility)
    socket.on(
      "INVITE_FRIEND",
      async (payload: { friendId?: unknown; roomCode?: unknown }) => {
        try {
          this.pruneExpiredInvites();
          const friendId =
            typeof payload?.friendId === "string" ? payload.friendId.trim() : "";
          const rawCode =
            typeof payload?.roomCode === "string" ? payload.roomCode.trim() : "";

          if (!friendId || !rawCode) {
            socket.emit("ERROR", {
              message: "friendId and roomCode are required to send an invite",
            });
            return;
          }

          if (friendId === user.userId) {
            socket.emit("ERROR", { message: "Cannot invite yourself" });
            return;
          }

          const code = rawCode.toUpperCase();
          if (!this.isActiveMember(code, user.userId)) {
            socket.emit("ERROR", {
              message: "You must be an active member of the room to invite friends",
            });
            return;
          }

          const room = await prisma.room.findUnique({ where: { roomCode: code } });
          if (!room) {
            socket.emit("ERROR", { message: "Room not found" });
            return;
          }

          if (!this.isUserOnline(friendId)) {
            socket.emit("ERROR", { message: "Friend is currently offline" });
            return;
          }

          const inviteId = crypto.randomUUID();
          const currentPlayerCount = this.lobbyPlayers.get(code)?.size ?? 0;
          const targetPoints = room.targetPoints ?? 101;
          this.pendingRoomInvites.set(inviteId, {
            inviteId,
            roomCode: room.roomCode,
            roomName: room.roomName,
            fromUserId: user.userId,
            fromUsername: user.username,
            targetUserId: friendId,
            targetPoints,
            playerCount: currentPlayerCount,
            expiresAt: Date.now() + 60_000,
          });
          this.grantDirectInvitePass(room.roomCode, friendId);

          const invitePayload = {
            inviteId,
            roomCode: room.roomCode,
            roomName: room.roomName,
            fromUser: { id: user.userId, name: user.username },
            fromUsername: user.username,
            fromUserId: user.userId,
            targetPoints,
            playerCount: currentPlayerCount,
            maxPlayers: room.maxPlayers,
            timestamp: Date.now(),
          };

          const delivered = this.emitToUser(
            friendId,
            "ROOM_INVITE_RECEIVED",
            invitePayload
          );
          if (delivered === 0) {
            this.pendingRoomInvites.delete(inviteId);
            socket.emit("ERROR", { message: "Friend is currently offline" });
            return;
          }

          socket.emit("INVITE_SENT", {
            inviteId,
            friendId,
            roomCode: room.roomCode,
          });
        } catch (err: unknown) {
          console.error("INVITE_FRIEND error:", err);
          socket.emit("ERROR", {
            message: getErrorMessage(err, "Failed to send room invitation"),
          });
        }
      }
    );

    // Event: CHAT_MESSAGE (Real-time room-scoped table chat)
    socket.on("CHAT_MESSAGE", (payload: { text?: unknown }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) {
        socket.emit("ERROR", { message: "Join a room to send chat messages" });
        return;
      }
      const rawText = typeof payload?.text === "string" ? payload.text.trim() : "";
      if (!rawText) return;
      const text = rawText.slice(0, 300);

      this.io.to(`room_${session.roomCode}`).emit("CHAT_MESSAGE", {
        id: `chat_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
        roomCode: session.roomCode,
        playerId: user.userId,
        username: user.username,
        text,
        timestamp: Date.now(),
      });
    });

    // Event: SEND_REACTION (Real-time room-scoped quick emoji reaction)
    socket.on("SEND_REACTION", (payload: { emoji?: unknown }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) {
        socket.emit("ERROR", { message: "Join a room to send reactions" });
        return;
      }
      const rawEmoji = typeof payload?.emoji === "string" ? payload.emoji.trim() : "";
      if (!rawEmoji || rawEmoji.length > 8) return;

      this.io.to(`room_${session.roomCode}`).emit("SEND_REACTION", {
        id: `react_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
        roomCode: session.roomCode,
        playerId: user.userId,
        username: user.username,
        emoji: rawEmoji,
        timestamp: Date.now(),
      });
    });

    // Event: DISCONNECT
    socket.on("disconnect", () => {
      const session = this.socketSessions.get(socket.id);
      this.socketSessions.delete(socket.id);

      // Update multi-tab presence set
      const activeSet = this.onlineUsers.get(user.userId);
      if (activeSet) {
        activeSet.delete(socket.id);
        if (activeSet.size === 0) {
          this.onlineUsers.delete(user.userId);
        }
      }
      const nowOffline = !this.isUserOnline(user.userId);

      // CRITICAL: Only delete userSockets mapping if THIS disconnecting socket
      // is still the active socket for user.userId (prevents dual-tab/reconnect race).
      if (this.userSockets.get(user.userId) === socket.id) {
        const remaining = this.onlineUsers.get(user.userId);
        const fallbackSocketId = remaining ? Array.from(remaining)[remaining.size - 1] : undefined;
        if (fallbackSocketId) {
          this.userSockets.set(user.userId, fallbackSocketId);
        } else {
          this.userSockets.delete(user.userId);
        }
      }

      if (session) {
        const { roomCode, userId } = session;
        const players = this.lobbyPlayers.get(roomCode);
        const player = players?.get(userId);
        const isActivePlayerSocket = Boolean(player && player.socketId === socket.id);

        if (isActivePlayerSocket && player) {
          player.connectionStatus = "DISCONNECTED";
          if (
            typeof prisma.room?.findUnique === "function" &&
            typeof prisma.roomPlayer?.update === "function"
          ) {
            prisma.room
              .findUnique({ where: { roomCode } })
              .then((room) => {
                if (room) {
                  return prisma.roomPlayer.update({
                    where: { roomId: room.id, userId },
                    data: { connectionStatus: "DISCONNECTED" },
                  });
                }
                return null;
              })
              .catch(() => {});
          }

          if (player.isHost) {
            this.scheduleHostTransfer(roomCode, userId);
          }
        }

        const game = this.activeGames.get(roomCode);
        if (game && (!player || isActivePlayerSocket)) {
          game.setPlayerConnection(userId, "DISCONNECTED");
          const publicState = game.getPublicState();
          this.io.to(`room_${roomCode}`).emit("GAME_STATE_UPDATE", publicState);

          // Pause turn/show/toss timer if no active (non-dropped) player is connected,
          // preventing the timer from firing for an abandoned game.
          if (
            game.status === "TOSS" ||
            game.status === "PLAYING" ||
            game.status === "SHOW"
          ) {
            const anyConnected = publicState.players.some(
              (p) => !p.hasDropped && !p.isEliminated && p.connectionStatus === "CONNECTED"
            );
            const hasActive = publicState.players.some(
              (p) => !p.hasDropped && !p.isEliminated
            );
            if (hasActive && !anyConnected) {
              game.stopTimer();
            }
          }
        }

        this.broadcastLobby(roomCode);
      }

      // Broadcast real-time offline / room-exit presence update to accepted online friends
      if (nowOffline || session) {
        void this.broadcastPresenceToFriends(user.userId);
      }
    });
  }

  private findSocketById(socketId: string): Socket | undefined {
    const socketsMap = this.io.sockets?.sockets;
    if (socketsMap) {
      const direct = socketsMap.get(socketId);
      if (direct) return direct;
    }
    const rootNsSockets =
      typeof this.io.of === "function" ? this.io.of("/")?.sockets : undefined;
    if (rootNsSockets) {
      const nsMatch = rootNsSockets.get(socketId);
      if (nsMatch) return nsMatch;
    }
    return undefined;
  }

  private deliverPrivateHand(roomCode: string, playerId: string, cards: Card[]): void {
    const targetSocketId =
      this.userSockets.get(playerId) ||
      this.lobbyPlayers.get(roomCode)?.get(playerId)?.socketId;

    if (!targetSocketId) {
      console.error(`PRIVATE_HAND_UPDATE: no socket mapping for player ${playerId}`);
      return;
    }

    const targetSocket = this.findSocketById(targetSocketId);
    if (targetSocket) {
      try {
        targetSocket.emit("PRIVATE_HAND_UPDATE", {
          type: "PRIVATE_HAND_UPDATE",
          playerId,
          cards,
          timestamp: Date.now(),
        });
        console.log(
          `PRIVATE_HAND_UPDATE delivered to player ${playerId} (${cards.length} cards)`
        );
      } catch (emitErr: unknown) {
        console.error(
          `PRIVATE_HAND_UPDATE: emit failed for player ${playerId}:`,
          emitErr
        );
      }
    } else {
      console.error(
        `PRIVATE_HAND_UPDATE: socket not found for player ${playerId} (socketId: ${targetSocketId})`
      );
    }
  }

  private deleteRoomPlayerInDb(roomCode: string, userId: string): void {
    if (
      typeof prisma.room?.findUnique !== "function" ||
      typeof prisma.roomPlayer?.delete !== "function"
    ) {
      return;
    }
    prisma.room
      .findUnique({ where: { roomCode } })
      .then((room) => {
        if (room) {
          return prisma.roomPlayer.delete({
            where: { roomId_userId: { roomId: room.id, userId } },
          });
        }
        return null;
      })
      .catch(() => {});
  }

  private clearRoundEndTimer(roomCode: string): void {
    const existing = this.roundEndTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      this.roundEndTimers.delete(roomCode);
    }
    const game = this.activeGames.get(roomCode);
    if (game) {
      game.setNextRoundEndsAt(null);
    }
  }

  private scheduleAutoNextRound(roomCode: string, game: Game): void {
    this.clearRoundEndTimer(roomCode);
    if (this.roundEndAutoAdvanceMs <= 0) return;

    const deadline = Date.now() + this.roundEndAutoAdvanceMs;
    game.setNextRoundEndsAt(deadline);

    const timer = setTimeout(() => {
      this.roundEndTimers.delete(roomCode);
      if (this.activeGames.get(roomCode) === game && game.canStartNextRound()) {
        void this.advanceGameToNextRound(roomCode, game).catch((err) => {
          console.error(`Auto next-round failed for room ${roomCode}:`, err);
        });
      }
    }, this.roundEndAutoAdvanceMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
    this.roundEndTimers.set(roomCode, timer);
  }

  private async advanceGameToNextRound(roomCode: string, game: Game): Promise<void> {
    const nextRoundNumber = game.roundNumber + 1;
    const nextRoundGameId = `${game.id}_r${nextRoundNumber}_${Date.now()}`;

    if (typeof prisma.game?.create === "function") {
      await prisma.game.create({
        data: {
          id: nextRoundGameId,
          roomId: game.roomId,
          roundNumber: nextRoundNumber,
          gameStatus: "IN_PROGRESS",
        },
      });
    }

    game.startNextRound(nextRoundGameId);
  }

  private clearHostTransferTimer(roomCode: string): void {
    const existing = this.hostTransferTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      this.hostTransferTimers.delete(roomCode);
    }
  }

  private scheduleHostTransfer(roomCode: string, disconnectedHostId: string): void {
    this.clearHostTransferTimer(roomCode);
    const timer = setTimeout(async () => {
      this.hostTransferTimers.delete(roomCode);
      const playersMap = this.lobbyPlayers.get(roomCode);
      if (!playersMap) return;
      const host = playersMap.get(disconnectedHostId);
      if (host && host.isHost && host.connectionStatus === "CONNECTED") {
        return; // Host reconnected before grace timeout
      }
      const transferred = await this.transferHostIfNeeded(roomCode);
      if (transferred) {
        this.broadcastLobby(roomCode);
      }
    }, this.hostDisconnectGraceMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }
    this.hostTransferTimers.set(roomCode, timer);
  }

  private async transferHostIfNeeded(
    roomCode: string
  ): Promise<ActiveLobbyPlayer | null> {
    this.clearHostTransferTimer(roomCode);
    const playersMap = this.lobbyPlayers.get(roomCode);
    if (!playersMap || playersMap.size === 0) return null;

    // If a connected host already exists, no transfer needed
    const activeHost = Array.from(playersMap.values()).find(
      (p) => p.isHost && p.connectionStatus === "CONNECTED"
    );
    if (activeHost) return null;

    const connectedCandidates = Array.from(playersMap.values())
      .filter((p) => p.connectionStatus === "CONNECTED")
      .sort((a, b) => a.seatNumber - b.seatNumber);

    if (connectedCandidates.length === 0) return null;

    const newHost = connectedCandidates[0];
    for (const p of playersMap.values()) {
      p.isHost = p.userId === newHost.userId;
    }
    newHost.isReady = true;

    if (typeof prisma.room?.update === "function") {
      try {
        await prisma.room.update({
          where: { roomCode },
          data: { hostId: newHost.userId },
        });
      } catch (err: unknown) {
        console.error(
          `Failed to persist host transfer for room ${roomCode}:`,
          getErrorMessage(err, String(err))
        );
      }
    }

    return newHost;
  }

  private persistRoundEnd(game: Game, publicState: PublicGameState): Promise<void> {
    const roundGameId = game.currentRoundGameId;
    const existing = this.persistRoundPromises.get(roundGameId);
    if (existing) return existing;

    const promise = (async () => {
      try {
        if (
          publicState.roundScores &&
          typeof prisma.gameResult?.create === "function"
        ) {
          const sortedEntries = Object.entries(publicState.roundScores).sort(
            ([, a], [, b]) => a.points - b.points
          );

          for (let i = 0; i < sortedEntries.length; i++) {
            const [playerId, scoreInfo] = sortedEntries[i];
            const playerState = game.getPlayer(playerId);
            await prisma.gameResult.create({
              data: {
                gameId: roundGameId,
                playerId,
                points: scoreInfo.points,
                rank: i + 1,
                isWinner: playerId === publicState.winnerId,
                hasDropped: Boolean(playerState?.hasDropped),
                scoreDetail: JSON.stringify(scoreInfo),
              },
            });
          }
        }

        if (typeof prisma.game?.update === "function") {
          await prisma.game.update({
            where: { id: roundGameId },
            data: {
              gameStatus: "COMPLETED",
              completedAt: new Date().toISOString(),
            },
          });
        }
      } catch (dbErr: unknown) {
        console.error(
          `Failed to persist round end for game ${roundGameId}:`,
          getErrorMessage(dbErr, String(dbErr))
        );
      }
    })();

    this.persistRoundPromises.set(roundGameId, promise);
    return promise;
  }

  private findNextAvailableSeat(
    playersMap: Map<string, ActiveLobbyPlayer>,
    maxPlayers: number
  ): number {
    const takenSeats = new Set(Array.from(playersMap.values()).map((p) => p.seatNumber));
    let seat = 1;
    while (takenSeats.has(seat) && seat <= maxPlayers) {
      seat++;
    }
    return seat;
  }

  private broadcastLobby(roomCode: string): void {
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

    this.io.to(`room_${roomCode}`).emit("ROOM_PLAYERS_UPDATE", {
      roomCode,
      players: playersList,
    });
  }
}
