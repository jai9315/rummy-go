"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import {
  ConnectionState,
  MediaDeviceFailure,
  RemoteAudioTrack,
  Track,
} from "livekit-client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AttachableVideoTrack } from "@/components/video/VideoTile";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useVideoStore } from "@/store/useVideoStore";

export interface PlayerMediaInfo {
  videoTrack?: AttachableVideoTrack;
  isMuted: boolean;
  isSpeaking: boolean;
  cameraLabel: string;
}

interface LiveKitMediaContextValue {
  isConnected: boolean;
  getPlayerMedia: (playerId: string, isSelf?: boolean) => PlayerMediaInfo;
}

const defaultMediaContext: LiveKitMediaContextValue = {
  isConnected: false,
  getPlayerMedia: (_playerId, isSelf) => ({
    videoTrack: undefined,
    isMuted: true,
    isSpeaking: false,
    cameraLabel: isSelf ? "Camera Off" : "Offline",
  }),
};

const LiveKitMediaContext =
  createContext<LiveKitMediaContextValue>(defaultMediaContext);

export function useLiveKitMedia(): LiveKitMediaContextValue {
  return useContext(LiveKitMediaContext);
}

function isPermissionOrDeviceError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  const message =
    "message" in err ? String((err as { message?: unknown }).message) : "";
  return (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "NotReadableError" ||
    /permission|camera|video|device|not allowed/i.test(message)
  );
}

interface LiveKitMediaBridgeProps {
  audioOnlyMode: boolean;
  children: React.ReactNode;
}

/**
 * Connected LiveKit media bridge. MUST ONLY be rendered inside <LiveKitRoom>.
 * All LiveKit hooks and <RoomAudioRenderer /> live strictly inside this component
 * so perimeter opponent tiles, bottom-left local tile, and spotlight modal all
 * consume real LiveKit tracks from a single connection.
 */
