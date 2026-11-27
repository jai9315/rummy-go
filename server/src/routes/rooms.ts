import bcrypt from "bcryptjs";
import crypto from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { config } from "../config";
import { prisma, RoomPlayerRecord } from "../db/prisma";
import { RoomManager } from "../socket/roomManager";
import { AuthenticatedRequest, AuthTokenPayload } from "./auth";

// Helper to generate cryptographically secure 6-character room code (e.g. "AB12CD")
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous I, O, 0, 1
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

// Middleware to authenticate user for room actions
function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication token required" });
    return;
  }
  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function createRoomsRouter(roomManager?: RoomManager): Router {
  const router = Router();

  // POST /api/rooms/create - Create private room
  router.post(
    "/create",
    authenticate,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user;
        if (!user) {
          res.status(401).json({ error: "Authentication token required" });
          return;
        }

        const body = req.body as {
          roomName?: unknown;
          maxPlayers?: unknown;
          roundCount?: unknown;
          entryPoints?: unknown;
          turnTimeLimitSeconds?: unknown;
          password?: unknown;
        };

        const parsedMaxPlayers = parseInt(String(body?.maxPlayers ?? ""), 10);
        const parsedRoundCount = parseInt(String(body?.roundCount ?? ""), 10);
        const parsedEntryPoints = parseInt(String(body?.entryPoints ?? ""), 10);
        const parsedTurnLimit = parseInt(String(body?.turnTimeLimitSeconds ?? ""), 10);
        const roomNameInput = typeof body?.roomName === "string" ? body.roomName.trim() : "";
        const rawPassword = typeof body?.password === "string" ? body.password.trim() : "";
        const passwordHash = rawPassword.length > 0 ? await bcrypt.hash(rawPassword, 10) : null;
        const turnTimeLimitSeconds = Number.isNaN(parsedTurnLimit)
          ? 30
          : Math.min(120, Math.max(15, parsedTurnLimit));
        const entryPoints = Number.isNaN(parsedEntryPoints)
          ? 80
          : Math.min(500, Math.max(40, parsedEntryPoints));

        let roomCode = generateRoomCode();
        // Ensure uniqueness
        let existing = await prisma.room.findUnique({ where: { roomCode } });
        while (existing) {
          roomCode = generateRoomCode();
          existing = await prisma.room.findUnique({ where: { roomCode } });
        }

        const room = await prisma.room.create({
          data: {
            roomCode,
            roomName: roomNameInput || `${user.username}'s Table`,
            maxPlayers: Math.min(6, Math.max(2, Number.isNaN(parsedMaxPlayers) ? 6 : parsedMaxPlayers)),
            roundCount: Math.max(1, Number.isNaN(parsedRoundCount) ? 1 : parsedRoundCount),
            entryPoints,
            passwordHash,
            hostId: user.userId,
            status: "WAITING",
          },
        });

        if (roomManager) {
          roomManager.setRoomTurnTimeLimit(room.roomCode, turnTimeLimitSeconds);
        }

        const inviteUrl = `${config.clientUrl}/room/${roomCode}`;
        const qrCodeDataUrl = await QRCode.toDataURL(inviteUrl);

        res.status(201).json({
          room: {
            id: room.id,
            roomCode: room.roomCode,
            roomName: room.roomName,
            maxPlayers: room.maxPlayers,
            roundCount: room.roundCount,
            entryPoints: room.entryPoints,
            turnTimeLimitSeconds,
            hasPassword: Boolean(room.passwordHash),
            hostId: room.hostId,
            status: room.status,
            inviteUrl,
            qrCode: qrCodeDataUrl,
          },
        });
      } catch (error) {
        console.error("Create room error:", error);
        res.status(500).json({ error: "Failed to create room" });
      }
    }
  );

  // GET /api/rooms/:code - Get room info & verify valid room
  router.get("/:code", async (req: Request, res: Response): Promise<void> => {
    try {
      const { code } = req.params;
      const room = await prisma.room.findUnique({
        where: { roomCode: code.toUpperCase() },
        include: {
          host: {
            select: { id: true, username: true, profileImage: true },
          },
          players: {
            include: {
              user: {
                select: { id: true, username: true, profileImage: true, isGuest: true },
              },
            },
          },
        },
      });

      if (!room) {
        res.status(404).json({ error: "Room not found or code is invalid" });
        return;
      }

      const inviteUrl = `${config.clientUrl}/room/${room.roomCode}`;
      const qrCodeDataUrl = await QRCode.toDataURL(inviteUrl);
      const players: RoomPlayerRecord[] = room.players ?? [];
      const turnTimeLimitSeconds = roomManager
        ? roomManager.getRoomTurnTimeLimit(room.roomCode)
        : 30;

      res.json({
        room: {
          id: room.id,
          roomCode: room.roomCode,
          roomName: room.roomName,
          maxPlayers: room.maxPlayers,
          roundCount: room.roundCount,
          entryPoints: room.entryPoints,
          turnTimeLimitSeconds,
          hasPassword: Boolean(room.passwordHash),
          status: room.status,
          host: room.host,
          players: players.map((rp) => ({
            userId: rp.userId,
            username: rp.user?.username ?? "",
            profileImage: rp.user?.profileImage ?? null,
            seatNumber: rp.seatNumber,
            isReady: rp.isReady,
            connectionStatus: rp.connectionStatus,
          })),
          inviteUrl,
          qrCode: qrCodeDataUrl,
        },
      });
    } catch (error) {
      console.error("Get room error:", error);
      res.status(500).json({ error: "Failed to fetch room" });
    }
  });

  return router;
}

export const roomsRouter = createRoomsRouter();
