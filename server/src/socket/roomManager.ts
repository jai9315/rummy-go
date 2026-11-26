// @ts-nocheck
import { Server, Socket } from "socket.io";
import { prisma } from "../db/prisma";
import { Evaluator } from "../engine/Evaluator";
import { Game } from "../engine/Game";
import { Card } from "../engine/types";
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

export class RoomManager {
  private io: Server;
  // roomCode -> Map of userId -> ActiveLobbyPlayer
  private lobbyPlayers: Map<string, Map<string, ActiveLobbyPlayer>> = new Map();
  // roomCode -> Game instance
  private activeGames: Map<string, Game> = new Map();
  // userId -> socketId
  private userSockets: Map<string, string> = new Map();
  // socketId -> { userId, roomCode }
  private socketSessions: Map<string, { userId: string; roomCode: string }> = new Map();

  constructor(io: Server) {
    this.io = io;
  }

  public handleConnection(socket: Socket): void {
    const user = socket.data.user as AuthTokenPayload;
    if (!user) {
      socket.disconnect();
      return;
    }

    this.userSockets.set(user.userId, socket.id);

    // Event: JOIN_ROOM
    socket.on("JOIN_ROOM", async ({ roomCode }: { roomCode: string }) => {
      try {
        const code = roomCode.toUpperCase();
        const room = await prisma.room.findUnique({
          where: { roomCode: code },
          include: { host: true },
        });

        if (!room) {
          socket.emit("ERROR", { message: "Room not found" });
          return;
        }

        const roomChannel = `room_${code}`;
        socket.join(roomChannel);
        this.socketSessions.set(socket.id, { userId: user.userId, roomCode: code });

        if (!this.lobbyPlayers.has(code)) {
          this.lobbyPlayers.set(code, new Map());
        }

        const playersMap = this.lobbyPlayers.get(code)!;
        let existingPlayer = playersMap.get(user.userId);

        if (existingPlayer) {
          // Reconnection to existing seat
          existingPlayer.socketId = socket.id;
          existingPlayer.connectionStatus = "CONNECTED";
        } else {
          // New join - assign seat 1..maxPlayers synchronously
          if (playersMap.size >= room.maxPlayers) {
            socket.emit("ERROR", { message: "Room is full" });
            return;
          }

          const takenSeats = new Set(Array.from(playersMap.values()).map((p) => p.seatNumber));
          let seat = 1;
          while (takenSeats.has(seat) && seat <= room.maxPlayers) {
            seat++;
          }

          // Reserve the seat in memory IMMEDIATELY (before any async yield) so
          // a concurrent JOIN_ROOM for another user cannot compute the same seat
          // and violate the unique (roomId, seatNumber) constraint.
          existingPlayer = {
            userId: user.userId,
            username: user.username,
            profileImage: "", // filled in below
            seatNumber: seat,
            isReady: user.userId === room.hostId, // Host is ready by default
            connectionStatus: "CONNECTED",
            socketId: socket.id,
            isHost: user.userId === room.hostId,
          };
          playersMap.set(user.userId, existingPlayer);

          const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
          existingPlayer.profileImage =
            dbUser?.profileImage || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`;

          // Persist RoomPlayer to DB before broadcasting lobby.
          // If the DB write fails, we still proceed with the in-memory state
          // (the player is already in the room) but log the error explicitly.
          try {
            await prisma.roomPlayer.upsert({
              where: {
                roomId_userId: { roomId: room.id, userId: user.userId },
              },
              create: {
                roomId: room.id,
                userId: user.userId,
                seatNumber: seat,
                isReady: existingPlayer.isReady,
                connectionStatus: "CONNECTED",
              },
              update: {
                connectionStatus: "CONNECTED",
                // Do NOT change seatNumber on update — a reconnecting player
                // keeps their existing seat. Changing it could violate the
                // unique (roomId, seatNumber) constraint if another player
                // already occupies that seat.
              },
            });
          } catch (dbErr: any) {
            // If seatNumber conflicts (unique constraint), find an available seat
            if (dbErr?.message?.includes("Unique constraint")) {
              const takenDbSeats = new Set(
                Array.from(playersMap.values()).map((p) => p.seatNumber)
              );
              let newSeat = 1;
              while (takenDbSeats.has(newSeat) && newSeat <= room.maxPlayers) {
                newSeat++;
              }
              if (newSeat <= room.maxPlayers) {
                existingPlayer.seatNumber = newSeat;
                playersMap.set(user.userId, existingPlayer);
                try {
                  await prisma.roomPlayer.upsert({
                    where: {
                      roomId_userId: { roomId: room.id, userId: user.userId },
                    },
                    create: {
                      roomId: room.id,
                      userId: user.userId,
                      seatNumber: newSeat,
                      isReady: existingPlayer.isReady,
                      connectionStatus: "CONNECTED",
                    },
                    update: {
                      connectionStatus: "CONNECTED",
                    },
                  });
                } catch (dbErr2) {
                  console.error(
                    `Failed to persist RoomPlayer (retry) for user ${user.userId} in room ${code}:`,
                    (dbErr2 as Error)?.message || dbErr2
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
                dbErr?.message || dbErr
              );
            }
          }
        }

        // Broadcast updated lobby (after DB write attempt so lobby reflects persisted state)
        this.broadcastLobby(code);

        // Check if an active game is in progress (Reconnection Handling)
        const game = this.activeGames.get(code);
        if (game) {
          game.setPlayerConnection(user.userId, "CONNECTED");
          // Emit public game state
          socket.emit("GAME_STATE_UPDATE", game.getPublicState());

          // CRITICAL: Emit private cards ONLY to this player
          const privateCards = game.getPlayerCards(user.userId);
          socket.emit("PRIVATE_HAND_UPDATE", {
            type: "PRIVATE_HAND_UPDATE",
            playerId: user.userId,
            cards: privateCards,
            timestamp: Date.now(),
          });
        }
      } catch (err: any) {
        console.error("JOIN_ROOM error:", err);
        socket.emit("ERROR", { message: err?.message || "Failed to join room" });
      }
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
        if (game) {
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
        socket.emit("ERROR", { message: `Waiting for ${notReady.username} to get ready` });
        return;
      }

      try {
        const room = await prisma.room.findUnique({ where: { roomCode } });
        if (!room) return;

        // Initialize Game Engine (in memory first)
        const game = new Game(`game_${roomCode}_${Date.now()}`, room.id, roomCode, {
          turnTimeLimitSeconds: 30,
          onStateUpdate: (state) => {
            console.log(`START_GAME: onStateUpdate called, status=${state.status}, turn=${state.currentTurnPlayerId}`);
            this.io.to(`room_${roomCode}`).emit("GAME_STATE_UPDATE", state);
          },
          onPrivateUpdate: (playerId, cards) => {
            const targetSocketId = this.userSockets.get(playerId);
            if (!targetSocketId) {
              console.error(
                `PRIVATE_HAND_UPDATE: no socket mapping for player ${playerId}`
              );
              return;
            }

            // Socket.IO v4: sockets no longer auto-join their own ID room,
            // so io.to(socketId).emit() silently fails. Look up the socket
            // object directly from the connected sockets map.
            let targetSocket = this.io.sockets.sockets?.get(targetSocketId);
            if (!targetSocket) {
              // Fallback: try the explicit default namespace
              targetSocket = this.io.of("/").sockets.get(targetSocketId);
            }
            if (!targetSocket) {
              // Last resort: scan all connected sockets
              for (const [sid, s] of this.io.sockets.sockets) {
                if (sid === targetSocketId) {
                  targetSocket = s;
                  break;
                }
              }
            }

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
              } catch (emitErr) {
                console.error(
                  `PRIVATE_HAND_UPDATE: emit failed for player ${playerId}:`,
                  emitErr
                );
              }
            } else {
              console.error(
                `PRIVATE_HAND_UPDATE: socket not found for player ${playerId} (socketId: ${targetSocketId}). Connected sockets: ${this.io.sockets.sockets.size}`
              );
            }
          },
        });

        for (const p of activePlayers) {
          game.addPlayer(p.userId, p.username, p.profileImage, p.seatNumber);
          game.setPlayerReady(p.userId, true);
        }

        // Persist to DB before registering the game in memory.
        // Create the Game record first, then mark the room as PLAYING,
        // so a failure never leaves the room in PLAYING without a game.
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

        // Only now register the game and start the round
        this.activeGames.set(roomCode, game);
        console.log(`START_GAME: game ${game.id} registered in room ${roomCode} with ${activePlayers.length} players`);
        try {
          game.startRound();
          console.log(
            `START_GAME: game ${game.id} startRound() complete, status=${game.status}, turn=${game.getCurrentTurnPlayerId()}`
          );
        } catch (roundErr) {
          console.error(`START_GAME: game ${game.id} startRound() failed:`, roundErr);
          this.activeGames.delete(roomCode);
          throw roundErr;
        }
      } catch (err: any) {
        console.error("START_GAME error:", err);
        socket.emit("ERROR", { message: err?.message || "Failed to start game" });
      }
    });

    // Event: DRAW_CARD
    socket.on("DRAW_CARD", ({ source }: { source: "CLOSED" | "DISCARD" }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.activeGames.get(session.roomCode);
      if (!game) return;

      try {
        game.drawCard(session.userId, source);
      } catch (err: any) {
        socket.emit("ERROR", { message: err?.message || "Invalid draw action" });
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
      } catch (err: any) {
        socket.emit("ERROR", { message: err?.message || "Invalid discard action" });
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
          if (result.isValid && game.status === "ROUND_END") {
            // Persist match results in DB
            const publicState = game.getPublicState();
            if (publicState.roundScores) {
              for (const [playerId, scoreInfo] of Object.entries(publicState.roundScores)) {
                await prisma.gameResult.create({
                  data: {
                    gameId: game.id,
                    playerId,
                    points: scoreInfo.points,
                    isWinner: playerId === session.userId,
                    hasDropped: scoreInfo.reason.includes("Drop"),
                    scoreDetail: JSON.stringify(scoreInfo),
                  },
                });
              }
            }
          }
        } catch (err: any) {
          socket.emit("ERROR", { message: err?.message || "Declaration failed" });
        }
      }
    );

    // Event: DROP
    socket.on("DROP", () => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.activeGames.get(session.roomCode);
      if (!game) return;

      try {
        game.drop(session.userId);
      } catch (err: any) {
        socket.emit("ERROR", { message: err?.message || "Drop failed" });
      }
    });

    // Event: SORT_HAND
    socket.on("SORT_HAND", ({ by }: { by: "SUIT" | "RANK" }) => {
      const session = this.socketSessions.get(socket.id);
      if (!session) return;
      const game = this.activeGames.get(session.roomCode);
      if (!game) return;

      const cards = game.getPlayerCards(session.userId);
      const sorted = Evaluator.sortHand(cards, by || "SUIT");

      // Send sorted private cards ONLY to this player
      socket.emit("PRIVATE_HAND_UPDATE", {
        type: "PRIVATE_HAND_UPDATE",
        playerId: session.userId,
        cards: sorted,
        timestamp: Date.now(),
      });
    });

    // Event: DISCONNECT
    socket.on("disconnect", () => {
      const session = this.socketSessions.get(socket.id);
      if (session) {
        const { roomCode, userId } = session;
        const players = this.lobbyPlayers.get(roomCode);
        const player = players?.get(userId);
        if (player) {
          player.connectionStatus = "DISCONNECTED";
        }
        const game = this.activeGames.get(roomCode);
        if (game) {
          game.setPlayerConnection(userId, "DISCONNECTED");
          this.io.to(`room_${roomCode}`).emit("GAME_STATE_UPDATE", game.getPublicState());
          // Stop the turn timer if no active (non-dropped) player is connected,
          // preventing the timer from firing for an abandoned game.
          const publicState = game.getPublicState();
          const anyConnected = publicState.players.some(
            (p) => !p.hasDropped && p.connectionStatus === "CONNECTED"
          );
          const hasActive = publicState.players.some((p) => !p.hasDropped);
          if (hasActive && !anyConnected) {
            game.stopTimer();
          }
        }
        this.broadcastLobby(roomCode);
      }
      this.socketSessions.delete(socket.id);
      this.userSockets.delete(user.userId);
    });
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