function LiveKitMediaBridge({
  audioOnlyMode,
  children,
}: LiveKitMediaBridgeProps) {
  const user = useAuthStore((s) => s.user);
  const {
    isMicMuted,
    isCameraOff,
    cameraPermissionDenied,
    micPermissionDenied,
    activeSpeakers,
    mutedRemotePlayerIds,
    setCameraPermissionDenied,
    setMicPermissionDenied,
    setActiveSpeakers,
    setVideoStatus,
  } = useVideoStore();

  const connectionState = useConnectionState();
  const { localParticipant, cameraTrack } = useLocalParticipant();
  const participants = useParticipants();
  const speakingParticipants = useSpeakingParticipants();
  const trackReferences = useTracks(
    [Track.Source.Camera, Track.Source.Microphone],
    { onlySubscribed: false }
  );

  const isRoomConnected = connectionState === ConnectionState.Connected;

  // Publish live connection state for the Top HUD Bar badge
  useEffect(() => {
    if (!isRoomConnected) {
      setVideoStatus("connecting", "Connecting...");
    } else if (audioOnlyMode || cameraPermissionDenied) {
      setVideoStatus("audio-only", "Audio Only");
    } else {
      setVideoStatus("live", "Live Video");
    }
  }, [isRoomConnected, audioOnlyMode, cameraPermissionDenied, setVideoStatus]);

  // Sync active speaker identities into video store
  useEffect(() => {
    const speakerIds = speakingParticipants.map((p) => p.identity);
    setActiveSpeakers(speakerIds);
  }, [speakingParticipants, setActiveSpeakers]);

  // Apply microphone toggle once LiveKit room is connected (single media controller)
  useEffect(() => {
    if (!localParticipant || !isRoomConnected) return;
    if (micPermissionDenied && !isMicMuted) return;
    const shouldEnable = !isMicMuted;
    if (localParticipant.isMicrophoneEnabled === shouldEnable) return;

    localParticipant.setMicrophoneEnabled(shouldEnable).catch((err: unknown) => {
      console.warn("Microphone toggle failed:", err);
      if (isPermissionOrDeviceError(err)) {
        setMicPermissionDenied(true);
      }
    });
  }, [
    localParticipant,
    isRoomConnected,
    isMicMuted,
    micPermissionDenied,
    setMicPermissionDenied,
  ]);

  // Apply camera toggle once LiveKit room is connected; fall back to audio-only on denial
  useEffect(() => {
    if (!localParticipant || !isRoomConnected) return;
    if (cameraPermissionDenied && !isCameraOff) return;
    const shouldEnable = !isCameraOff;
    if (localParticipant.isCameraEnabled === shouldEnable) return;

    localParticipant.setCameraEnabled(shouldEnable).catch((err: unknown) => {
      console.warn(
        "Camera unavailable or denied, falling back to audio-only:",
        err
      );
      if (isPermissionOrDeviceError(err)) {
        setCameraPermissionDenied(true);
      }
    });
  }, [
    localParticipant,
    isRoomConnected,
    isCameraOff,
    cameraPermissionDenied,
    setCameraPermissionDenied,
  ]);

  // Apply local per-opponent mute directly onto subscribed RemoteAudioTracks
  useEffect(() => {
    const mutedSet = new Set(mutedRemotePlayerIds);
    for (const ref of trackReferences) {
      if (ref.source !== Track.Source.Microphone) continue;
      const track = ref.publication?.track;
      if (track instanceof RemoteAudioTrack) {
        const shouldSilence = mutedSet.has(ref.participant.identity);
        track.setVolume(shouldSilence ? 0 : 1);
      }
    }
  }, [trackReferences, mutedRemotePlayerIds]);

  const activeSpeakerSet = useMemo(
    () => new Set(activeSpeakers),
    [activeSpeakers]
  );

  const localCameraPub =
    cameraTrack ?? localParticipant?.getTrackPublication(Track.Source.Camera);
  const localCameraTrack =
    !isCameraOff &&
    !cameraPermissionDenied &&
    localCameraPub &&
    !localCameraPub.isMuted
      ? localCameraPub.track
      : undefined;

  const getPlayerMedia = useCallback(
    (playerId: string, isSelf = false): PlayerMediaInfo => {
      if (isSelf || playerId === user?.id) {
        return {
          videoTrack: localCameraTrack,
          isMuted: isMicMuted || micPermissionDenied,
          isSpeaking:
            activeSpeakerSet.has(playerId) ||
            Boolean(localParticipant?.isSpeaking),
          cameraLabel: cameraPermissionDenied
            ? "Audio Only"
            : isCameraOff
            ? "Camera Off"
            : "Starting...",
        };
      }

      const remoteParticipant = participants.find(
        (p) => p.identity === playerId
      );
      const cameraTrackRef = trackReferences.find(
        (t) =>
          t.participant.identity === playerId &&
          t.source === Track.Source.Camera &&
          !t.publication?.isMuted &&
          Boolean(t.publication?.track)
      );
      const micTrackRef = trackReferences.find(
        (t) =>
          t.participant.identity === playerId &&
          t.source === Track.Source.Microphone
      );

      const isRemoteMuted = remoteParticipant
        ? !remoteParticipant.isMicrophoneEnabled
        : micTrackRef?.publication?.isMuted ?? true;

      const isRemoteSpeaking =
        activeSpeakerSet.has(playerId) ||
        Boolean(remoteParticipant?.isSpeaking);

      return {
        videoTrack: cameraTrackRef?.publication?.track,
        isMuted: isRemoteMuted,
        isSpeaking: isRemoteSpeaking,
        cameraLabel: remoteParticipant ? "Camera Off" : "Connected",
      };
    },
    [
      user?.id,
      localCameraTrack,
      isMicMuted,
      micPermissionDenied,
      activeSpeakerSet,
      localParticipant?.isSpeaking,
      cameraPermissionDenied,
      isCameraOff,
      participants,
      trackReferences,
    ]
  );

  const contextValue = useMemo<LiveKitMediaContextValue>(
    () => ({
      isConnected: isRoomConnected,
      getPlayerMedia,
    }),
    [isRoomConnected, getPlayerMedia]
  );

  return (
    <LiveKitMediaContext.Provider value={contextValue}>
      {children}
      <RoomAudioRenderer />
    </LiveKitMediaContext.Provider>
  );
}

interface VideoOverlayProps {
  roomCode: string;
  children?: React.ReactNode;
}

/**
 * Wraps the active Royal 13 Table in a single resilient LiveKit connection.
 * When LiveKit is unavailable, offline, or credentials are placeholders, renders
 * children directly inside a safe fallback context (ZERO LiveKit hooks called).
 */
