"use client";

import { Mic, MicOff, Wifi, WifiOff } from "lucide-react";
import Image from "next/image";
import React from "react";
import { PlayerPublicInfo } from "../../types";

interface VideoTileProps {
  player: PlayerPublicInfo;
  isSelf?: boolean;
  videoTrack?: any;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

export const VideoTile: React.FC<VideoTileProps> = ({
  player,
  isSelf = false,
  videoTrack,
  isMuted = false,
  isSpeaking = false,
}) => {
  return (
    <div
      className={`
        relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-zinc-950/90 backdrop-blur-md shadow-xl
        border-2 transition-all duration-300
        ${player.isCurrentTurn ? "border-amber-400 ring-4 ring-amber-400/40 shadow-amber-500/20 shadow-2xl scale-105 z-20" : "border-zinc-800 hover:border-zinc-700"}
        ${isSpeaking ? "ring-2 ring-emerald-400" : ""}
      `}
    >
      {/* Video Stream or Avatar Fallback */}
      {videoTrack ? (
        <video
          ref={(node) => {
            if (node && videoTrack) {
              videoTrack.attach(node);
            }
          }}
          autoPlay
          playsInline
          muted={isSelf}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 p-2">
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border border-zinc-700 shadow-md mb-1">
            <Image
              src={player.profileImage || `https://api.dicebear.com/7.x/bottts/svg?seed=${player.username}`}
              alt={player.username}
              fill
              className="object-cover"
            />
          </div>
          <span className="text-[10px] text-zinc-500 font-medium">Camera Off</span>
        </div>
      )}

      {/* Top Status Bar (Seat & Mic) */}
      <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between z-10 pointer-events-none">
        {/* Seat number */}
        <span className="bg-black/60 backdrop-blur-sm text-zinc-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
          S{player.seatNumber}
        </span>

        {/* Mic Indicator */}
        <div className={`p-1 rounded-full backdrop-blur-md ${isMuted ? "bg-red-600/80 text-white" : "bg-black/60 text-emerald-400"}`}>
          {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
        </div>
      </div>

      {/* Bottom Info Bar (Username, Turn, Card Count) */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-1.5 pt-4 flex flex-col z-10">
        <div className="flex items-center justify-between text-[11px] font-bold text-white leading-tight">
          <span className="truncate max-w-[80px] sm:max-w-[100px]">
            {player.username} {isSelf && "(You)"}
          </span>
          {/* Card Count Pill */}
          <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] px-1 rounded font-mono">
            {player.cardCount} 🂠
          </span>
        </div>

        {/* Turn or Status Indicator */}
        <div className="flex items-center justify-between text-[9px] mt-0.5">
          {player.hasDropped ? (
            <span className="text-red-400 font-semibold">Dropped</span>
          ) : player.isCurrentTurn ? (
            <span className="text-amber-400 font-bold animate-pulse">Thinking...</span>
          ) : (
            <span className="text-zinc-400">Waiting</span>
          )}

          {/* Connection status */}
          {player.connectionStatus === "DISCONNECTED" ? (
            <span className="text-red-400 flex items-center gap-0.5" title="Disconnected">
              <WifiOff className="w-2.5 h-2.5" />
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-0.5" title="Connected">
              <Wifi className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
