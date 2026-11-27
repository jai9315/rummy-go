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
 * Fallback player strip rendered while the LiveKit token is loading, when
 * permissions are declined, or when LiveKit is unavailable/offline.
 * Uses ZERO LiveKit hooks so gameplay can never crash.
 */
export const VideoFallbackGrid: React.FC<VideoFallbackGridProps> = () => {
  const user = useAuthStore((s) => s.user);
  const gameState = useGameStore((s) => s.gameState);
  const isVideoCollapsed = useVideoStore((s) => s.isVideoCollapsed);

  if (!gameState || isVideoCollapsed) return null;

  const otherPlayers = gameState.players.filter((p) => p.id !== user?.id);
  const selfPlayer = gameState.players.find((p) => p.id === user?.id);

  return (
    <div className="w-full flex items-center justify-center flex-wrap mobile-landscape:flex-nowrap mobile-landscape:overflow-x-auto gap-1.5 sm:gap-2.5 mobile-landscape:gap-1.5 max-w-5xl mx-auto px-1">
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
          cameraLabel="Avatar"
        />
      )}
    </div>
  );
};

interface LiveKitConnectedGridProps {
  audioOnlyMode: boolean;
}

/**
 * Connected LiveKit participant strip. MUST ONLY be rendered inside <LiveKitRoom>.
 * All LiveKit hooks and <RoomAudioRenderer /> live strictly inside this component.
 * Header controls (Mic, Camera, Collapse, Status) live in Table's Top Header Bar via useVideoStore.
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
    setCameraPermissionDenied,
    setMicPermissionDenied,
    setActiveSpeakers,
    setVideoStatus,
  } = useVideoStore();

  const connectionState = useConnectionState();
  const { localParticipant, cameraTrack } = useLocalParticipant();
  const participants = useParticipants();
  const speakingParticipants = useSpeakingParticipants();
  const trackReferences = useTracks([Track.Source.Camera, Track.Source.Microphone], {
    onlySubscribed: false,
  });

  const isRoomConnected = connectionState === ConnectionState.Connected;

  // Publish live connection state for the compact Top Header Bar badge
  useEffect(() => {
    if (!isRoomConnected) {
      setVideoStatus("connecting", "Connecting...");
    } else if (audioOnlyMode || cameraPermissionDenied) {
      setVideoStatus("audio-only", "Audio Only");
    } else {
      setVideoStatus("live", "WebRTC Live");
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
      {!isVideoCollapsed && (
        <div className="w-full flex items-center justify-center flex-wrap mobile-landscape:flex-nowrap mobile-landscape:overflow-x-auto gap-1.5 sm:gap-2.5 mobile-landscape:gap-1.5 max-w-5xl mx-auto px-1">
          {/* Other players video tiles */}
          {otherPlayers.map((player) => {
            const remoteParticipant = participants.find(
              (p) => p.identity === player.id
            );
            const cameraTrackRef = trackReferences.find(
              (t) =>
                t.participant.identity === player.id &&
                t.source === Track.Source.Camera &&
                !t.publication?.isMuted &&
                Boolean(t.publication?.track)
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
    setIsLoadingToken(true);
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
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingToken(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [roomCode, retryNonce, setVideoCredentials, setConnectionError, setVideoStatus]);

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
        isLoadingToken ? "Connecting..." : fallbackReason || "Video Offline"
      }
    />
  );
};