export const VideoOverlay: React.FC<VideoOverlayProps> = ({
  roomCode,
  children,
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const {
    cameraPermissionDenied,
    retryNonce,
    setVideoCredentials,
    setCameraPermissionDenied,
    setMicPermissionDenied,
    setConnectionError,
    setVideoStatus,
    resetVideo,
  } = useVideoStore();

  useEffect(() => {
    let mounted = true;
    setToken(null);
    setServerUrl(null);
    setFallbackReason(null);
    setVideoStatus("connecting", "Connecting...");

    api
      .getLiveKitToken(roomCode)
      .then((data) => {
        if (!mounted) return;
        if (data?.token && data?.serverUrl) {
          if (data.serverUrl.includes("your-livekit-server.example.com")) {
            setFallbackReason("Configure LIVEKIT_URL");
            setConnectionError("Placeholder LiveKit URL detected in .env");
            setVideoStatus("offline", "Configure LiveKit");
            return;
          }
          setToken(data.token);
          setServerUrl(data.serverUrl);
          setVideoCredentials(data.token, data.serverUrl);
          setFallbackReason(null);
        } else {
          setFallbackReason("Video Unavailable");
          setVideoStatus("offline", "Video Offline");
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        console.warn("LiveKit token fetch failed or offline mode:", err);
        setToken(null);
        setServerUrl(null);
        setFallbackReason("Video Offline");
        setConnectionError(
          err instanceof Error ? err.message : "LiveKit unavailable"
        );
        setVideoStatus("offline", "Video Offline");
      });

    return () => {
      mounted = false;
    };
  }, [
    roomCode,
    retryNonce,
    setVideoCredentials,
    setConnectionError,
    setVideoStatus,
  ]);

  // Reset store credentials cleanly on unmount
  useEffect(() => {
    return () => {
      resetVideo();
    };
  }, [resetVideo]);

  const handleMediaDeviceFailure = useCallback(
    (failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
      console.warn("LiveKit media device failure:", failure, kind);
      if (kind === "videoinput") {
        setCameraPermissionDenied(true);
        return;
      }
      if (kind === "audioinput") {
        setMicPermissionDenied(true);
        return;
      }
      setCameraPermissionDenied(true);
    },
    [setCameraPermissionDenied, setMicPermissionDenied]
  );

  const handleLiveKitError = useCallback(
    (err: Error) => {
      console.warn("LiveKit room error:", err);
      if (isPermissionOrDeviceError(err)) {
        setCameraPermissionDenied(true);
        return;
      }
      setConnectionError(err.message);
      setFallbackReason("Video Unavailable");
      setVideoStatus("offline", "Video Offline");
    },
    [setCameraPermissionDenied, setConnectionError, setVideoStatus]
  );

  const fallbackContext = useMemo<LiveKitMediaContextValue>(
    () => ({
      isConnected: false,
      getPlayerMedia: (_playerId, isSelf) => ({
        videoTrack: undefined,
        isMuted: true,
        isSpeaking: false,
        cameraLabel: isSelf ? "Avatar" : "Connected",
      }),
    }),
    []
  );

  if (token && serverUrl && !fallbackReason) {
    return (
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        video={false}
        audio={false}
        onMediaDeviceFailure={handleMediaDeviceFailure}
        onError={handleLiveKitError}
        className="w-full h-full flex flex-col flex-1 min-h-0"
      >
        <LiveKitMediaBridge audioOnlyMode={cameraPermissionDenied}>
          {children}
        </LiveKitMediaBridge>
      </LiveKitRoom>
    );
  }

  // Fallback: ZERO LiveKit hooks — children still render the full table & avatars cleanly
  return (
    <LiveKitMediaContext.Provider value={fallbackContext}>
      <div className="w-full h-full flex flex-col flex-1 min-h-0">{children}</div>
    </LiveKitMediaContext.Provider>
  );
};

// Backwards-compatible fallback export for VideoErrorBoundary
export const VideoFallbackGrid: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <LiveKitMediaContext.Provider value={defaultMediaContext}>
    <div className="w-full h-full flex flex-col flex-1 min-h-0">{children}</div>
  </LiveKitMediaContext.Provider>
);
