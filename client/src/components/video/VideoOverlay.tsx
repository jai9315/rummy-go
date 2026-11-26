"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Camera, CameraOff, ChevronDown, ChevronUp, Mic, MicOff } from "lucide-react";
import React, { useEffect, useState } from "react";
import { VideoTile } from "@/components/video/VideoTile";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { useVideoStore } from "@/store/useVideoStore";

interface VideoOverlayProps {
  roomCode: string;
}

function VideoGridContent() {
  const user = useAuthStore((s) => s.user);
  const gameState = useGameStore((s) => s.gameState);
  const { isMicMuted, isCameraOff, isVideoCollapsed, toggleMic, toggleCamera, toggleCollapsed } =
    useVideoStore();

  const { localParticipant } = useLocalParticipant();
  const trackReferences = useTracks([Track.Source.Camera, Track.Source.Microphone], {
    onlySubscribed: false,
  });

  // Apply mute/camera toggles to local participant
  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMicMuted).catch(() => {});
      localParticipant.setCameraEnabled(!isCameraOff).catch(() => {});
    }
  }, [localParticipant, isMicMuted, isCameraOff]);

  if (!gameState) return null;

  // Separate other players vs self
  const otherPlayers = gameState.players.filter((p) => p.id !== user?.id);
  const selfPlayer = gameState.players.find((p) => p.id === user?.id);

  return (
    <div className="w-full flex flex-col items-center">
      {/* Video Bar Header & Controls */}
      <div className="flex items-center justify-between w-full max-w-5xl px-4 py-1.5 mb-2 bg-zinc-950/70 backdrop-blur-md rounded-2xl border border-zinc-800 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-300">Live Video Table</span>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
            WebRTC Live
          </span>
        </div>

        {/* Media Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMic}
            className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
              isMicMuted
                ? "bg-red-600/30 border-red-500/60 text-red-300 hover:bg-red-600/40"
                : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
            }`}
            title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isMicMuted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
          </button>

          <button
            onClick={toggleCamera}
            className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition ${
              isCameraOff
                ? "bg-red-600/30 border-red-500/60 text-red-300 hover:bg-red-600/40"
                : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700"
            }`}
            title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
          >
            {isCameraOff ? <CameraOff className="w-4 h-4 text-red-400" /> : <Camera className="w-4 h-4 text-blue-400" />}
          </button>

          <button
            onClick={toggleCollapsed}
            className="p-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
            title={isVideoCollapsed ? "Expand Video Tiles" : "Minimize Video Tiles"}
          >
            {isVideoCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Perimeter Video Tiles Grid */}
      {!isVideoCollapsed && (
        <div className="flex items-center justify-center flex-wrap gap-2.5 sm:gap-4 max-w-5xl px-2 py-1">
          {/* Other players video tiles */}
          {otherPlayers.map((player) => {
            const trackRef = trackReferences.find(
              (t) => t.participant.identity === player.id && t.source === Track.Source.Camera
            );

            return (
              <VideoTile
                key={player.id}
                player={player}
                videoTrack={trackRef?.publication?.track}
                isMuted={false}
              />
            );
          })}

          {/* Self player video tile */}
          {selfPlayer && (
            <VideoTile
              player={selfPlayer}
              isSelf={true}
              videoTrack={localParticipant?.getTrackPublication(Track.Source.Camera)?.track}
              isMuted={isMicMuted}
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

  useEffect(() => {
    let mounted = true;
    api
      .getLiveKitToken(roomCode)
      .then((data) => {
        if (mounted) {
          setToken(data.token);
          setServerUrl(data.serverUrl);
        }
      })
      .catch((err) => {
        console.warn("LiveKit token fetch failed or offline mode:", err);
      });

    return () => {
      mounted = false;
    };
  }, [roomCode]);

  // If LiveKit token is obtained, render LiveKitRoom
  if (token && serverUrl) {
    return (
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        video={true}
        audio={true}
        className="w-full flex justify-center"
      >
        <VideoGridContent />
      </LiveKitRoom>
    );
  }

  // Fallback if LiveKit server is offline or loading: still render video tiles with avatars
  return <VideoGridContent />;
};
