import { Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";
import { AuthTokenPayload } from "./auth";

export const friendsRouter = Router();
const JWT_SECRET: string = process.env.JWT_SECRET!;

function authenticate(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token required" });
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

// GET /api/friends - List all accepted friends & pending requests
friendsRouter.get("/", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as AuthTokenPayload;

    const friends = await prisma.friend.findMany({
      where: {
        OR: [{ senderId: user.userId }, { receiverId: user.userId }],
      },
      include: {
        sender: { select: { id: true, username: true, profileImage: true } },
        receiver: { select: { id: true, username: true, profileImage: true } },
      },
    });

    const accepted = friends
      .filter((f: any) => f.status === "ACCEPTED")
      .map((f: any) => {
        const friendUser = f.senderId === user.userId ? f.receiver : f.sender;
        return {
          id: f.id,
          friendUser,
          createdAt: f.createdAt,
        };
      });

    const pendingRequests = friends
      .filter((f: any) => f.status === "PENDING" && f.receiverId === user.userId)
      .map((f: any) => ({
        id: f.id,
        sender: f.sender,
        createdAt: f.createdAt,
      }));

    res.json({ friends: accepted, pendingRequests });
  } catch (error) {
    console.error("Friends fetch error:", error);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// POST /api/friends/request - Send friend request by username
friendsRouter.post("/request", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as AuthTokenPayload;
    const { username } = req.body;

    if (!username) {
      res.status(400).json({ error: "Target username required" });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { username },
    });

    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (targetUser.id === user.userId) {
      res.status(400).json({ error: "Cannot send friend request to yourself" });
      return;
    }

    const existing = await prisma.friend.findFirst({
      where: {
        OR: [
          { senderId: user.userId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: user.userId },
        ],
      },
    });

    if (existing) {
      res.status(400).json({ error: "Friend request already exists or you are already friends" });
      return;
    }

    const friendRequest = await prisma.friend.create({
      data: {
        senderId: user.userId,
        receiverId: targetUser.id,
        status: "PENDING",
      },
    });

    res.status(201).json({ message: "Friend request sent", friendRequest });
  } catch (error) {
    console.error("Send friend request error:", error);
    res.status(500).json({ error: "Failed to send friend request" });
  }
});

// POST /api/friends/respond - Accept or reject friend request
friendsRouter.post("/respond", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as AuthTokenPayload;
    const { requestId, action } = req.body; // action: 'ACCEPT' or 'REJECT'

    const friend = await prisma.friend.findUnique({
      where: { id: requestId },
    });

    if (!friend || friend.receiverId !== user.userId) {
      res.status(404).json({ error: "Request not found" });
      return;
    }

    if (action === "ACCEPT") {
      await prisma.friend.update({
        where: { id: requestId },
        data: { status: "ACCEPTED" },
      });
      res.json({ message: "Friend request accepted" });
    } else {
      await prisma.friend.delete({
        where: { id: requestId },
      });
      res.json({ message: "Friend request rejected" });
    }
  } catch (error) {
    console.error("Respond friend request error:", error);
    res.status(500).json({ error: "Failed to respond to request" });
  }
});

// GET /api/friends/history - Match history and recent games
friendsRouter.get("/history", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as AuthTokenPayload;

    const gameResults = await prisma.gameResult.findMany({
      where: { playerId: user.userId },
      include: {
        game: {
          include: {
            room: {
              select: { roomName: true, roomCode: true },
            },
            results: {
              include: {
                player: { select: { username: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.json({ history: gameResults });
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});
