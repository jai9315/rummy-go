import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { config } from "../config";
import { AuthTokenPayload } from "../routes/auth";

export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): void {
  try {
    const authToken = socket.handshake.auth?.token;
    const headerAuth = socket.handshake.headers?.authorization;
    const token =
      typeof authToken === "string"
        ? authToken
        : typeof headerAuth === "string"
          ? headerAuth.split(" ")[1]
          : undefined;

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const decoded = jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
    (socket.data as { user?: AuthTokenPayload }).user = decoded;
    next();
  } catch {
    next(new Error("Invalid authentication token"));
  }
}
