import {
  FriendItem,
  MatchHistoryItem,
  PendingFriendRequest,
  RoomInfo,
  User,
} from "../types";
import { getApiBaseUrl } from "./serverUrl";

export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("rummy_token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      (data as { error?: string }).error || "An unexpected error occurred",
      response.status
    );
  }

  return data as T;
}

export const api = {
  // Auth
  register: (body: { username: string; email: string; password: string }) =>
    apiRequest<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { login: string; password: string }) =>
    apiRequest<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  guestLogin: (body: { displayName?: string }) =>
    apiRequest<{ token: string; user: User }>("/api/auth/guest", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMe: () => apiRequest<{ user: User }>("/api/auth/me"),

  updateProfile: (body: { username?: string; avatarSeed?: string }) =>
    apiRequest<{ user: User; token: string }>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // Rooms
  createRoom: (body: {
    roomName?: string;
    maxPlayers?: number;
    targetPoints?: number;
    roundCount?: number;
    entryPoints?: number;
    turnTimeLimitSeconds?: number;
    password?: string;
  }) =>
    apiRequest<{ room: RoomInfo }>("/api/rooms/create", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getRoom: (code: string) => apiRequest<{ room: RoomInfo }>(`/api/rooms/${code}`),

  // LiveKit Video
  getLiveKitToken: (roomCode: string) =>
    apiRequest<{ token: string; serverUrl: string; identity: string; username: string }>(
      "/api/livekit/token",
      {
        method: "POST",
        body: JSON.stringify({ roomCode }),
      }
    ),

  // Friends & Social
  getFriends: () =>
    apiRequest<{ friends: FriendItem[]; pendingRequests: PendingFriendRequest[] }>(
      "/api/friends"
    ),

  sendFriendRequest: (username: string) =>
    apiRequest<{ message: string }>("/api/friends/request", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),

  respondFriendRequest: (requestId: string, action: "ACCEPT" | "REJECT") =>
    apiRequest<{ message: string }>("/api/friends/respond", {
      method: "POST",
      body: JSON.stringify({ requestId, action }),
    }),

  getHistory: () => apiRequest<{ history: MatchHistoryItem[] }>("/api/friends/history"),
};
