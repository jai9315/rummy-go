import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { config, validateEnv } from "./config";
import { authRouter } from "./routes/auth";
import { createFriendsRouter } from "./routes/friends";
import { createLiveKitRouter } from "./routes/livekit";
import { createRoomsRouter } from "./routes/rooms";
import { socketAuthMiddleware } from "./socket/authMiddleware";
import { RoomManager } from "./socket/roomManager";

validateEnv();

const app = express();
const server = http.createServer(app);

const PORT = config.port;
const allowedOrigins = config.allowedOrigins;

// Socket.IO Setup (initialized early so RoomManager can be shared with REST routes)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 10000,
});

io.use(socketAuthMiddleware);

const roomManager = new RoomManager(io);
io.on("connection", (socket) => {
  roomManager.handleConnection(socket);
});

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());

// REST Routes
app.use("/api/auth", authRouter);
app.use("/api/rooms", createRoomsRouter(roomManager));
app.use("/api/livekit", createLiveKitRouter(roomManager));
app.use("/api/friends", createFriendsRouter(roomManager));

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Indian Rummy Server",
    timestamp: new Date().toISOString(),
  });
});

// Start Server when run directly
if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`♠♥♦♣ Rummy Server is running on 0.0.0.0:${PORT}`);
    console.log(`Allowed CORS origins: ${allowedOrigins.join(", ")}`);
    console.log(`LiveKit Video Token endpoint: http://localhost:${PORT}/api/livekit/token`);
    console.log(`Socket.IO endpoint ready`);
  });
}

export { app, io, roomManager, server };
