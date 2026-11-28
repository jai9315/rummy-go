import { create } from "zustand";
import { api } from "../lib/api";
import {
  FriendItem,
  FriendPresenceUpdate,
  OutgoingFriendRequest,
  PendingFriendRequest,
} from "../types";

interface FriendsStoreState {
  friends: FriendItem[];
  pendingRequests: PendingFriendRequest[];
  outgoingRequests: OutgoingFriendRequest[];
  loading: boolean;
  hasLoaded: boolean;

  fetchFriends: () => Promise<void>;
  applyPresenceUpdate: (update: FriendPresenceUpdate) => void;
  sendFriendRequest: (
    target: string | { username?: string; targetUserId?: string }
  ) => Promise<void>;
  respondFriendRequest: (
    requestId: string,
    action: "ACCEPT" | "DECLINE" | "REJECT"
  ) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  reset: () => void;
}

export const useFriendsStore = create<FriendsStoreState>((set, get) => ({
  friends: [],
  pendingRequests: [],
  outgoingRequests: [],
  loading: false,
  hasLoaded: false,

  fetchFriends: async () => {
    set({ loading: true });
    try {
      const res = await api.getFriends();
      set({
        friends: res.friends ?? [],
        pendingRequests: res.pendingRequests ?? [],
        outgoingRequests: res.outgoingRequests ?? [],
        hasLoaded: true,
      });
    } catch {
      // Non-fatal if unauthenticated or temporarily offline
    } finally {
      set({ loading: false });
    }
  },

  applyPresenceUpdate: (update) => {
    set((state) => ({
      friends: state.friends.map((item) => {
        if (item.friendUser?.id !== update.userId) return item;
        return {
          ...item,
          isOnline: update.isOnline,
          inRoomCode: update.inRoomCode,
        };
      }),
    }));
  },

  sendFriendRequest: async (target) => {
    await api.sendFriendRequest(target);
    await get().fetchFriends();
  },

  respondFriendRequest: async (requestId, action) => {
    await api.respondFriendRequest(requestId, action);
    await get().fetchFriends();
  },

  removeFriend: async (friendId) => {
    await api.removeFriend(friendId);
    await get().fetchFriends();
  },

  reset: () =>
    set({
      friends: [],
      pendingRequests: [],
      outgoingRequests: [],
      loading: false,
      hasLoaded: false,
    }),
}));
