import type { Socket } from "socket.io-client";

let activeSocket: Socket | null = null;

export function setActiveSocket(socket: Socket | null): void {
  activeSocket = socket;
}

export function getActiveSocket(): Socket | null {
  return activeSocket;
}
