const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

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

  const response = await fetch(`${SERVER_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "An unexpected error occurred");
  }

  return data;
}

export const api = {
  // Auth
  register: (body: { username: string; email: string; password: string }) =>
    apiRequest<{ token: string; user: any }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { login: string; password: string }) =>
    apiRequest<{ token: string; user: any }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  guestLogin: (body: { displayName?: string }) =>
    apiRequest<{ token: string; user: any }>("/api/auth/guest", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getMe: () => apiRequest<{ user: any }>("/api/auth/me"),

  // Rooms
  createRoom: (body: {
    roomName?: string;
    maxPlayers?: number;
    roundCount?: number;
    entryPoints?: number;
  }) =>
    apiRequest<{ room: any }>("/api/rooms/create", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getRoom: (code: string) => apiRequest<{ room: any }>(`/api/rooms/${code}`),

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
  getFriends: () => apiRequest<{ friends: any[]; pendingRequests: any[] }>("/api/friends"),

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

  getHistory: () => apiRequest<{ history: any[] }>("/api/friends/history"),
};
