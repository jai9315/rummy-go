import { create } from "zustand";
import { api } from "../lib/api";
import { User } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initAuth: () => Promise<void>;
  setUserSession: (user: User, token: string) => void;
  updateUser: (user: User, token?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  initAuth: async () => {
    if (typeof window === "undefined") {
      set({ isLoading: false });
      return;
    }

    const savedToken = localStorage.getItem("rummy_token");
    if (!savedToken) {
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const { user } = await api.getMe();
      set({ user, token: savedToken, isAuthenticated: true, isLoading: false });
    } catch (err) {
      localStorage.removeItem("rummy_token");
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUserSession: (user: User, token: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("rummy_token", token);
    }
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  updateUser: (user: User, token?: string) => {
    if (token && typeof window !== "undefined") {
      localStorage.setItem("rummy_token", token);
    }
    set((state) => ({
      user,
      token: token ?? state.token,
    }));
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("rummy_token");
    }
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },
}));
