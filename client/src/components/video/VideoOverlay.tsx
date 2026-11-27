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
import { ConnectionState, MediaDeviceFailure, Track } from "livekit-client";
import {
  Camera,
  CameraOff,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  RefreshCw,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { VideoTile } from "@/components/video/VideoTile";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { useVideoStore } from "@/store/useVideoStore";

interface VideoOverlayProps {
  roomCode: string;
}

interface VideoFallbackGridProps {
  statusLabel?: string;
  onRetry?: () => void;
}

function isPermissionOrDeviceError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  const message = "message" in err ? String((err as { message?: unknown }).message) : "";
  return (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "NotReadableError" ||
    /permission|camera|video|device|not allowed/i.test(message)
  );
}

/**
 * Fallback player grid rendered while the LiveKit token is loading, when
 * permissions are declined, or when LiveKit is unavailable/offline.
 * Uses ZERO LiveKit hooks so gameplay can never crash.
 */
export const VideoFallbackGrid: React.FC<VideoFallbackGridProps> = ({
  statusLabel = "Audio/Video Offline",
  onRetry,
}) => {
  const user = useAuthStore((s) => s.user);
  const gameState = useGameStore((s) => s.gameState);
  const { isVideoCollapsed, toggleCollapsed } = useVideoStore();

  if (!gameState) return null;

  const otherPlayers = gameState.players.filter((p) => p.id !== user?.id);
  const selfPlayer = gameState.players.find((p) => p.id === user?.id);

  return (
    <div className="w-full flex flex-col items-center">
      {/* Fallback Video Bar Header */}
      <div className="flex items-center justify-between w-full max-w-5xl px-4 py-1.5 mb-2 bg-zinc-950/70 backdrop-blur-md rounded-2xl border border-zinc-800 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-300">Table Players</span>
          <span className="text-[10px] bg-zinc-800 text-zinc-400 font-semibold px-2 py-0.5 rounded-full border border-zinc-700">
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-2 py-1 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-[11px] font-semibold flex items-center gap-1 transition"
              title="Retry Video Connection"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
            title={isVideoCollapsed ? "Expand Player Tiles" : "Minimize Player Tiles"}
          >
            {isVideoCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Perimeter Avatar Tiles Grid */}
      {!isVideoCollapsed && (
        <div className="flex items-center justify-center flex-wrap gap-2.5 sm:gap-4 max-w-5xl px-2 py-1">
          {otherPlayers.map((player) => (
            <VideoTile
              key={player.id}
              player={player}
              isMuted={true}
              isSpeaking={false}
              cameraLabel={
                player.connectionStatus === "CONNECTED" ? "Connected" : "Offline"
              }
            />
          ))}

          {selfPlayer && (
            <VideoTile
              player={selfPlayer}
              isSelf={true}
              isMuted={true}
              isSpeaking={false}
              cameraLabel="Avatar Mode"
            />
          )}
        </div>
      )}
    </div>
  );
};

interface LiveKitConnectedGridProps {
  audioOnlyMode: boolean;
}

/**
 * Connected LiveKit participant grid. MUST ONLY be rendered inside <LiveKitRoom>.
 * All LiveKit hooks and <RoomAudioRenderer /> live strictly inside this component.
 */
