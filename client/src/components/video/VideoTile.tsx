"use client";

import { Mic, MicOff, Wifi, WifiOff } from "lucide-react";
import Image from "next/image";
import React, { useEffect, useRef } from "react";
import { PlayerPublicInfo } from "../../types";

export interface AttachableVideoTrack {
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[];
}

interface VideoTileProps {
  player: PlayerPublicInfo;
  isSelf?: boolean;
  videoTrack?: AttachableVideoTrack | null;
  isMuted?: boolean;
  isSpeaking?: boolean;
  cameraLabel?: string;
}

/**
 * Compact miniature card-back fan rendered INSIDE the bottom-right corner of an
 * opponent's VideoTile so it never hangs below the tile or overlaps the deck.
 * Face-down only — never reveals any card value or private hand data.
 */
const InlineOpponentCardFan: React.FC<{ cardCount: number }> = ({ cardCount }) => {
  const visibleBacks = Math.min(Math.max(cardCount, 0), 5);
  if (visibleBacks <= 0) return null;

  const mid = (visibleBacks - 1) / 2;

  return (
    <div
      className="flex items-center gap-1 bg-zinc-950/85 border border-amber-500/40 rounded px-1 py-0.5 select-none shrink-0"
      aria-label={`${cardCount} cards in hand`}
      title={`${cardCount} cards in hand`}
    >
      <div className="hidden sm:flex items-end justify-center h-3 pr-0.5">
        {Array.from({ length: visibleBacks }).map((_, idx) => {
          const offset = idx - mid;
          const rotateDeg = offset * 7;
          return (
            <div
              key={idx}
              style={{ transform: `rotate(${rotateDeg}deg)` }}
              className={`w-2 h-3 rounded-[2px] border border-amber-400/70 bg-gradient-to-br from-red-800 via-red-950 to-zinc-950 ${
                idx > 0 ? "-ml-1" : ""
              }`}
            />
          );
        })}
      </div>
      <span className="text-[9px] font-mono font-bold text-amber-300 leading-none">
        {cardCount}
      </span>
    </div>
  );
};

export const VideoTile: React.FC<VideoTileProps> = ({
  player,
  isSelf = false,
  videoTrack,
  isMuted = false,
  isSpeaking = false,
  cameraLabel = "Camera Off",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || !videoTrack) return;

    videoTrack.attach(node);
    return () => {
      videoTrack.detach(node);
    };
  }, [videoTrack]);

  return (
    <div
      className={`
        relative w-20 h-16 sm:w-28 sm:h-20 md:w-36 md:h-24 [@media(max-height:540px)]:w-24 [@media(max-height:540px)]:h-14
        rounded-xl overflow-hidden bg-zinc-950/90 backdrop-blur-md shadow-lg
        border-2 transition-all duration-200 shrink-0
        ${
          player.isCurrentTurn
            ? "border-amber-400 ring-2 ring-amber-400/50 shadow-amber-500/20 z-20"
            : "border-zinc-800 hover:border-zinc-700"
        }
        ${isSpeaking ? "ring-2 ring-emerald-400" : ""}
      `}
    >
      {/* Video Stream or Avatar Fallback */}
      {videoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 pb-4">
          <div className="relative w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full overflow-hidden border border-zinc-700 shadow">
            <Image
              src={
                player.profileImage ||
                `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                  player.username
                )}`
              }
              alt={player.username}
              fill
              className="object-cover"
            />
          </div>
          <span className="hidden md:block text-[9px] text-zinc-500 font-medium leading-tight mt-0.5">
            {cameraLabel}
          </span>
        </div>
      )}

      {/* Top Status Bar (Seat & Mic) */}
      <div className="absolute top-1 inset-x-1 flex items-center justify-between z-10 pointer-events-none">
        <span className="bg-black/65 backdrop-blur-sm text-zinc-300 text-[9px] font-bold px-1 py-0.5 rounded leading-none">
          S{player.seatNumber}
        </span>

        <div
          className={`p-0.5 sm:p-1 rounded-full backdrop-blur-md ${
            isMuted
              ? "bg-red-600/80 text-white"
              : isSpeaking
              ? "bg-emerald-500/90 text-zinc-950"
              : "bg-black/65 text-emerald-400"
          }`}
        >
          {isMuted ? (
            <MicOff className="w-2.5 h-2.5" />
          ) : (
            <Mic className="w-2.5 h-2.5" />
          )}
        </div>
      </div>

      {/* Bottom Info Bar (Username, Turn, Connection, & Inline Opponent Card Fan) */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-1.5 pb-1 pt-3 flex flex-col z-10">
        <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-white leading-tight">
          <span className="truncate min-w-0">
            {player.username}
            {isSelf ? " (You)" : ""}
          </span>

          {!isSelf && !player.hasDropped ? (
            <InlineOpponentCardFan cardCount={player.cardCount} />
          ) : (
            <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] px-1 rounded font-mono leading-none py-0.5 shrink-0">
              {player.cardCount}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-[8px] sm:text-[9px] mt-0.5 leading-none">
          {player.hasDropped ? (
            <span className="text-red-400 font-semibold">Dropped</span>
          ) : player.isCurrentTurn ? (
            <span className="text-amber-400 font-bold animate-pulse">Thinking...</span>
          ) : (
            <span className="text-zinc-400">Waiting</span>
          )}

          {player.connectionStatus === "DISCONNECTED" ? (
            <span className="text-red-400 flex items-center" title="Disconnected">
              <WifiOff className="w-2.5 h-2.5" />
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center" title="Connected">
              <Wifi className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
