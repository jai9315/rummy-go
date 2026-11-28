"use client";

import { MicOff, VolumeX, WifiOff } from "lucide-react";
import Image from "next/image";
import React, { useEffect, useRef } from "react";
import { useGameStore } from "../../store/useGameStore";
import { PlayerPublicInfo, TableReaction } from "../../types";

export interface AttachableVideoTrack {
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[];
}

export type VideoTileScale = "lg" | "md" | "sm" | "lobby";

interface VideoTileProps {
  player: PlayerPublicInfo;
  isSelf?: boolean;
  videoTrack?: AttachableVideoTrack | null;
  isMuted?: boolean;
  isLocallyMuted?: boolean;
  isSpeaking?: boolean;
  cameraLabel?: string;
  compact?: boolean;
  tileScale?: VideoTileScale;
  hideCardCount?: boolean;
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
  tileScale,
  hideCardCount = false,
  turnProgress = 1,
  reactions = [],
  onSpotlight,
  className = "",
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const chatBubble = useGameStore((s) => s.activeChatBubbles[player.id]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || !videoTrack) return;

    videoTrack.attach(node);
    return () => {
      videoTrack.detach(node);
    };
  }, [videoTrack]);

  const showTurnRing =
    player.isCurrentTurn && !player.hasDropped && !player.isEliminated;
  const clampedProgress = Math.max(0, Math.min(1, turnProgress));
  const dashOffset = TIMER_PERIMETER * (1 - clampedProgress);
  const effectiveMuted = isMuted || isLocallyMuted;
  const showSpeaking = isSpeaking && !effectiveMuted;

  // Adaptive tile scaling based on player count (2: large, 3-4: medium-large, 5-6: compact) or Lobby grid
  const resolvedScale: VideoTileScale =
    tileScale ?? (compact ? "sm" : "md");

  let sizeClass = "";
  if (resolvedScale === "lobby") {
    sizeClass = "w-full aspect-[16/10]";
  } else if (isSelf) {
    if (resolvedScale === "lg") {
      sizeClass =
        "w-[160px] sm:w-[205px] lg:w-[235px] aspect-[16/10] mobile-landscape:w-[110px] mobile-landscape:h-[66px] mobile-landscape:aspect-auto";
    } else if (resolvedScale === "md") {
      sizeClass =
        "w-[144px] sm:w-[180px] lg:w-[204px] aspect-[16/10] mobile-landscape:w-[98px] mobile-landscape:h-[58px] mobile-landscape:aspect-auto";
    } else {
      sizeClass =
        "w-[122px] sm:w-[148px] lg:w-[164px] aspect-[16/10] mobile-landscape:w-[88px] mobile-landscape:h-[52px] mobile-landscape:aspect-auto";
    }
  } else {
    if (resolvedScale === "lg") {
      sizeClass =
        "w-[176px] sm:w-[230px] lg:w-[270px] aspect-[16/10] mobile-landscape:w-[126px] mobile-landscape:h-[74px] mobile-landscape:aspect-auto";
    } else if (resolvedScale === "md") {
      sizeClass =
        "w-[138px] sm:w-[176px] lg:w-[205px] aspect-[16/10] mobile-landscape:w-[102px] mobile-landscape:h-[60px] mobile-landscape:aspect-auto";
    } else {
      sizeClass =
        "w-[108px] sm:w-[134px] lg:w-[152px] aspect-[16/10] mobile-landscape:w-[84px] mobile-landscape:h-[48px] mobile-landscape:aspect-auto";
    }
  }

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
        ${player.hasDropped || player.isEliminated ? "opacity-70" : ""}
        ${className}
      `}
    >
      {/* Floating Chat Speech Bubble above sender's tile (auto-fades ~4.5s) */}
      {chatBubble && (
        <div
          key={chatBubble.id}
          className="chat-bubble-pop pointer-events-none absolute bottom-full mb-1.5 left-1/2 z-50 w-max max-w-[170px] sm:max-w-[210px] px-2.5 py-1.5 rounded-xl bg-slate-950/95 border border-[#f6e09e]/75 text-[10px] sm:text-[11px] font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.75)] backdrop-blur-md"
        >
          <p className="line-clamp-2 leading-snug break-words text-center">
            {chatBubble.text}
          </p>
          <span
            aria-hidden="true"
            className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-slate-950/95 border-r border-b border-[#f6e09e]/75"
          />
        </div>
      )}

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
            <div className="relative w-9 h-9 sm:w-11 sm:h-11 mobile-landscape:w-7 mobile-landscape:h-7 rounded-full overflow-hidden border border-amber-400/40 shadow-lg">
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

        {/* Top Bar: Seat / Turn / Eliminated / Dropped + Speaking Equalizer / Mic Status */}
        <div className="absolute top-1 inset-x-1.5 mobile-landscape:top-0.5 mobile-landscape:inset-x-1 flex items-center justify-between gap-1 z-10 pointer-events-none">
          <div className="flex items-center gap-1 min-w-0">
            {showTurnRing ? (
              <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-slate-950 text-[8px] sm:text-[9px] mobile-landscape:text-[7px] font-black uppercase tracking-wider leading-none shadow">
                {isSelf ? "Your Turn" : "Turn"}
              </span>
            ) : player.isEliminated ? (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-700/95 text-white text-[8px] mobile-landscape:text-[7px] font-black uppercase tracking-wider leading-none">
                Eliminated
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
                className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-red-600/90 text-white text-[7px] font-bold"
                title="Offline"
              >
                <WifiOff className="w-2.5 h-2.5" />
                {typeof player.offlineTurnsMissed === "number" &&
                  player.offlineTurnsMissed > 0 && (
                    <span>{Math.min(2, player.offlineTurnsMissed)}/2</span>
                  )}
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

            {!hideCardCount && (
              <div className="flex items-center gap-1 shrink-0">
                <span className="hidden sm:inline-block mobile-landscape:hidden px-1 py-0.5 rounded bg-slate-900/90 border border-white/15 text-[8px] font-mono font-semibold text-slate-300 leading-none">
                  {player.score}p
                </span>
                <span
                  className="px-1 py-0.5 rounded bg-amber-500/20 border border-amber-400/45 text-amber-200 text-[9px] mobile-landscape:text-[8px] font-mono font-bold leading-none"
                  title={`${player.cardCount} cards in hand`}
                >
                  🃏{player.cardCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
