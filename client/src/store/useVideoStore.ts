import { create } from "zustand";

interface VideoStoreState {
  token: string | null;
  serverUrl: string | null;
  isMicMuted: boolean;
  isCameraOff: boolean;
  isVideoCollapsed: boolean;
  activeSpeakers: string[];

  setVideoCredentials: (token: string, serverUrl: string) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleCollapsed: () => void;
  setActiveSpeakers: (speakers: string[]) => void;
  resetVideo: () => void;
}

export const useVideoStore = create<VideoStoreState>((set) => ({
  token: null,
  serverUrl: null,
  isMicMuted: false,
  isCameraOff: false,
  isVideoCollapsed: false,
  activeSpeakers: [],

  setVideoCredentials: (token, serverUrl) => set({ token, serverUrl }),
  toggleMic: () => set((state) => ({ isMicMuted: !state.isMicMuted })),
  toggleCamera: () => set((state) => ({ isCameraOff: !state.isCameraOff })),
  toggleCollapsed: () => set((state) => ({ isVideoCollapsed: !state.isVideoCollapsed })),
  setActiveSpeakers: (speakers) => set({ activeSpeakers: speakers }),
  resetVideo: () =>
    set({
      token: null,
      serverUrl: null,
      isMicMuted: false,
      isCameraOff: false,
      activeSpeakers: [],
    }),
}));
