// @ts-nocheck
import { Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { prisma } from "../db/prisma";
import { AuthTokenPayload } from "./auth";

export const roomsRouter = Router();
const JWT_SECRET: string = process.env.JWT_SECRET!;

// Helper to generate unique 6-character room code (e.g. "AB12CD")
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous I, O, 0, 1
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Middleware to authenticate user for room actions
function authenticate(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication token required" });
    return;
  }
  try {
    const token = authHeader.split(" ")[1];
    (req as any).user = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

// POST /api/rooms/create - Create private room
roomsRouter.post("/create", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as AuthTokenPayload;
    const { roomName, maxPlayers, roundCount, entryPoints } = req.body;

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
        roomName: roomName || `${user.username}'s Table`,
        maxPlayers: Math.min(6, Math.max(2, parseInt(maxPlayers, 10) || 6)),
        roundCount: Math.max(1, parseInt(roundCount, 10) || 1),
        entryPoints: parseInt(entryPoints, 10) || 80,
        hostId: user.userId,
        status: "WAITING",
      },
    });

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const inviteUrl = `${clientUrl}/room/${roomCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(inviteUrl);

    res.status(201).json({
      room: {
        id: room.id,
        roomCode: room.roomCode,
        roomName: room.roomName,
        maxPlayers: room.maxPlayers,
        roundCount: room.roundCount,
        entryPoints: room.entryPoints,
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
});

// GET /api/rooms/:code - Get room info & verify valid room
roomsRouter.get("/:code", async (req: Request, res: Response): Promise<void> => {
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

    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const inviteUrl = `${clientUrl}/room/${room.roomCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(inviteUrl);

    res.json({
      room: {
        id: room.id,
        roomCode: room.roomCode,
        roomName: room.roomName,
        maxPlayers: room.maxPlayers,
        roundCount: room.roundCount,
        entryPoints: room.entryPoints,
        status: room.status,
        host: room.host,
        players: room.players.map((rp: any) => ({
          userId: rp.userId,
          username: rp.user.username,
          profileImage: rp.user.profileImage,
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