function LiveKitConnectedGrid({ audioOnlyMode }: LiveKitConnectedGridProps) {
  const user = useAuthStore((s) => s.user);
  const gameState = useGameStore((s) => s.gameState);
  const {
    isMicMuted,
    isCameraOff,
    isVideoCollapsed,
    cameraPermissionDenied,
    micPermissionDenied,
    activeSpeakers,
    toggleMic,
    toggleCamera,
    toggleCollapsed,
    setCameraPermissionDenied,
    setMicPermissionDenied,
    setActiveSpeakers,
  } = useVideoStore();

  const connectionState = useConnectionState();
  const { localParticipant, cameraTrack } = useLocalParticipant();
  const participants = useParticipants();
  const speakingParticipants = useSpeakingParticipants();
  const trackReferences = useTracks([Track.Source.Camera, Track.Source.Microphone], {
    onlySubscribed: false,
  });

  const isRoomConnected = connectionState === ConnectionState.Connected;

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
  }, [localParticipant, isRoomConnected, isMicMuted, micPermissionDenied, setMicPermissionDenied]);

  // Apply camera toggle once LiveKit room is connected; fall back to audio-only on denial
  useEffect(() => {
    if (!localParticipant || !isRoomConnected) return;
    if (cameraPermissionDenied && !isCameraOff) return;
    const shouldEnable = !isCameraOff;
    if (localParticipant.isCameraEnabled === shouldEnable) return;

    localParticipant.setCameraEnabled(shouldEnable).catch((err: unknown) => {
      console.warn("Camera unavailable or denied, falling back to audio-only:", err);
      if (isPermissionOrDeviceError(err)) {
        setCameraPermissionDenied(true);
      }
    });
  }, [localParticipant, isRoomConnected, isCameraOff, cameraPermissionDenied, setCameraPermissionDenied]);

  const activeSpeakerSet = useMemo(() => new Set(activeSpeakers), [activeSpeakers]);

  if (!gameState) return null;

  const otherPlayers = gameState.players.filter((p) => p.id !== user?.id);
  const selfPlayer = gameState.players.find((p) => p.id === user?.id);

  const localCameraPub =
    cameraTrack ?? localParticipant?.getTrackPublication(Track.Source.Camera);
  const localCameraTrack =
    !isCameraOff && !cameraPermissionDenied && localCameraPub && !localCameraPub.isMuted
      ? localCameraPub.track
      : undefined;

  return (
    <div className="w-full flex flex-col items-center">
      {/* Video Bar Header & Controls */}
      <div className="flex items-center justify-between w-full max-w-5xl px-4 py-1.5 mb-2 bg-zinc-950/70 backdrop-blur-md rounded-2xl border border-zinc-800 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-300">Live Video Table</span>
          {!isRoomConnected ? (
            <span className="text-[10px] bg-zinc-800 text-zinc-300 font-semibold px-2 py-0.5 rounded-full border border-zinc-700">
              Connecting...
            </span>
          ) : audioOnlyMode || cameraPermissionDenied ? (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">
              Audio Only
            </span>
          ) : (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
              WebRTC Live
            </span>
          )}
        </div>

        {/* Media Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMic}
            disabled={micPermissionDenied}
            className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
              micPermissionDenied
                ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                : isMicMuted
                ? "bg-red-600/30 border-red-500/60 text-red-300 hover:bg-red-600/40"
                : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
            }`}
            title={
              micPermissionDenied
                ? "Microphone permission denied"
                : isMicMuted
                ? "Unmute Mic"
                : "Mute Mic"
            }
          >
            {isMicMuted || micPermissionDenied ? (
              <MicOff className="w-4 h-4 text-red-400" />
            ) : (
              <Mic className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          <button
            onClick={toggleCamera}
            disabled={cameraPermissionDenied}
            className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
              cameraPermissionDenied
                ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                : isCameraOff
                ? "bg-red-600/30 border-red-500/60 text-red-300 hover:bg-red-600/40"
                : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
            }`}
            title={
              cameraPermissionDenied
                ? "Camera unavailable (Audio-only mode)"
                : isCameraOff
                ? "Turn Camera On"
                : "Turn Camera Off"
            }
          >
            {isCameraOff || cameraPermissionDenied ? (
              <CameraOff className="w-4 h-4 text-red-400" />
            ) : (
              <Camera className="w-4 h-4 text-blue-400" />
            )}
          </button>

          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
            title={isVideoCollapsed ? "Expand Video Tiles" : "Minimize Video Tiles"}
          >
            {isVideoCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Perimeter Video Tiles Grid */}
      {!isVideoCollapsed && (
        <div className="flex items-center justify-center flex-wrap gap-2.5 sm:gap-4 max-w-5xl px-2 py-1">
          {/* Other players video tiles */}
          {otherPlayers.map((player) => {
            const remoteParticipant = participants.find(
              (p) => p.identity === player.id
            );
            const cameraTrackRef = trackReferences.find(
              (t) =>
                t.participant.identity === player.id &&
                t.source === Track.Source.Camera &&
                !t.publication?.isMuted
            );
            const micTrackRef = trackReferences.find(
              (t) =>
                t.participant.identity === player.id &&
                t.source === Track.Source.Microphone
            );

            const isRemoteMuted = remoteParticipant
              ? !remoteParticipant.isMicrophoneEnabled
              : micTrackRef?.publication?.isMuted ?? true;

            const isRemoteSpeaking =
              activeSpeakerSet.has(player.id) ||
              Boolean(remoteParticipant?.isSpeaking);

            return (
              <VideoTile
                key={player.id}
                player={player}
                videoTrack={cameraTrackRef?.publication?.track}
                isMuted={isRemoteMuted}
                isSpeaking={isRemoteSpeaking}
              />
            );
          })}

          {/* Self player video tile */}
          {selfPlayer && (
            <VideoTile
              player={selfPlayer}
              isSelf={true}
              videoTrack={localCameraTrack}
              isMuted={isMicMuted || micPermissionDenied}
              isSpeaking={
                activeSpeakerSet.has(selfPlayer.id) ||
                Boolean(localParticipant?.isSpeaking)
              }
              cameraLabel={cameraPermissionDenied ? "Audio Only" : "Camera Off"}
            />
          )}
        </div>
      )}

      <RoomAudioRenderer />
    </div>
  );
}

