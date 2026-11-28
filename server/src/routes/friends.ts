import { NextFunction, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { FriendshipRecord, prisma, UserRecord } from "../db/prisma";
import { RoomManager } from "../socket/roomManager";
import { AuthenticatedRequest, AuthTokenPayload } from "./auth";

function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
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

  // GET /api/friends - Accepted friends (with live isOnline & inRoomCode) + incoming/outgoing pending requests
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

        const friendships: FriendshipRecord[] = await prisma.friendship.findMany({
          where: {
            OR: [{ requesterId: user.userId }, { addresseeId: user.userId }],
          },
          include: {
            requester: { select: { id: true, username: true, profileImage: true } },
            addressee: { select: { id: true, username: true, profileImage: true } },
          },
        });

        const accepted = friendships
          .filter((f) => f.status === "ACCEPTED")
          .map((f) => {
            const friendUser =
              f.requesterId === user.userId ? f.addressee : f.requester;
            const friendUserId =
              friendUser?.id ??
              (f.requesterId === user.userId ? f.addresseeId : f.requesterId);
            const isOnline = Boolean(
              roomManager && friendUserId && roomManager.isUserOnline(friendUserId)
            );
            const inRoomCode =
              roomManager && friendUserId
                ? roomManager.getUserRoomCode(friendUserId)
                : null;
            return {
              id: f.id,
              friendUser,
              isOnline,
              inRoomCode,
              createdAt: f.createdAt,
              updatedAt: f.updatedAt,
            };
          });

        const pendingRequests = friendships
          .filter(
            (f) => f.status === "PENDING" && f.addresseeId === user.userId
          )
          .map((f) => ({
            id: f.id,
            sender: f.requester,
            requester: f.requester,
            createdAt: f.createdAt,
          }));

        const outgoingRequests = friendships
          .filter(
            (f) => f.status === "PENDING" && f.requesterId === user.userId
          )
          .map((f) => ({
            id: f.id,
            receiver: f.addressee,
            addressee: f.addressee,
            createdAt: f.createdAt,
          }));

        res.json({ friends: accepted, pendingRequests, outgoingRequests });
      } catch (error) {
        console.error("Friends fetch error:", error);
        res.status(500).json({ error: "Failed to fetch friends" });
      }
    }
  );

  // POST /api/friends/request - Send friend request by targetUserId or username
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

        const body = req.body as {
          targetUserId?: unknown;
          username?: unknown;
        };
        const targetUserId =
          typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
        const username =
          typeof body?.username === "string" ? body.username.trim() : "";

        if (!targetUserId && !username) {
          res
            .status(400)
            .json({ error: "targetUserId or username is required" });
          return;
        }

        let targetUser: UserRecord | null = null;
        if (targetUserId) {
          targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
          });
        } else if (username) {
          targetUser = await prisma.user.findUnique({
            where: { username },
          });
          if (!targetUser) {
            // Case-insensitive username fallback lookup
            const allUsers = await prisma.user.findMany({
              select: {
                id: true,
                username: true,
                email: true,
                passwordHash: true,
                profileImage: true,
                isGuest: true,
                createdAt: true,
                updatedAt: true,
              },
            });
            const lowered = username.toLowerCase();
            targetUser =
              allUsers.find((u) => u.username.toLowerCase() === lowered) ?? null;
          }
        }

        if (!targetUser) {
          res.status(404).json({ error: "Player not found" });
          return;
        }

        if (targetUser.id === user.userId) {
          res
            .status(400)
            .json({ error: "Cannot send friend request to yourself" });
          return;
        }

        const existing = await prisma.friendship.findFirst({
          where: {
            OR: [
              { requesterId: user.userId, addresseeId: targetUser.id },
              { requesterId: targetUser.id, addresseeId: user.userId },
            ],
          },
        });

        if (existing) {
          if (existing.status === "ACCEPTED") {
            res.status(400).json({ error: "You are already friends" });
            return;
          }
          if (existing.requesterId === targetUser.id) {
            res.status(400).json({
              error:
                "This player already sent you a friend request — accept it in Pending Requests!",
            });
            return;
          }
          res.status(400).json({
            error: "Friend request already sent",
          });
          return;
        }

        const now = new Date().toISOString();
        const friendRequest = await prisma.friendship.create({
          data: {
            requesterId: user.userId,
            addresseeId: targetUser.id,
            status: "PENDING",
            createdAt: now,
            updatedAt: now,
          },
        });

        // Push real-time notification to target user if online
        if (roomManager) {
          const senderRecord = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { id: true, username: true, profileImage: true },
          });
          roomManager.notifyFriendRequestReceived(targetUser.id, {
            requestId: friendRequest.id,
            fromUser: {
              id: user.userId,
              username: senderRecord?.username ?? user.username,
              profileImage: senderRecord?.profileImage ?? null,
            },
          });
        }

        res.status(201).json({ message: "Friend request sent", friendRequest });
      } catch (error) {
        console.error("Send friend request error:", error);
        res.status(500).json({ error: "Failed to send friend request" });
      }
    }
  );

  // POST /api/friends/respond - Accept or decline a pending request
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
        const requestId =
          typeof body?.requestId === "string" ? body.requestId.trim() : "";
        const action =
          typeof body?.action === "string"
            ? body.action.trim().toUpperCase()
            : "";

        if (!requestId) {
          res.status(400).json({ error: "requestId is required" });
          return;
        }

        if (action !== "ACCEPT" && action !== "DECLINE" && action !== "REJECT") {
          res
            .status(400)
            .json({ error: 'action must be "ACCEPT" or "DECLINE"' });
          return;
        }

        const friendship = await prisma.friendship.findUnique({
          where: { id: requestId },
        });

        if (
          !friendship ||
          friendship.addresseeId !== user.userId ||
          friendship.status !== "PENDING"
        ) {
          res.status(404).json({ error: "Pending friend request not found" });
          return;
        }

        if (action === "ACCEPT") {
          await prisma.friendship.update({
            where: { id: requestId },
            data: {
              status: "ACCEPTED",
              updatedAt: new Date().toISOString(),
            },
          });
          roomManager?.notifyFriendshipAccepted(
            friendship.requesterId,
            friendship.addresseeId
          );
          res.json({ message: "Friend request accepted" });
        } else {
          await prisma.friendship.delete({
            where: { id: requestId },
          });
          roomManager?.notifyFriendshipRemoved(
            friendship.requesterId,
            friendship.addresseeId
          );
          res.json({ message: "Friend request declined" });
        }
      } catch (error) {
        console.error("Respond friend request error:", error);
        res.status(500).json({ error: "Failed to respond to request" });
      }
    }
  );

  // DELETE /api/friends/:friendId - Remove a friend (matches friendship id OR friend's userId)
  router.delete(
    "/:friendId",
    authenticate,
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        const user = req.user;
        if (!user) {
          res.status(401).json({ error: "Token required" });
          return;
        }

        const friendId = (req.params.friendId || "").trim();
        if (!friendId) {
          res.status(400).json({ error: "friendId is required" });
          return;
        }

        const friendships = await prisma.friendship.findMany({
          where: {
            OR: [{ requesterId: user.userId }, { addresseeId: user.userId }],
          },
        });

        const target = friendships.find(
          (f) =>
            f.id === friendId ||
            f.requesterId === friendId ||
            f.addresseeId === friendId
        );

        if (!target) {
          res.status(404).json({ error: "Friendship not found" });
          return;
        }

        await prisma.friendship.delete({
          where: { id: target.id },
        });

        roomManager?.notifyFriendshipRemoved(
          target.requesterId,
          target.addresseeId
        );

        res.json({ message: "Friend removed" });
      } catch (error) {
        console.error("Delete friend error:", error);
        res.status(500).json({ error: "Failed to remove friend" });
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
