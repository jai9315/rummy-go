import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { AuthTokenPayload } from "../routes/auth";

const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_jwt_key_2026";

export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): void {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    socket.data.user = decoded;
    next();
  } catch (error) {
    next(new Error("Invalid authentication token"));
  }
}
