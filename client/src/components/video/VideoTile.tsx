"use client";

import { MicOff, VolumeX, WifiOff } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { useGameStore } from "../../store/useGameStore";
import { PlayerPublicInfo, TableReaction } from "../../types";

export interface AttachableVideoTrack {
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[];
}

export type VideoTileScale = "lg" | "md" | "sm" | "lobby" | "dynamic";

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
  seatPlacement?: "top" | "left" | "right" | "self" | "lobby";
  bubblePlacement?: "top" | "bottom";
  hideCardCount?: boolean;
  turnProgress?: number; // 0..1 remaining fraction while player.isCurrentTurn is true
  turnSecondsRemaining?: number;
  reactions?: TableReaction[];
  onSpotlight?: () => void;
  className?: string;
}

const TIMER_PATH_LENGTH = 100;

export function getPlayerInitials(username: string): string {
  const cleaned = (username || "P").trim();
  const parts = cleaned.split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export const VideoTile: React.FC<VideoTileProps> = ({
  player,
  isSelf = false,
  videoTrack,
  isMuted = false,
  isLocallyMuted = false,
  isSpeaking = false,
  cameraLabel = "Camera Off",
  tileScale = "dynamic",
  seatPlacement,
  bubblePlacement,
  hideCardCount = false,
  turnProgress = 1,
  turnSecondsRemaining,
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
  const dashOffset = TIMER_PATH_LENGTH * (1 - clampedProgress);
  const effectiveMuted = isMuted || isLocallyMuted;
  const showSpeaking = isSpeaking && !effectiveMuted;
  const isOffline = player.connectionStatus === "DISCONNECTED";
  const initials = getPlayerInitials(player.username);

  // Determine dynamic clamp() class vs lobby full-width aspect class
  const resolvedPlacement =
    seatPlacement ?? (tileScale === "lobby" ? "lobby" : isSelf ? "self" : "top");

  const sizeClass =
    resolvedPlacement === "lobby" || tileScale === "lobby"
      ? "w-full aspect-[16/10]"
      : isSelf
      ? "royal-video-self"
      : `royal-video-opp ${
          resolvedPlacement === "left"
            ? "royal-video-left"
            : resolvedPlacement === "right"
            ? "royal-video-right"
            : "royal-video-top"
        }`;

  const resolvedBubblePlacement =
    bubblePlacement ?? (resolvedPlacement === "top" ? "bottom" : "top");

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
        ${player.hasDropped || player.isEliminated ? "opacity-75" : ""}
        ${className}
      `}
    >
      {/* Floating 2-Line Chat Speech Bubble (above self/flank/lobby, below top-row so never clipped) */}
      {chatBubble && (
        <div
          key={chatBubble.id}
          className={`chat-bubble-pop pointer-events-none absolute left-1/2 z-50 w-max max-w-[175px] sm:max-w-[220px] px-2.5 py-1.5 rounded-xl bg-slate-950/95 border border-[#f6e09e]/80 text-[10px] sm:text-[11px] font-medium text-white shadow-[0_8px_22px_rgba(0,0,0,0.75)] backdrop-blur-md ${
            resolvedBubblePlacement === "bottom"
              ? "top-full mt-1.5"
              : "bottom-full mb-1.5"
          }`}
        >
          <p className="line-clamp-2 leading-snug break-words text-center">
            {chatBubble.text}
          </p>
          <span
            aria-hidden="true"
            className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-slate-950/95 ${
              resolvedBubblePlacement === "bottom"
                ? "-top-1.5 border-l border-t border-[#f6e09e]/80"
                : "-bottom-1.5 border-r border-b border-[#f6e09e]/80"
            }`}
          />
        </div>
      )}

      {/* Animated Floating Emoji Reactions rising from sender's tile */}
      {reactions.map((reaction) => (
        <div
          key={reaction.id}
          className="floating-emoji pointer-events-none absolute top-1/4 left-1/2 z-40 text-2xl sm:text-3xl mobile-landscape:text-xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]"
        >
          {reaction.emoji}
        </div>
      ))}

      {/* Animated SVG Golden Turn-Timer Border synced live to remaining turn timer */}
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
            rx="14"
            ry="14"
            pathLength={100}
            vectorEffect="non-scaling-stroke"
            className="turn-timer-rect"
            strokeDasharray={100}
            strokeDashoffset={dashOffset}
          />
        </svg>
      )}

      {/* Main LiveKit Video Frame */}
      <div className="video-feed-inner relative w-full h-full bg-[#0b101b]">
        {/* Real LiveKit Video Stream (mirrored for local user) OR Sleek Gold-Ringed Initials Avatar Fallback */}
        {videoTrack && !isOffline ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isSelf}
            className={`w-full h-full object-cover ${isSelf ? "scale-x-[-1]" : ""}`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#1e293b_0%,#0f172a_58%,#060a14_100%)] pb-4 mobile-landscape:pb-2.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 mobile-landscape:w-7 mobile-landscape:h-7 rounded-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border-2 border-[#d4af37]/80 ring-2 ring-[#f6e09e]/20 shadow-[0_0_16px_rgba(212,175,55,0.28)] flex items-center justify-center">
              <span className="font-serif-luxury text-xs sm:text-sm mobile-landscape:text-[10px] font-bold tracking-wider text-[#f6e09e]">
                {initials}
              </span>
            </div>
            <span className="hidden sm:block mobile-landscape:hidden text-[10px] text-slate-400 font-medium leading-tight mt-1">
              {isOffline ? "Offline" : cameraLabel}
            </span>
          </div>
        )}

        {/* TOP-LEFT OVERLAY: Active Turn Countdown Pill (e.g. 18s with pulsing dot) + Cards-in-Hand Pill */}
        <div className="absolute top-1.5 left-1.5 mobile-landscape:top-1 mobile-landscape:left-1 flex items-center gap-1 z-10 pointer-events-none">
          {showTurnRing && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-[#f6e09e] to-[#d4af37] text-slate-950 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-black font-mono leading-none shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-700 animate-ping" />
              <span>
                {typeof turnSecondsRemaining === "number"
                  ? `${turnSecondsRemaining}s`
                  : isSelf
                  ? "TURN"
                  : "LIVE"}
              </span>
            </span>
          )}

          {!hideCardCount && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-950/80 border border-white/15 text-amber-200 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-mono font-bold leading-none backdrop-blur-sm"
              title={`${player.cardCount} cards in hand`}
            >
              <span className="text-[8px] sm:text-[9px] opacity-85">🃏</span>
              <span>{player.cardCount}</span>
            </span>
          )}
        </div>

        {/* TOP-RIGHT OVERLAY: Animated 3-Bar Emerald Speaking Equalizer + Red Muted-Mic Badge */}
        <div className="absolute top-1.5 right-1.5 mobile-landscape:top-1 mobile-landscape:right-1 flex items-center gap-1 z-10 pointer-events-none">
          {showSpeaking ? (
            <div
              className="flex items-end gap-[2px] h-4 px-1.5 py-0.5 rounded-full bg-emerald-500/90 shadow-[0_0_10px_rgba(16,185,129,0.65)]"
              title="Speaking"
            >
              <span className="w-[2px] h-2 bg-slate-950 rounded-full eq-bar-1" />
              <span className="w-[2px] h-2.5 bg-slate-950 rounded-full eq-bar-2" />
              <span className="w-[2px] h-2 bg-slate-950 rounded-full eq-bar-3" />
            </div>
          ) : isLocallyMuted ? (
            <span
              className="p-1 rounded-full bg-rose-600/95 border border-rose-300/40 text-white shadow"
              title="Muted by you"
            >
              <VolumeX className="w-2.5 h-2.5 sm:w-3 sm:h-3 mobile-landscape:w-2 mobile-landscape:h-2" />
            </span>
          ) : isMuted ? (
            <span
              className="p-1 rounded-full bg-rose-600/90 border border-rose-300/35 text-white shadow"
              title="Mic muted"
            >
              <MicOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 mobile-landscape:w-2 mobile-landscape:h-2" />
            </span>
          ) : (
            <span
              className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"
              title="Mic live"
            />
          )}
        </div>

        {/* BOTTOM GRADIENT BAR: Truncated Name + Gold Points Badge + ELIMINATED / OFFLINE / DROPPED Status Pills */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-2 pb-1.5 pt-4 mobile-landscape:px-1.5 mobile-landscape:pb-1 mobile-landscape:pt-2.5 z-10">
          <div className="flex items-center justify-between gap-1.5 leading-none">
            <div className="flex items-center gap-1 min-w-0">
              <span className="truncate text-[10px] sm:text-xs mobile-landscape:text-[9px] font-bold text-white drop-shadow">
                {player.username}
                {isSelf ? " (You)" : ""}
              </span>
              {player.isEliminated && (
                <span className="shrink-0 px-1 py-0.5 rounded bg-rose-600/95 text-white text-[7px] sm:text-[8px] font-black uppercase tracking-wider leading-none">
                  ELIMINATED
                </span>
              )}
              {!player.isEliminated && isOffline && (
                <span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-rose-700/90 text-white text-[7px] sm:text-[8px] font-black uppercase tracking-wider leading-none">
                  <WifiOff className="w-2 h-2" />
                  <span>
                    OFFLINE
                    {typeof player.offlineTurnsMissed === "number" &&
                    player.offlineTurnsMissed > 0
                      ? ` ${Math.min(2, player.offlineTurnsMissed)}/2`
                      : ""}
                  </span>
                </span>
              )}
              {!player.isEliminated && !isOffline && player.hasDropped && (
                <span className="shrink-0 px-1 py-0.5 rounded bg-amber-700/90 text-amber-100 text-[7px] sm:text-[8px] font-black uppercase leading-none">
                  DROPPED
                </span>
              )}
            </div>

            {!hideCardCount && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-[#d4af37]/50 text-[#f6e09e] text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-mono font-bold leading-none">
                {player.score} pts
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
