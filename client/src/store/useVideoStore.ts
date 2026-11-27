import { create } from "zustand";

export type VideoStatus = "connecting" | "live" | "audio-only" | "offline";

interface VideoStoreState {
  token: string | null;
  serverUrl: string | null;
  isMicMuted: boolean;
  isCameraOff: boolean;
  isVideoCollapsed: boolean;
  cameraPermissionDenied: boolean;
  micPermissionDenied: boolean;
  connectionError: string | null;
  activeSpeakers: string[];
  videoStatus: VideoStatus;
  videoStatusLabel: string;
  retryNonce: number;

  setVideoCredentials: (token: string, serverUrl: string) => void;
  setMicMuted: (muted: boolean) => void;
  setCameraOff: (off: boolean) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleCollapsed: () => void;
  setCameraPermissionDenied: (denied: boolean) => void;
  setMicPermissionDenied: (denied: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setActiveSpeakers: (speakers: string[]) => void;
  setVideoStatus: (status: VideoStatus, label: string) => void;
  requestRetry: () => void;
  resetVideo: () => void;
}

export const useVideoStore = create<VideoStoreState>((set) => ({
  token: null,
  serverUrl: null,
  isMicMuted: false,
  isCameraOff: false,
  isVideoCollapsed: false,
  cameraPermissionDenied: false,
  micPermissionDenied: false,
  connectionError: null,
  activeSpeakers: [],
  videoStatus: "connecting",
  videoStatusLabel: "Connecting...",
  retryNonce: 0,

  setVideoCredentials: (token, serverUrl) =>
    set({ token, serverUrl, connectionError: null }),
  setMicMuted: (muted) => set({ isMicMuted: muted }),
  setCameraOff: (off) => set({ isCameraOff: off }),
  toggleMic: () => set((state) => ({ isMicMuted: !state.isMicMuted })),
  toggleCamera: () => set((state) => ({ isCameraOff: !state.isCameraOff })),
  toggleCollapsed: () => set((state) => ({ isVideoCollapsed: !state.isVideoCollapsed })),
  setCameraPermissionDenied: (denied) =>
    set((state) => ({
      cameraPermissionDenied: denied,
      isCameraOff: denied ? true : state.isCameraOff,
    })),
  setMicPermissionDenied: (denied) =>
    set((state) => ({
      micPermissionDenied: denied,
      isMicMuted: denied ? true : state.isMicMuted,
    })),
  setConnectionError: (error) => set({ connectionError: error }),
  setActiveSpeakers: (speakers) =>
    set((state) => {
      if (
        state.activeSpeakers.length === speakers.length &&
        state.activeSpeakers.every((id, idx) => id === speakers[idx])
      ) {
        return state;
      }
      return { activeSpeakers: speakers };
    }),
  setVideoStatus: (status, label) =>
    set((state) =>
      state.videoStatus === status && state.videoStatusLabel === label
        ? state
        : { videoStatus: status, videoStatusLabel: label }
    ),
  requestRetry: () =>
    set((state) => ({
      retryNonce: state.retryNonce + 1,
      connectionError: null,
      videoStatus: "connecting",
      videoStatusLabel: "Connecting...",
    })),
  resetVideo: () =>
    set({
      token: null,
      serverUrl: null,
      isMicMuted: false,
      isCameraOff: false,
      cameraPermissionDenied: false,
      micPermissionDenied: false,
      connectionError: null,
      activeSpeakers: [],
      videoStatus: "connecting",
      videoStatusLabel: "Connecting...",
    }),
}));
