"use client";

import { MicOff, VolumeX, WifiOff } from "lucide-react";
import Image from "next/image";
import React, { useEffect, useRef } from "react";
import { PlayerPublicInfo, TableReaction } from "../../types";

export interface AttachableVideoTrack {
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[];
}

interface VideoTileProps {
  player: PlayerPublicInfo;
  isSelf?: boolean;
  videoTrack?: AttachableVideoTrack | null;
  isMuted?: boolean;
  isLocallyMuted?: boolean;
  isSpeaking?: boolean;
  cameraLabel?: string;
  compact?: boolean;
  turnProgress?: number; // 0..1 remaining fraction while player.isCurrentTurn is true
  reactions?: TableReaction[];
  onSpotlight?: () => void;
  className?: string;
}

const TIMER_PERIMETER = 540;

export const VideoTile: React.FC<VideoTileProps> = ({
  player,
  isSelf = false,
  videoTrack,
  isMuted = false,
  isLocallyMuted = false,
  isSpeaking = false,
  cameraLabel = "Camera Off",
  compact = false,
  turnProgress = 1,
  reactions = [],
  onSpotlight,
  className = "",
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

  const showTurnRing = player.isCurrentTurn && !player.hasDropped;
  const clampedProgress = Math.max(0, Math.min(1, turnProgress));
  const dashOffset = TIMER_PERIMETER * (1 - clampedProgress);
  const effectiveMuted = isMuted || isLocallyMuted;
  const showSpeaking = isSpeaking && !effectiveMuted;

  const sizeClass = isSelf
    ? compact
      ? "w-[116px] sm:w-[136px] aspect-[16/10] mobile-landscape:w-[88px] mobile-landscape:h-[54px] mobile-landscape:aspect-auto"
      : "w-[132px] sm:w-[162px] lg:w-[180px] aspect-[16/10] mobile-landscape:w-[92px] mobile-landscape:h-[56px] mobile-landscape:aspect-auto"
    : compact
    ? "w-[106px] sm:w-[122px] lg:w-[132px] aspect-[16/10] mobile-landscape:w-[84px] mobile-landscape:h-[48px] mobile-landscape:aspect-auto"
    : "w-[116px] sm:w-[144px] lg:w-[162px] aspect-[16/10] mobile-landscape:w-[88px] mobile-landscape:h-[50px] mobile-landscape:aspect-auto";

  return (
    <div
      onClick={!isSelf && onSpotlight ? onSpotlight : undefined}
      role={!isSelf && onSpotlight ? "button" : undefined}
      tabIndex={!isSelf && onSpotlight ? 0 : undefined}
      onKeyDown={
        !isSelf && onSpotlight
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSpotlight();
              }
            }
          : undefined
      }
      title={
        !isSelf && onSpotlight
          ? `Click to spotlight or mute ${player.username}`
          : undefined
      }
      className={`
        video-tile relative shrink-0 select-none
        ${sizeClass}
        ${showTurnRing ? "is-active-turn z-20" : "z-10"}
        ${!isSelf && onSpotlight ? "cursor-pointer" : ""}
        ${player.hasDropped ? "opacity-65" : ""}
        ${className}
      `}
    >
      {/* Floating Emoji Reactions over sender's tile */}
      {reactions.map((reaction) => (
        <div
          key={reaction.id}
          className="floating-emoji pointer-events-none absolute -top-2 left-1/2 z-40 text-2xl sm:text-3xl mobile-landscape:text-xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
        >
          {reaction.emoji}
        </div>
      ))}

      {/* Animated SVG Gold Turn-Timer Border */}
      {showTurnRing && (
        <svg
          className="turn-timer-svg"
          viewBox="0 0 180 116"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect
            x="2"
            y="2"
            width="176"
            height="112"
            rx="16"
            ry="16"
            className="turn-timer-rect"
            strokeDasharray={TIMER_PERIMETER}
            strokeDashoffset={dashOffset}
          />
        </svg>
      )}

      {/* Main Video Frame */}
      <div className="video-feed-inner relative w-full h-full bg-[#0b101b]">
        {/* Real LiveKit Video Stream or Avatar Fallback */}
        {videoTrack ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isSelf}
            className={`w-full h-full object-cover ${isSelf ? "-scale-x-100" : ""}`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 pb-4 mobile-landscape:pb-2.5">
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 mobile-landscape:w-6 mobile-landscape:h-6 rounded-full overflow-hidden border border-amber-400/40 shadow-lg">
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
            <span className="hidden sm:block mobile-landscape:hidden text-[9px] text-slate-400 font-medium leading-tight mt-0.5">
              {cameraLabel}
            </span>
          </div>
        )}

        {/* Top Bar: Seat / Turn / Dropped + Speaking Equalizer / Mic Status */}
        <div className="absolute top-1 inset-x-1.5 mobile-landscape:top-0.5 mobile-landscape:inset-x-1 flex items-center justify-between gap-1 z-10 pointer-events-none">
          <div className="flex items-center gap-1 min-w-0">
            {showTurnRing ? (
              <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-slate-950 text-[8px] sm:text-[9px] mobile-landscape:text-[7px] font-black uppercase tracking-wider leading-none shadow">
                {isSelf ? "Your Turn" : "Turn"}
              </span>
            ) : player.hasDropped ? (
              <span className="px-1.5 py-0.5 rounded-full bg-red-600/90 text-white text-[8px] mobile-landscape:text-[7px] font-bold uppercase leading-none">
                Dropped
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full bg-black/65 text-amber-200/90 border border-amber-400/25 text-[8px] mobile-landscape:text-[7px] font-bold leading-none">
                #{player.seatNumber}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {player.connectionStatus === "DISCONNECTED" && (
              <span
                className="p-0.5 rounded-full bg-red-600/85 text-white"
                title="Disconnected"
              >
                <WifiOff className="w-2.5 h-2.5" />
              </span>
            )}

            {showSpeaking ? (
              <div
                className="flex items-end gap-[2px] h-3.5 px-1.5 py-0.5 rounded-full bg-emerald-500/85"
                title="Speaking"
              >
                <span className="w-[2px] h-2 bg-slate-950 rounded-full eq-bar-1" />
                <span className="w-[2px] h-2.5 bg-slate-950 rounded-full eq-bar-2" />
                <span className="w-[2px] h-2 bg-slate-950 rounded-full eq-bar-3" />
              </div>
            ) : isLocallyMuted ? (
              <span
                className="p-0.5 rounded-full bg-amber-600/90 text-white"
                title="Muted by you"
              >
                <VolumeX className="w-2.5 h-2.5 mobile-landscape:w-2 mobile-landscape:h-2" />
              </span>
            ) : isMuted ? (
              <span
                className="p-0.5 rounded-full bg-red-600/85 text-white"
                title="Mic muted"
              >
                <MicOff className="w-2.5 h-2.5 mobile-landscape:w-2 mobile-landscape:h-2" />
              </span>
            ) : (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"
                title="Mic live"
              />
            )}
          </div>
        </div>

        {/* Bottom Glass Overlay: Name, Points, Card Count */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-1.5 pb-1 pt-3 mobile-landscape:px-1 mobile-landscape:pb-0.5 mobile-landscape:pt-2 z-10">
          <div className="flex items-center justify-between gap-1 leading-none">
            <span className="truncate text-[10px] sm:text-[11px] mobile-landscape:text-[8px] font-bold text-white drop-shadow">
              {player.username}
              {isSelf ? " (You)" : ""}
            </span>

            <div className="flex items-center gap-1 shrink-0">
              {/* Points badge */}
              <span className="hidden sm:inline-block mobile-landscape:hidden px-1 py-0.5 rounded bg-slate-900/90 border border-white/15 text-[8px] font-mono font-semibold text-slate-300 leading-none">
                {player.score}p
              </span>
              {/* Card count badge */}
              <span
                className="px-1 py-0.5 rounded bg-amber-500/20 border border-amber-400/45 text-amber-200 text-[9px] mobile-landscape:text-[8px] font-mono font-bold leading-none"
                title={`${player.cardCount} cards in hand`}
              >
                🃏{player.cardCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
