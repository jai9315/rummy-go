import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth";
import { friendsRouter } from "./routes/friends";
import { livekitRouter } from "./routes/livekit";
import { roomsRouter } from "./routes/rooms";
import { socketAuthMiddleware } from "./socket/authMiddleware";
import { RoomManager } from "./socket/roomManager";

dotenv.config();

// Fail fast if required security / LiveKit configuration is missing.
// The backend must not start with forgeable secrets or demo credentials.
function validateEnv(): void {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!process.env.LIVEKIT_API_KEY) missing.push("LIVEKIT_API_KEY");
  if (!process.env.LIVEKIT_API_SECRET) missing.push("LIVEKIT_API_SECRET");
  if (!process.env.LIVEKIT_URL) missing.push("LIVEKIT_URL");
  if (missing.length > 0) {
    console.error(
      `FATAL: Missing required environment variables: ${missing.join(
        ", "
      )}. Set them before starting the server.`
    );
    process.exit(1);
  }
}

validateEnv();

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.PORT || "4000", 10);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());

// REST Routes
app.use("/api/auth", authRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/livekit", livekitRouter);
app.use("/api/friends", friendsRouter);

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Indian Rummy Server",
    timestamp: new Date().toISOString(),
  });
});

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 30000,
  pingInterval: 10000,
});

io.use(socketAuthMiddleware);

const roomManager = new RoomManager(io);
io.on("connection", (socket) => {
  roomManager.handleConnection(socket);
});

// Start Server when run directly
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`♠♥♦♣ Rummy Server is running on port ${PORT}`);
    console.log(`LiveKit Video Token endpoint: http://localhost:${PORT}/api/livekit/token`);
    console.log(`Socket.IO endpoint ready`);
  });
}

export { app, io, server };
