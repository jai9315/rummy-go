// @ts-nocheck
import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";

export const authRouter = Router();

const JWT_SECRET: string = process.env.JWT_SECRET!;

export interface AuthTokenPayload {
  userId: string;
  username: string;
  isGuest: boolean;
}

export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

// User Registration
authRouter.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

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
    const { login, password } = req.body; // login can be email or username

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
    const { displayName } = req.body;
    const finalName =
      displayName && displayName.trim().length >= 2
        ? displayName.trim().substring(0, 15)
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
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;

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
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});
