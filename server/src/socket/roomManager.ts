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

export interface RoomManagerOptions {
  hostDisconnectGraceMs?: number;
  turnTimeLimitSeconds?: number;
  showTimeLimitSeconds?: number;
  tossDurationMs?: number;
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

  // roomCode -> Map of userId -> ActiveLobbyPlayer
  private lobbyPlayers: Map<string, Map<string, ActiveLobbyPlayer>> = new Map();
  // roomCode -> Game instance
  private activeGames: Map<string, Game> = new Map();
  // userId -> primary active socketId
  private userSockets: Map<string, string> = new Map();
  // userId -> Set of all currently connected socketIds (for accurate multi-tab presence)
  private userActiveSockets: Map<string, Set<string>> = new Map();
  // roomCode -> optional custom turnTimeLimitSeconds configured at creation
  private roomTurnTimeLimits: Map<string, number> = new Map();
  // socketId -> { userId, roomCode }
  private socketSessions: Map<string, SocketSession> = new Map();
  // roundGameId -> deduplicated round-end persistence promise
  private persistRoundPromises: Map<string, Promise<void>> = new Map();
  // roomCode -> pending host transfer timeout after host disconnect
  private hostTransferTimers: Map<string, NodeJS.Timeout> = new Map();
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
    const sockets = this.userActiveSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  /**
   * Returns the list of all userIds currently connected via Socket.IO.
   */
  public getOnlineUserIds(): string[] {
    const online: string[] = [];
    for (const [uid, sockets] of this.userActiveSockets.entries()) {
      if (sockets.size > 0) {
        online.push(uid);
      }
    }
    return online;
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

  public handleConnection(socket: Socket): void {
    const user = (socket.data as SocketUserData).user;
    if (!user) {
      socket.disconnect();
      return;
    }

    this.userSockets.set(user.userId, socket.id);
    if (!this.userActiveSockets.has(user.userId)) {
      this.userActiveSockets.set(user.userId, new Set());
    }
    this.userActiveSockets.get(user.userId)!.add(socket.id);

    // Event: JOIN_ROOM
    socket.on(
      "JOIN_ROOM",
      async (payload: { roomCode?: unknown; password?: unknown }) => {
        try {
          const rawCode =
            typeof payload?.roomCode === "string" ? payload.roomCode.trim() : "";
          if (!rawCode) {
            socket.emit("ERROR", { message: "Invalid room code" });
            return;
          }

          const code = rawCode.toUpperCase();
          const room = await prisma.room.findUnique({
            where: { roomCode: code },
            include: { host: true },
          });

          if (!room) {
            socket.emit("ERROR", { message: "Room not found" });
            return;
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

          // Enforce optional room password on new non-host joins BEFORE joining channel
          if (
            room.passwordHash &&
            !isReconnectingPlayer &&
            user.userId !== currentHostId
          ) {
            const providedPassword =
              typeof payload?.password === "string" ? payload.password : "";
            if (!providedPassword) {
              socket.emit("ERROR", {
                message: "Room password is required",
                code: "PASSWORD_REQUIRED",
              });
              return;
            }
            const passwordMatches = await bcrypt.compare(
              providedPassword,
              room.passwordHash
            );
            if (!passwordMatches) {
              socket.emit("ERROR", {
                message: "Incorrect room password",
                code: "INVALID_PASSWORD",
              });
              return;
            }
          }

          // Validate active-game and maxPlayers capacity BEFORE joining Socket.IO
          // channel or recording socketSessions so rejected users never receive
          // room broadcasts or hold a room session.
          if (!isReconnectingPlayer) {
            const gameInProgress =
              (activeGame &&
                activeGame.status !== "WAITING" &&
                activeGame.status !== "GAME_OVER") ||
              (room.status === "PLAYING" &&
                (!activeGame || activeGame.status !== "GAME_OVER"));

            if (gameInProgress) {
              socket.emit("ERROR", { message: "Game is already in progress" });
              return;
            }

            const currentCount = existingPlayersMap?.size ?? 0;
            if (currentCount >= room.maxPlayers) {
              socket.emit("ERROR", { message: "Room is full" });
              return;
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
            (p) => !p.hasDropped && p.connectionStatus === "CONNECTED"
          );
          const hasActive = publicState.players.some((p) => !p.hasDropped);
          if (hasActive && !anyConnected) {
            game.stopTimer();
          }
        }
      }

      if (!playersMap || playersMap.size === 0) {
        this.clearHostTransferTimer(roomCode);
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
    });

    // Event: KICK_PLAYER (Host only, lobby state only)
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
      if (
        activeGame &&
        activeGame.status !== "WAITING" &&
        activeGame.status !== "GAME_OVER"
      ) {
        socket.emit("ERROR", {
          message: "Cannot kick players while a game is in progress",
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
        this.returnedToLobby.delete(roomCode);

        // Initialize Game Engine (in memory first)
        const game = new Game(`game_${roomCode}_${Date.now()}`, room.id, roomCode, {
          turnTimeLimitSeconds: this.getRoomTurnTimeLimit(roomCode),
          showTimeLimitSeconds: this.showTimeLimitSeconds,
          tossDurationMs: this.tossDurationMs,
          roundCount: Math.max(1, room.roundCount || 1),
          entryPoints: room.entryPoints,
          onStateUpdate: (state) => {
            console.log(
              `START_GAME: onStateUpdate called, status=${state.status}, round=${state.roundNumber}/${state.roundCount}, turn=${state.currentTurnPlayerId}`
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
            this.io.to(`room_${roomCode}`).emit("GAME_STATE_UPDATE", state);
            if (state.status === "ROUND_END" || state.status === "GAME_OVER") {
              void this.persistRoundEnd(game, state);
            }
            if (state.status === "GAME_OVER" && typeof prisma.room?.update === "function") {
              prisma.room
                .update({
                  where: { roomCode },
                  data: { status: "WAITING" },
                })
                .catch(() => {});
            }
          },
          onPrivateUpdate: (playerId, cards) => {
            this.deliverPrivateHand(roomCode, playerId, cards);
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

    // Event: NEXT_ROUND (Host only, when ROUND_END and rounds remain)
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

      if (game.roundNumber >= game.roundCount) {
        socket.emit("ERROR", {
          message: "All rounds for this match have been completed",
        });
        return;
      }

      try {
        const nextRoundNumber = game.roundNumber + 1;
        const nextRoundGameId = `${game.id}_r${nextRoundNumber}`;

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
      } catch (err: unknown) {
        console.error("NEXT_ROUND error:", err);
        socket.emit("ERROR", {
          message: getErrorMessage(err, "Failed to start next round"),
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
            game.stopTimer();
            this.activeGames.delete(roomCode);
            this.returnedToLobby.delete(roomCode);
          }
        }
      }

      this.broadcastLobby(roomCode);
      socket.emit("RETURNED_TO_LOBBY", { roomCode });
    });

    // Event: DRAW_CARD
    socket.on("DRAW_CARD", ({ source }: { source: "CLOSED" | "DISCARD" }) => {
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

    // Event: INVITE_FRIEND (In-app room invitation to an online friend)
    socket.on(
      "INVITE_FRIEND",
      async (payload: { friendId?: unknown; roomCode?: unknown }) => {
        try {
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

          const targetSocketIds = this.userActiveSockets.get(friendId);
          if (!targetSocketIds || targetSocketIds.size === 0) {
            socket.emit("ERROR", { message: "Friend is currently offline" });
            return;
          }

          const invitePayload = {
            roomCode: room.roomCode,
            roomName: room.roomName,
            fromUsername: user.username,
            fromUserId: user.userId,
            timestamp: Date.now(),
          };

          let delivered = 0;
          for (const sid of targetSocketIds) {
            const targetSocket = this.findSocketById(sid);
            if (targetSocket) {
              targetSocket.emit("ROOM_INVITE_RECEIVED", invitePayload);
              delivered++;
            }
          }

          if (delivered === 0) {
            socket.emit("ERROR", { message: "Friend is currently offline" });
            return;
          }

          socket.emit("INVITE_SENT", {
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
      const activeSet = this.userActiveSockets.get(user.userId);
      if (activeSet) {
        activeSet.delete(socket.id);
        if (activeSet.size === 0) {
          this.userActiveSockets.delete(user.userId);
        }
      }

      // CRITICAL: Only delete userSockets mapping if THIS disconnecting socket
      // is still the active socket for user.userId (prevents dual-tab/reconnect race).
      if (this.userSockets.get(user.userId) === socket.id) {
        const remaining = this.userActiveSockets.get(user.userId);
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
              (p) => !p.hasDropped && p.connectionStatus === "CONNECTED"
            );
            const hasActive = publicState.players.some((p) => !p.hasDropped);
            if (hasActive && !anyConnected) {
              game.stopTimer();
            }
          }
        }

        this.broadcastLobby(roomCode);
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
