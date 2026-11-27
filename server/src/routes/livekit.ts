import { Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { AccessToken } from "livekit-server-sdk";
import { config } from "../config";
import { prisma } from "../db/prisma";
import { AuthTokenPayload } from "./auth";

export interface RoomMembershipChecker {
  isActiveMember(roomCode: string, userId: string): boolean;
}

/**
 * Creates the LiveKit router with optional live RoomManager membership checks.
 * API secrets are NEVER exposed to the frontend.
 */
export function createLiveKitRouter(roomManager?: RoomMembershipChecker): Router {
  const router = Router();

  router.post("/token", async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication token required" });
      return;
    }

    let user: AuthTokenPayload;
    try {
      const authToken = authHeader.split(" ")[1];
      user = jwt.verify(authToken, config.jwtSecret) as AuthTokenPayload;
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    try {
      const body = req.body as { roomCode?: unknown };
      const rawRoomCode = typeof body?.roomCode === "string" ? body.roomCode.trim() : "";
      if (!rawRoomCode) {
        res.status(400).json({ error: "roomCode is required" });
        return;
      }

      const normalizedCode = rawRoomCode.toUpperCase();

      // 1. Verify the room exists
      const room = await prisma.room.findUnique({
        where: { roomCode: normalizedCode },
      });

      if (!room) {
        res.status(404).json({ error: "Room not found" });
        return;
      }

      // 2. Verify the authenticated user is an active member of this room
      const isActiveInMemory = roomManager
        ? roomManager.isActiveMember(normalizedCode, user.userId)
        : false;
      const dbMember = await prisma.roomPlayer.findFirst({
        where: { roomId: room.id, userId: user.userId },
      });
      const isActiveInDb = Boolean(dbMember && dbMember.connectionStatus === "CONNECTED");
      const isHostInWaitingRoom =
        room.hostId === user.userId && !dbMember && room.status === "WAITING";

      if (!isActiveInMemory && !isActiveInDb && !isHostInWaitingRoom) {
        res.status(403).json({ error: "Forbidden: not an active member of this room" });
        return;
      }

      // 3. Mint LiveKit access token scoped strictly to this room
      const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
        identity: user.userId,
        name: user.username,
        ttl: "4h",
      });

      at.addGrant({
        roomJoin: true,
        room: `rummy_${normalizedCode}`,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();

      res.json({
        token,
        serverUrl: config.livekitUrl,
        identity: user.userId,
        username: user.username,
      });
    } catch (error) {
      console.error("LiveKit token generation error:", error);
      res.status(500).json({ error: "Failed to generate video token" });
    }
  });

  return router;
}

export const livekitRouter = createLiveKitRouter();
