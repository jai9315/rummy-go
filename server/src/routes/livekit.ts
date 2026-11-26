import { Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { AccessToken } from "livekit-server-sdk";
import { AuthTokenPayload } from "./auth";

export const livekitRouter = Router();

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "secret";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "wss://demo.livekit.cloud";
const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_jwt_key_2026";

/**
 * Generates secure server-side LiveKit room access token.
 * API secrets are NEVER exposed to the frontend.
 */
livekitRouter.post("/token", async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication token required" });
      return;
    }

    const authToken = authHeader.split(" ")[1];
    const user = jwt.verify(authToken, JWT_SECRET) as AuthTokenPayload;

    const { roomCode } = req.body;
    if (!roomCode) {
      res.status(400).json({ error: "roomCode is required" });
      return;
    }

    // Create LiveKit token
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: user.userId,
      name: user.username,
      ttl: "4h",
    });

    at.addGrant({
      roomJoin: true,
      room: `rummy_${roomCode.toUpperCase()}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    res.json({
      token,
      serverUrl: LIVEKIT_URL,
      identity: user.userId,
      username: user.username,
    });
  } catch (error) {
    console.error("LiveKit token generation error:", error);
    res.status(500).json({ error: "Failed to generate video token" });
  }
});
