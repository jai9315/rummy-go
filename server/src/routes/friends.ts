import { NextFunction, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { FriendRecord, prisma } from "../db/prisma";
import { RoomManager } from "../socket/roomManager";
import { AuthenticatedRequest, AuthTokenPayload } from "./auth";

function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token required" });
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

export function createFriendsRouter(roomManager?: RoomManager): Router {
  const router = Router();

  // GET /api/friends - List all accepted friends (with live presence) & pending requests
  router.get(
    "/",
    authenticate,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user;
        if (!user) {
          res.status(401).json({ error: "Token required" });
          return;
        }

        const friends: FriendRecord[] = await prisma.friend.findMany({
          where: {
            OR: [{ senderId: user.userId }, { receiverId: user.userId }],
          },
          include: {
            sender: { select: { id: true, username: true, profileImage: true } },
            receiver: { select: { id: true, username: true, profileImage: true } },
          },
        });

        const accepted = friends
          .filter((f) => f.status === "ACCEPTED")
          .map((f) => {
            const friendUser = f.senderId === user.userId ? f.receiver : f.sender;
            const friendUserId =
              friendUser?.id ??
              (f.senderId === user.userId ? f.receiverId : f.senderId);
            const isOnline = Boolean(
              roomManager && friendUserId && roomManager.isUserOnline(friendUserId)
            );
            return {
              id: f.id,
              friendUser,
              isOnline,
              createdAt: f.createdAt,
            };
          });

        const pendingRequests = friends
          .filter((f) => f.status === "PENDING" && f.receiverId === user.userId)
          .map((f) => ({
            id: f.id,
            sender: f.sender,
            createdAt: f.createdAt,
          }));

        res.json({ friends: accepted, pendingRequests });
      } catch (error) {
        console.error("Friends fetch error:", error);
        res.status(500).json({ error: "Failed to fetch friends" });
      }
    }
  );

  // POST /api/friends/request - Send friend request by username
  router.post(
    "/request",
    authenticate,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user;
        if (!user) {
          res.status(401).json({ error: "Token required" });
          return;
        }

        const body = req.body as { username?: unknown };
        const username = typeof body?.username === "string" ? body.username.trim() : "";

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
    }
  );

  // POST /api/friends/respond - Accept or reject friend request
  router.post(
    "/respond",
    authenticate,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user;
        if (!user) {
          res.status(401).json({ error: "Token required" });
          return;
        }

        const body = req.body as { requestId?: unknown; action?: unknown };
        const requestId = typeof body?.requestId === "string" ? body.requestId : "";
        const action = typeof body?.action === "string" ? body.action : "";

        if (!requestId) {
          res.status(400).json({ error: "requestId is required" });
          return;
        }

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
    }
  );

  // GET /api/friends/history - Match history and recent games
  router.get(
    "/history",
    authenticate,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user;
        if (!user) {
          res.status(401).json({ error: "Token required" });
          return;
        }

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
    }
  );

  return router;
}

export const friendsRouter = createFriendsRouter();
