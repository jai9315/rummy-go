import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../db/prisma";

export const authRouter = Router();

export interface AuthTokenPayload {
  userId: string;
  username: string;
  isGuest: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

// User Registration
authRouter.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      username?: unknown;
      email?: unknown;
      password?: unknown;
    };
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !email || !password) {
      res.status(400).json({ error: "Username, email, and password are required" });
      return;
    }

    if (username.length < 3 || username.length > 20) {
      res.status(400).json({ error: "Username must be between 3 and 20 characters" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      res.status(409).json({ error: "Username or email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        profileImage: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
        isGuest: false,
      },
    });

    const token = generateToken({
      userId: user.id,
      username: user.username,
      isGuest: false,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        isGuest: false,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// User Login
authRouter.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { login?: unknown; password?: unknown };
    const login = typeof body?.login === "string" ? body.login.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!login || !password) {
      res.status(400).json({ error: "Login identifier and password are required" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: login }, { username: login }],
      },
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      isGuest: user.isGuest,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        isGuest: user.isGuest,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Guest Login (Instant play without email)
authRouter.post("/guest", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { displayName?: unknown };
    const rawDisplayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    const finalName =
      rawDisplayName.length >= 2
        ? rawDisplayName.substring(0, 15)
        : `Guest_${Math.floor(1000 + Math.random() * 9000)}`;

    const user = await prisma.user.create({
      data: {
        username: `${finalName}_${Math.floor(100 + Math.random() * 900)}`,
        profileImage: `https://api.dicebear.com/7.x/bottts/svg?seed=${finalName}`,
        isGuest: true,
      },
    });

    const token = generateToken({
      userId: user.id,
      username: user.username,
      isGuest: true,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        profileImage: user.profileImage,
        isGuest: true,
      },
    });
  } catch (error) {
    console.error("Guest login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Current User Profile Verification
authRouter.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No authorization token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        profileImage: true,
        isGuest: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

// Update Current User Profile (Display Name / Avatar Seed)
authRouter.patch("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No authorization token provided" });
      return;
    }

    let decoded: AuthTokenPayload;
    try {
      const token = authHeader.split(" ")[1];
      decoded = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        profileImage: true,
        isGuest: true,
      },
    });

    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const body = req.body as {
      username?: unknown;
      avatarSeed?: unknown;
      profileImage?: unknown;
    };

    const updateData: { username?: string; profileImage?: string } = {};

    if (body?.username !== undefined) {
      const nextUsername =
        typeof body.username === "string" ? body.username.trim() : "";
      if (nextUsername.length < 3 || nextUsername.length > 20) {
        res
          .status(400)
          .json({ error: "Username must be between 3 and 20 characters" });
        return;
      }

      if (nextUsername !== currentUser.username) {
        const conflict = await prisma.user.findUnique({
          where: { username: nextUsername },
        });
        if (conflict && conflict.id !== currentUser.id) {
          res.status(409).json({ error: "Username already in use" });
          return;
        }
        updateData.username = nextUsername;
      }
    }

    if (body?.avatarSeed !== undefined) {
      const rawSeed =
        typeof body.avatarSeed === "string" ? body.avatarSeed.trim() : "";
      if (!rawSeed || rawSeed.length > 40) {
        res
          .status(400)
          .json({ error: "Avatar seed must be between 1 and 40 characters" });
        return;
      }
      updateData.profileImage = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        rawSeed
      )}`;
    } else if (body?.profileImage !== undefined) {
      const rawUrl =
        typeof body.profileImage === "string" ? body.profileImage.trim() : "";
      if (!rawUrl.startsWith("https://api.dicebear.com/")) {
        res
          .status(400)
          .json({ error: "Only DiceBear avatar URLs are supported" });
        return;
      }
      updateData.profileImage = rawUrl;
    }

    if (Object.keys(updateData).length === 0) {
      res
        .status(400)
        .json({ error: "Provide at least one field (username or avatarSeed) to update" });
      return;
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        username: true,
        email: true,
        profileImage: true,
        isGuest: true,
        createdAt: true,
      },
    });

    if (!updatedUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const refreshedToken = generateToken({
      userId: updatedUser.id,
      username: updatedUser.username,
      isGuest: updatedUser.isGuest,
    });

    res.json({ user: updatedUser, token: refreshedToken });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});