export const VideoOverlay: React.FC<VideoOverlayProps> = ({ roomCode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState<boolean>(true);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState<number>(0);

  const {
    isCameraOff,
    isMicMuted,
    cameraPermissionDenied,
    micPermissionDenied,
    setVideoCredentials,
    setCameraPermissionDenied,
    setMicPermissionDenied,
    setConnectionError,
    resetVideo,
  } = useVideoStore();

  useEffect(() => {
    let mounted = true;
    setIsLoadingToken(true);
    setFallbackReason(null);

    api
      .getLiveKitToken(roomCode)
      .then((data) => {
        if (!mounted) return;
        if (data?.token && data?.serverUrl) {
          if (data.serverUrl.includes("your-livekit-server.example.com")) {
            setFallbackReason("Configure LIVEKIT_URL in .env");
            setConnectionError("Placeholder LiveKit URL detected in .env");
            return;
          }
          setToken(data.token);
          setServerUrl(data.serverUrl);
          setVideoCredentials(data.token, data.serverUrl);
          setFallbackReason(null);
        } else {
          setFallbackReason("Video Unavailable");
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
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingToken(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [roomCode, retryCounter, setVideoCredentials, setConnectionError]);

  // Reset store credentials cleanly on unmount
  useEffect(() => {
    return () => {
      resetVideo();
    };
  }, [resetVideo]);

  const handleRetry = useCallback(() => {
    setToken(null);
    setServerUrl(null);
    setFallbackReason(null);
    setConnectionError(null);
    setRetryCounter((c) => c + 1);
  }, [setConnectionError]);

  const handleMediaDeviceFailure = useCallback(
    (failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
      console.warn("LiveKit media device failure:", failure, kind);
      if (kind === "videoinput") {
        // Fall back gracefully to audio-only without blocking gameplay
        setCameraPermissionDenied(true);
        return;
      }
      if (kind === "audioinput") {
        setMicPermissionDenied(true);
        return;
      }
      // Generic media failure: disable camera first so audio-only remains possible
      if (failure === MediaDeviceFailure.PermissionDenied) {
        setCameraPermissionDenied(true);
      } else {
        setCameraPermissionDenied(true);
      }
    },
    [setCameraPermissionDenied, setMicPermissionDenied]
  );

  const handleLiveKitError = useCallback(
    (err: Error) => {
      console.warn("LiveKit room error:", err);
      if (isPermissionOrDeviceError(err)) {
        // Camera/mic permission issue — fall back to audio-only, do not crash
        setCameraPermissionDenied(true);
        return;
      }
      // LiveKit server unreachable / disconnected -> fall back cleanly to avatar grid
      setConnectionError(err.message);
      setFallbackReason("Video Unavailable");
    },
    [setCameraPermissionDenied, setConnectionError]
  );

  // If LiveKit token & serverUrl exist and connection hasn't failed, render LiveKitRoom.
  // Pass video={false}/audio={false} so LiveKitConnectedGrid is the single media controller
  // once ConnectionState.Connected is reached (avoids duplicate getUserMedia races).
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
        className="w-full flex justify-center"
      >
        <LiveKitConnectedGrid audioOnlyMode={cameraPermissionDenied} />
      </LiveKitRoom>
    );
  }

  // Fallback: ZERO LiveKit hooks — renders avatars, names, turn & socket status cleanly
  return (
    <VideoFallbackGrid
      statusLabel={
        isLoadingToken ? "Connecting Video..." : fallbackReason || "Video Offline"
      }
      onRetry={!isLoadingToken ? handleRetry : undefined}
    />
  );
};
