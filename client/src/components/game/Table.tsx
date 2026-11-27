"use client";

import confetti from "canvas-confetti";
import {
  Award,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Copy,
  LogOut,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/game/Card";
import { CardHand } from "@/components/game/CardHand";
import { DeckPiles } from "@/components/game/DeckPiles";
import { DeclareModal } from "@/components/game/DeclareModal";
import { RotateDeviceOverlay } from "@/components/game/RotateDeviceOverlay";
import { VideoErrorBoundary } from "@/components/video/VideoErrorBoundary";
import { useLiveKitMedia, VideoOverlay } from "@/components/video/VideoOverlay";
import { AttachableVideoTrack, VideoTile } from "@/components/video/VideoTile";
import { ClientEvaluator } from "@/lib/clientEvaluator";
import { soundEffects } from "@/lib/soundEffects";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { useVideoStore } from "@/store/useVideoStore";
import { Card as CardType, FeltTheme, MeldType, PlayerPublicInfo } from "@/types";

interface TableProps {
  roomCode: string;
  onDraw: (source: "CLOSED" | "DISCARD") => void;
  onDiscard: (cardId: string) => void;
  onDeclare: (melds: CardType[][], declareCardId: string) => void;
  onSubmitMelds: (melds: CardType[][]) => void;
  onNextRound: () => void;
  onReturnToLobby: () => void;
  onDrop: () => void;
  onSort: (by: "SUIT" | "RANK") => void;
  onSendChat: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  onExit: () => void;
}

type SeatSlot =
  | "MID_LEFT"
  | "TOP_LEFT"
  | "TOP_CENTER"
  | "TOP_RIGHT"
  | "MID_RIGHT";

const SEAT_POSITION_CLASS: Record<SeatSlot, string> = {
  MID_LEFT: "left-1 sm:left-3 lg:left-5 top-[54%] -translate-y-1/2",
  TOP_LEFT: "left-[7%] sm:left-[13%] lg:left-[16%] top-0.5 sm:top-1",
  TOP_CENTER: "left-1/2 -translate-x-1/2 top-0",
  TOP_RIGHT: "right-[7%] sm:right-[13%] lg:right-[16%] top-0.5 sm:top-1",
  MID_RIGHT: "right-1 sm:right-3 lg:right-5 top-[54%] -translate-y-1/2",
};

const QUICK_REACTIONS = ["🔥", "😂", "👏", "😱"] as const;

const FELT_THEMES: Array<{
  id: FeltTheme;
  name: string;
  swatch: string;
  desc: string;
}> = [
  {
    id: "emerald",
    name: "Emerald Classic",
    swatch: "from-[#116947] to-[#052619]",
    desc: "Signature luxury casino felt",
  },
  {
    id: "royal",
    name: "Royal Sapphire",
    swatch: "from-[#134e7a] to-[#061c30]",
    desc: "Deep sapphire velvet table",
  },
  {
    id: "burgundy",
    name: "Imperial Burgundy",
    swatch: "from-[#6b182c] to-[#26070f]",
    desc: "Warm VIP parlor crimson",
  },
];

function mapOpponentsToSlots(opponents: PlayerPublicInfo[]): Array<{
  player: PlayerPublicInfo;
  slot: SeatSlot;
}> {
  const count = Math.min(opponents.length, 5);
  const slotsByCount: Record<number, SeatSlot[]> = {
    1: ["TOP_CENTER"],
    2: ["TOP_LEFT", "TOP_RIGHT"],
    3: ["MID_LEFT", "TOP_CENTER", "MID_RIGHT"],
    4: ["MID_LEFT", "TOP_LEFT", "TOP_RIGHT", "MID_RIGHT"],
    5: ["MID_LEFT", "TOP_LEFT", "TOP_CENTER", "TOP_RIGHT", "MID_RIGHT"],
  };
  const slots = slotsByCount[count] ?? [];
  return opponents.slice(0, 5).map((player, idx) => ({
    player,
    slot: slots[idx],
  }));
}

function getMeldBadgeLabel(type: MeldType): {
  label: string;
  className: string;
} {
  switch (type) {
    case "PURE_SEQUENCE":
      return {
        label: "Pure Seq",
        className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      };
    case "IMPURE_SEQUENCE":
      return {
        label: "Impure Seq",
        className: "bg-sky-500/20 text-sky-300 border-sky-500/40",
      };
    case "SET":
      return {
        label: "Set",
        className: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      };
    default:
      return {
        label: "Group",
        className: "bg-slate-800 text-slate-300 border-slate-700",
      };
  }
}

/**
 * Large live video preview inside the Click-to-Spotlight Opponent modal.
 */
const SpotlightVideoFeed: React.FC<{
  player: PlayerPublicInfo;
  videoTrack?: AttachableVideoTrack | null;
}> = ({ player, videoTrack }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || !videoTrack) return;
    videoTrack.attach(node);
    return () => {
      videoTrack.detach(node);
    };
  }, [videoTrack]);

  if (videoTrack) {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 gap-2">
      <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-amber-400/50 shadow-xl">
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
      <span className="text-xs text-slate-400 font-medium">
        Camera Off / Audio Mode
      </span>
    </div>
  );
};

interface TableStageProps {
  turnProgress: number;
  displayedSeconds: number;
  isShowPhase: boolean;
  canSubmitOpponentMelds: boolean;
  liveDeadwoodPreview: number | null;
  winnerPlayer?: PlayerPublicInfo;
  activeShowOpponents: PlayerPublicInfo[];
  submittedIds: Set<string>;
  onDrawWithSound: (source: "CLOSED" | "DISCARD") => void;
  onDiscardWithSound: (cardId: string) => void;
  onSubmitMelds: (melds: CardType[][]) => void;
  onDrop: () => void;
  onSort: (by: "SUIT" | "RANK") => void;
  onSendReaction: (emoji: string) => void;
  onOpenChat: () => void;
}

/**
 * Inner Royal 13 Table Stage rendered inside <VideoOverlay> so perimeter opponent
 * video tiles, bottom-left local video tile, and spotlight modal all read live
 * WebRTC streams from the single <LiveKitRoom> context.
 */
const TableStage: React.FC<TableStageProps> = ({
  turnProgress,
  displayedSeconds,
  isShowPhase,
  canSubmitOpponentMelds,
  liveDeadwoodPreview,
  winnerPlayer,
  activeShowOpponents,
  submittedIds,
  onDrawWithSound,
  onDiscardWithSound,
  onSubmitMelds,
  onDrop,
  onSort,
  onSendReaction,
  onOpenChat,
}) => {
  const user = useAuthStore((s) => s.user);
  const {
    gameState,
    handGroups,
    unreadChatCount,
    activeReactions,
    setShowDeclareModal,
  } = useGameStore();
  const {
    isMicMuted,
    isCameraOff,
    isCompactVideo,
    micPermissionDenied,
    cameraPermissionDenied,
    mutedRemotePlayerIds,
    spotlightPlayerId,
    toggleMic,
    toggleCamera,
    toggleMuteRemotePlayer,
    setSpotlightPlayerId,
  } = useVideoStore();

  const { getPlayerMedia } = useLiveKitMedia();

  const currentUserId = user?.id ?? "";

  // Sort players by seatNumber and rotate so opponents sit clockwise after local player
  const { selfPlayer, seatedOpponents } = useMemo(() => {
    if (!gameState) {
      return { selfPlayer: undefined, seatedOpponents: [] };
    }
    const sorted = [...gameState.players].sort(
      (a, b) => a.seatNumber - b.seatNumber
    );
    const selfIdx = sorted.findIndex((p) => p.id === currentUserId);
    const self = selfIdx >= 0 ? sorted[selfIdx] : undefined;
    const rotatedOpponents =
      selfIdx >= 0
        ? [...sorted.slice(selfIdx + 1), ...sorted.slice(0, selfIdx)]
        : sorted.filter((p) => p.id !== currentUserId);

    return {
      selfPlayer: self,
      seatedOpponents: mapOpponentsToSlots(rotatedOpponents),
    };
  }, [gameState, currentUserId]);

  const spotlightPlayer = useMemo(() => {
    if (!spotlightPlayerId || !gameState) return null;
    return gameState.players.find((p) => p.id === spotlightPlayerId) ?? null;
  }, [spotlightPlayerId, gameState]);

  const spotlightMedia = spotlightPlayer
    ? getPlayerMedia(spotlightPlayer.id, spotlightPlayer.id === currentUserId)
    : null;
  const isSpotlightMutedLocally = Boolean(
    spotlightPlayer && mutedRemotePlayerIds.includes(spotlightPlayer.id)
  );

  const selfMedia = selfPlayer
    ? getPlayerMedia(selfPlayer.id, true)
    : undefined;

  return (
    <>
      {/* BAND 2: ROYAL 13 OVAL TABLE ARENA + PERIMETER OPPONENT VIDEO SEATS */}
      <main className="flex-1 min-h-0 relative w-full max-w-[1440px] mx-auto flex items-center justify-center px-3 sm:px-8 lg:px-14 py-2 sm:py-3 mobile-landscape:px-2 mobile-landscape:py-1 overflow-hidden">
        {/* Opponent Video Tiles Positioned Dynamically Around the Oval Table */}
        {seatedOpponents.map(({ player, slot }) => {
          const media = getPlayerMedia(player.id, false);
          const isLocallyMuted = mutedRemotePlayerIds.includes(player.id);
          const playerReactions = activeReactions.filter(
            (r) => r.playerId === player.id
          );
          return (
            <div
              key={player.id}
              className={`absolute ${SEAT_POSITION_CLASS[slot]} z-20`}
            >
              <VideoTile
                player={player}
                isSelf={false}
                videoTrack={media.videoTrack}
                isMuted={media.isMuted}
                isLocallyMuted={isLocallyMuted}
                isSpeaking={media.isSpeaking}
                cameraLabel={media.cameraLabel}
                compact={isCompactVideo}
                turnProgress={player.isCurrentTurn ? turnProgress : 1}
                reactions={playerReactions}
                onSpotlight={() => setSpotlightPlayerId(player.id)}
              />
            </div>
          );
        })}

        {/* Luxury 3-Layer Oval Rummy Table (Brass Outer -> Leather Rail -> Radial Felt) */}
        <div className="rummy-table-outer w-[84%] sm:w-[80%] lg:w-[76%] h-[78%] sm:h-[80%] mobile-landscape:w-[78%] mobile-landscape:h-[88%] rounded-[84px] sm:rounded-[150px] mobile-landscape:rounded-[64px] p-2 sm:p-3 mobile-landscape:p-1.5 flex items-center justify-center">
          <div className="rummy-table-rail w-full h-full rounded-[76px] sm:rounded-[140px] mobile-landscape:rounded-[58px] p-1.5 sm:p-2.5 mobile-landscape:p-1 flex items-center justify-center">
            <div className="rummy-felt w-full h-full rounded-[68px] sm:rounded-[130px] mobile-landscape:rounded-[52px] flex flex-col items-center justify-center overflow-hidden px-4 sm:px-8 pt-5 sm:pt-7 pb-2 mobile-landscape:pt-3 mobile-landscape:pb-1 relative">
              {/* Gold Inner Decorative Ring */}
              <div className="rummy-felt-inner-ring" />

              {/* Faint Luxury Serif Watermark */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-[0.07] select-none">
                <span className="font-serif-luxury text-3xl sm:text-5xl lg:text-6xl mobile-landscape:text-2xl font-bold tracking-[0.26em] text-[#f6e09e]">
                  ROYAL 13
                </span>
                <span className="text-[9px] sm:text-xs tracking-[0.38em] uppercase text-[#f6e09e] mt-1">
                  Indian Points Rummy
                </span>
              </div>

              {/* Center Interactive Content: SHOW Meld Submission OR DeckPiles / TOSS Banner */}
              {isShowPhase && gameState ? (
                <div className="w-full max-w-2xl max-h-full overflow-y-auto glass-panel border border-amber-400/50 rounded-2xl p-3 sm:p-4 mobile-landscape:p-2 shadow-2xl space-y-2.5 z-20">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#f6e09e] shrink-0" />
                      <div>
                        <h3 className="text-xs sm:text-sm font-black text-[#f6e09e] leading-tight">
                          Show Phase — {winnerPlayer?.username || "Winner"}{" "}
                          Declared!
                        </h3>
                        <p className="text-[10px] sm:text-[11px] text-slate-300">
                          Arrange your groups below and submit melds to minimize
                          deadwood.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-mono font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{displayedSeconds}s</span>
                    </div>
                  </div>

                  {gameState.winnerMelds && gameState.winnerMelds.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                        {winnerPlayer?.username || "Winner"}&apos;s Winning
                        Melds
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {gameState.winnerMelds.map((meld, idx) => {
                          const evalRes = ClientEvaluator.evaluateMeld(meld);
                          const badge = getMeldBadgeLabel(evalRes.type);
                          return (
                            <div
                              key={idx}
                              className="flex flex-col items-center gap-1 bg-slate-950/75 border border-white/10 rounded-xl p-1.5"
                            >
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                              <div className="flex items-center -space-x-4">
                                {meld.map((c) => (
                                  <Card key={c.id} card={c} size="sm" disabled />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {activeShowOpponents.map((opp) => {
                        const done = submittedIds.has(opp.id);
                        return (
                          <span
                            key={opp.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${
                              done
                                ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                                : "bg-slate-900 border-white/15 text-slate-300"
                            }`}
                          >
                            {done && <CheckCircle2 className="w-3 h-3" />}
                            <span>{opp.username}</span>
                            <span className="text-[9px] opacity-75">
                              {done ? "Submitted" : "Arranging..."}
                            </span>
                          </span>
                        );
                      })}
                    </div>

                    {canSubmitOpponentMelds ? (
                      <button
                        type="button"
                        onClick={() => onSubmitMelds(handGroups)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#f6e09e] to-[#d4af37] hover:brightness-110 text-slate-950 font-black text-xs shadow-lg transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          Submit My Melds
                          {liveDeadwoodPreview !== null
                            ? ` (${liveDeadwoodPreview} pts)`
                            : ""}
                        </span>
                      </button>
                    ) : currentUserId === gameState.winnerId ? (
                      <span className="text-[11px] font-semibold text-emerald-300">
                        Waiting for opponents to submit...
                      </span>
                    ) : submittedIds.has(currentUserId) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Melds submitted — waiting on table...
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <DeckPiles
                  onDraw={onDrawWithSound}
                  onOpenDeclare={() => setShowDeclareModal(true, null)}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* BAND 3: BOTTOM AREA — LOCAL VIDEO (LEFT) + HAND TRAY (CENTER) + CONTROL DOCK (RIGHT) */}
      <section className="shrink-0 w-full max-w-[1460px] mx-auto px-2 sm:px-3 pb-1.5 mobile-landscape:px-1.5 mobile-landscape:pb-1 flex items-end justify-between gap-2 sm:gap-3 mobile-landscape:gap-1.5 z-30">
        {/* Bottom-Left: Local Player ("You") LiveKit Video Tile */}
        {selfPlayer && (
          <div className="shrink-0">
            <VideoTile
              player={selfPlayer}
              isSelf={true}
              videoTrack={selfMedia?.videoTrack}
              isMuted={selfMedia?.isMuted ?? (isMicMuted || micPermissionDenied)}
              isSpeaking={selfMedia?.isSpeaking ?? false}
              cameraLabel={selfMedia?.cameraLabel ?? "Camera Off"}
              compact={isCompactVideo}
              turnProgress={selfPlayer.isCurrentTurn ? turnProgress : 1}
              reactions={activeReactions.filter(
                (r) => r.playerId === selfPlayer.id
              )}
            />
          </div>
        )}

        {/* Bottom-Center: Compact Action Toolbar + Glassmorphic 13-Card Hand Tray */}
        <div className="flex-1 min-w-0">
          <CardHand
            onDiscard={onDiscardWithSound}
            onDeclare={() => {}}
            onDrop={onDrop}
            onSort={onSort}
          />
        </div>

        {/* Bottom-Right: Floating Glass Control Dock (Mic, Camera, Chat, Quick Emojis) */}
        <div className="glass-panel shrink-0 rounded-2xl mobile-landscape:rounded-xl p-1.5 sm:p-2 mobile-landscape:p-1 flex flex-col items-center gap-1.5 mobile-landscape:gap-1">
          {/* Media & Chat Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMic}
              disabled={micPermissionDenied}
              title={
                micPermissionDenied
                  ? "Microphone permission denied"
                  : isMicMuted
                  ? "Unmute Microphone"
                  : "Mute Microphone"
              }
              className={`p-2 sm:p-2.5 mobile-landscape:p-1.5 rounded-xl mobile-landscape:rounded-lg border transition ${
                micPermissionDenied
                  ? "bg-slate-900/70 border-white/5 text-slate-600 cursor-not-allowed"
                  : isMicMuted
                  ? "bg-red-600/90 hover:bg-red-500 border-red-400/60 text-white"
                  : "bg-slate-800/85 hover:bg-slate-700 border-white/10 text-emerald-300"
              }`}
            >
              {isMicMuted || micPermissionDenied ? (
                <MicOff className="w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5" />
              ) : (
                <Mic className="w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleCamera}
              disabled={cameraPermissionDenied}
              title={
                cameraPermissionDenied
                  ? "Camera unavailable (Audio Only)"
                  : isCameraOff
                  ? "Turn Camera On"
                  : "Turn Camera Off"
              }
              className={`p-2 sm:p-2.5 mobile-landscape:p-1.5 rounded-xl mobile-landscape:rounded-lg border transition ${
                cameraPermissionDenied
                  ? "bg-slate-900/70 border-white/5 text-slate-600 cursor-not-allowed"
                  : isCameraOff
                  ? "bg-red-600/90 hover:bg-red-500 border-red-400/60 text-white"
                  : "bg-slate-800/85 hover:bg-slate-700 border-white/10 text-sky-300"
              }`}
            >
              {isCameraOff || cameraPermissionDenied ? (
                <CameraOff className="w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5" />
              ) : (
                <Camera className="w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenChat}
              title="Open Table Chat"
              className="relative p-2 sm:p-2.5 mobile-landscape:p-1.5 rounded-xl mobile-landscape:rounded-lg bg-slate-800/85 hover:bg-slate-700 border border-white/10 text-amber-200 transition"
            >
              <MessageSquare className="w-4 h-4 mobile-landscape:w-3.5 mobile-landscape:h-3.5" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black flex items-center justify-center leading-none shadow">
                  {unreadChatCount > 9 ? "9+" : unreadChatCount}
                </span>
              )}
            </button>
          </div>

          {/* Quick Emoji Reactions Row */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-950/60 rounded-xl px-1 py-0.5 border border-white/5">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSendReaction(emoji)}
                title={`React ${emoji}`}
                className="w-7 h-7 sm:w-8 sm:h-7 mobile-landscape:w-6 mobile-landscape:h-5 flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-90 text-sm sm:text-base mobile-landscape:text-xs transition"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* OPPONENT SPOTLIGHT & MUTE MODAL */}
      {spotlightPlayer && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSpotlightPlayerId(null)}
        >
          <div
            className="glass-panel w-full max-w-md rounded-3xl border border-amber-400/40 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold">
                  Seat #{spotlightPlayer.seatNumber}
                </span>
                <h3 className="text-base font-bold text-white">
                  {spotlightPlayer.username}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSpotlightPlayerId(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="w-full aspect-video rounded-2xl overflow-hidden border border-white/15 bg-slate-950 shadow-inner">
                <SpotlightVideoFeed
                  player={spotlightPlayer}
                  videoTrack={spotlightMedia?.videoTrack}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-900/70 border border-white/10 p-2.5">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">
                    Cards
                  </div>
                  <div className="text-sm font-black text-amber-300 font-mono">
                    {spotlightPlayer.cardCount}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900/70 border border-white/10 p-2.5">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">
                    Total Pts
                  </div>
                  <div className="text-sm font-black text-white font-mono">
                    {spotlightPlayer.score}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-900/70 border border-white/10 p-2.5">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">
                    Status
                  </div>
                  <div className="text-xs font-bold text-emerald-300 mt-0.5">
                    {spotlightPlayer.hasDropped
                      ? "Dropped"
                      : spotlightPlayer.connectionStatus === "CONNECTED"
                      ? "Online"
                      : "Offline"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleMuteRemotePlayer(spotlightPlayer.id)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition ${
                    isSpotlightMutedLocally
                      ? "bg-amber-500/20 border-amber-400/50 text-amber-200 hover:bg-amber-500/30"
                      : "bg-red-600/85 hover:bg-red-500 border-red-400/50 text-white"
                  }`}
                >
                  {isSpotlightMutedLocally ? (
                    <>
                      <Volume2 className="w-4 h-4" />
                      <span>Unmute Opponent Audio</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4" />
                      <span>Mute Opponent Audio</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSpotlightPlayerId(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const Table: React.FC<TableProps> = ({
  roomCode,
  onDraw,
  onDiscard,
  onDeclare,
  onSubmitMelds,
  onNextRound,
  onReturnToLobby,
  onDrop,
  onSort,
  onSendChat,
  onSendReaction,
  onExit,
}) => {
  const user = useAuthStore((s) => s.user);
  const {
    gameState,
    handGroups,
    lobbyPlayers,
    showDeclareModal,
    setShowDeclareModal,
    error,
    isMuted,
    toggleMuted,
    feltTheme,
    setFeltTheme,
    chatMessages,
    markChatRead,
  } = useGameStore();
  const {
    isCompactVideo,
    videoStatus,
    videoStatusLabel,
    toggleCompactVideo,
    requestRetry,
  } = useVideoStore();

  const [copiedCode, setCopiedCode] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const prevTurnPlayerRef = useRef<string | null>(null);
  const celebratedKeyRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const handleDrawWithSound = useCallback(
    (source: "CLOSED" | "DISCARD") => {
      soundEffects.playCardDraw(isMuted);
      onDraw(source);
    },
    [isMuted, onDraw]
  );

  const handleDiscardWithSound = useCallback(
    (cardId: string) => {
      soundEffects.playCardDiscard(isMuted);
      onDiscard(cardId);
    },
    [isMuted, onDiscard]
  );

  const activeDeadline =
    gameState?.status === "SHOW"
      ? gameState.showEndsAt ?? gameState.turnEndsAt ?? null
      : gameState?.status === "PLAYING"
      ? gameState.turnEndsAt ?? null
      : gameState?.status === "TOSS"
      ? gameState.tossEndsAt ?? null
      : null;

  const activeTotalDurationMs =
    gameState?.status === "SHOW"
      ? (gameState.showTimeLimitSeconds ?? 30) * 1000
      : gameState?.status === "TOSS"
      ? 3500
      : (gameState?.turnTimeLimitSeconds ?? 30) * 1000;

  // Smooth 250ms ticker so SVG turn-timer border animates fluidly synced to server turnEndsAt
  useEffect(() => {
    if (!activeDeadline) return;
    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, [activeDeadline]);

  const remainingMs = activeDeadline ? Math.max(0, activeDeadline - nowMs) : 0;
  const displayedSeconds = activeDeadline
    ? Math.max(0, Math.ceil(remainingMs / 1000))
    : Math.max(0, gameState?.turnTimeRemainingSeconds ?? 0);
  const turnProgress =
    activeDeadline && activeTotalDurationMs > 0
      ? Math.max(0, Math.min(1, remainingMs / activeTotalDurationMs))
      : 1;

  // Auto-scroll chat drawer & clear unread count when opened
  useEffect(() => {
    if (showChatDrawer) {
      markChatRead();
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [showChatDrawer, chatMessages.length, markChatRead]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatDraft.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChatDraft("");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isShowPhase = gameState?.status === "SHOW";
  const isRoundEnd = gameState?.status === "ROUND_END";
  const isGameOver = gameState?.status === "GAME_OVER";

  const currentUserId = user?.id ?? "";
  const isHost = Boolean(
    lobbyPlayers.find((p) => p.userId === currentUserId)?.isHost
  );
  const currentPlayerInfo = gameState?.players.find(
    (p) => p.id === currentUserId
  );
  const winnerPlayer = gameState?.players.find(
    (p) => p.id === gameState.winnerId
  );
  const submittedIds = useMemo(
    () => new Set(gameState?.submittedMeldPlayerIds ?? []),
    [gameState?.submittedMeldPlayerIds]
  );

  const canSubmitOpponentMelds = Boolean(
    isShowPhase &&
      currentPlayerInfo &&
      !currentPlayerInfo.hasDropped &&
      currentUserId !== gameState?.winnerId &&
      !submittedIds.has(currentUserId)
  );

  const liveDeadwoodPreview = useMemo(() => {
    if (!canSubmitOpponentMelds || handGroups.length === 0) return null;
    return ClientEvaluator.calculatePlayerScore(handGroups).points;
  }, [canSubmitOpponentMelds, handGroups]);

  const roundNumber = gameState?.roundNumber ?? 1;
  const roundCount = gameState?.roundCount ?? 1;
  const hasMoreRounds = roundNumber < roundCount;

  const finalRankings = useMemo(() => {
    if (!gameState) return [];
    if (gameState.rankings && gameState.rankings.length > 0) {
      return gameState.rankings;
    }
    return [...gameState.players]
      .sort((a, b) => a.score - b.score)
      .map((p, idx) => ({
        playerId: p.id,
        username: p.username,
        totalScore: p.score,
        rank: idx + 1,
      }));
  }, [gameState]);

  const activeShowOpponents = useMemo(() => {
    if (!gameState) return [];
    return gameState.players.filter(
      (p) => p.id !== gameState.winnerId && !p.hasDropped
    );
  }, [gameState]);

  // Turn alert sound cue when turn transitions to the local user
  useEffect(() => {
    if (!gameState || gameState.status !== "PLAYING") {
      prevTurnPlayerRef.current = null;
      return;
    }
    const turnId = gameState.currentTurnPlayerId ?? null;
    if (
      turnId &&
      turnId !== prevTurnPlayerRef.current &&
      turnId === currentUserId
    ) {
      soundEffects.playTurnAlert(isMuted);
    }
    prevTurnPlayerRef.current = turnId;
  }, [gameState, currentUserId, isMuted]);

  // Confetti + win fanfare celebration on ROUND_END / GAME_OVER
  useEffect(() => {
    if (
      !gameState ||
      (gameState.status !== "ROUND_END" && gameState.status !== "GAME_OVER")
    ) {
      return;
    }

    const celebrationKey = `${gameState.status}-${gameState.roundNumber ?? 1}-${gameState.winnerId ?? ""}`;
    if (celebratedKeyRef.current === celebrationKey) return;

    const championId = finalRankings[0]?.playerId;
    const localWonRound = Boolean(
      currentUserId && gameState.winnerId === currentUserId
    );
    const localWonGame = Boolean(
      gameState.status === "GAME_OVER" &&
        currentUserId &&
        championId === currentUserId
    );

    if (localWonRound || localWonGame) {
      celebratedKeyRef.current = celebrationKey;
      soundEffects.playWinFanfare(isMuted);
      confetti({
        particleCount: gameState.status === "GAME_OVER" ? 130 : 80,
        spread: 75,
        origin: { y: 0.6 },
        colors: ["#f6e09e", "#d4af37", "#34d399", "#ffffff"],
      });
    }
  }, [gameState, currentUserId, finalRankings, isMuted]);

  const isVideoLive = videoStatus === "live" || videoStatus === "audio-only";

  const stageElement = (
    <TableStage
      turnProgress={turnProgress}
      displayedSeconds={displayedSeconds}
      isShowPhase={isShowPhase}
      canSubmitOpponentMelds={canSubmitOpponentMelds}
      liveDeadwoodPreview={liveDeadwoodPreview}
      winnerPlayer={winnerPlayer}
      activeShowOpponents={activeShowOpponents}
      submittedIds={submittedIds}
      onDrawWithSound={handleDrawWithSound}
      onDiscardWithSound={handleDiscardWithSound}
      onSubmitMelds={onSubmitMelds}
      onDrop={onDrop}
      onSort={onSort}
      onSendReaction={onSendReaction}
      onOpenChat={() => setShowChatDrawer(true)}
    />
  );

  return (
    <div
      data-felt-theme={feltTheme}
      className="relative h-[100dvh] w-full overflow-hidden flex flex-col justify-between royal-backdrop text-white select-none"
    >
      {/* Shared SVG Gold Gradient for Animated Turn-Timer Borders */}
      <svg
        width="0"
        height="0"
        className="absolute pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="goldTimerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f6e09e" />
            <stop offset="50%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
      </svg>

      {/* Mobile Portrait Lock Overlay (keeps Table, Socket.IO & LiveKit mounted) */}
      <RotateDeviceOverlay />

      {/* Declare Confirmation Modal */}
      {showDeclareModal && (
        <DeclareModal
          onConfirmDeclare={onDeclare}
          onClose={() => setShowDeclareModal(false)}
        />
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-14 mobile-landscape:top-10 left-1/2 -translate-x-1/2 z-50 bg-red-600/95 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-2xl border border-red-400 animate-bounce">
          {error}
        </div>
      )}

      {/* BAND 1: SINGLE-ROW ROYAL 13 GLASSMORPHIC TOP HUD BAR */}
      <header className="shrink-0 h-11 sm:h-12 mobile-landscape:h-9 w-full flex items-center justify-between gap-2 px-2.5 sm:px-4 mobile-landscape:px-2 glass-panel border-x-0 border-t-0 border-b border-white/10 z-30">
        {/* Left: Royal 13 Gold Star Emblem + Room Code + Live Video Pill */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 mobile-landscape:w-6 mobile-landscape:h-6 rounded-xl bg-gradient-to-br from-[#f6e09e] via-[#d4af37] to-[#8c6b1c] flex items-center justify-center shadow-md shadow-amber-500/20">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-950" />
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-serif-luxury text-sm font-bold tracking-wide text-[#f6e09e]">
                Royal 13
              </span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-slate-400">
                Points Rummy
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 glass-pill px-2 py-1 mobile-landscape:py-0.5 rounded-lg shrink-0">
            <span className="hidden md:inline text-[10px] text-slate-400">
              Table
            </span>
            <span className="text-[11px] sm:text-xs font-mono font-bold text-[#f6e09e] leading-none">
              {roomCode}
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="text-slate-400 hover:text-white p-0.5 transition"
              title="Copy Room Code"
            >
              {copiedCode ? (
                <span className="text-[9px] text-emerald-400 font-bold">✓</span>
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* LIVE VIDEO Pulsing Pill */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 mobile-landscape:py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
              videoStatus === "live"
                ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-300"
                : videoStatus === "audio-only"
                ? "bg-amber-500/15 border-amber-400/40 text-amber-200"
                : videoStatus === "connecting"
                ? "bg-sky-500/15 border-sky-400/40 text-sky-200"
                : "bg-slate-900/90 border-white/15 text-slate-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                videoStatus === "live"
                  ? "bg-emerald-400 animate-ping"
                  : videoStatus === "audio-only"
                  ? "bg-amber-400"
                  : videoStatus === "connecting"
                  ? "bg-sky-400 animate-pulse"
                  : "bg-slate-500"
              }`}
            />
            <span>{videoStatusLabel}</span>
            {!isVideoLive && videoStatus === "offline" && (
              <button
                type="button"
                onClick={requestRetry}
                className="ml-0.5 text-amber-300 hover:text-white transition"
                title="Reconnect Video"
              >
                <RefreshCw className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Turn / Show Countdown Pill */}
          {gameState &&
            (gameState.status === "PLAYING" || gameState.status === "SHOW") && (
              <div
                className={`flex items-center gap-1 px-2 py-1 mobile-landscape:py-0.5 rounded-lg border text-[11px] font-mono font-bold shrink-0 ${
                  displayedSeconds <= 5
                    ? "bg-red-600/25 border-red-400/60 text-red-200 animate-pulse"
                    : "bg-slate-900/80 border-amber-400/30 text-[#f6e09e]"
                }`}
              >
                <Clock className="w-3 h-3 shrink-0" />
                <span>{displayedSeconds}s</span>
              </div>
            )}
        </div>

        {/* Right: Scoreboard, Compact Video Toggle, Settings, Leave */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowScoreboard(true)}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 mobile-landscape:py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-[11px] font-semibold text-amber-200 transition"
            title="Scoreboard"
          >
            <Trophy className="w-3.5 h-3.5 text-[#f6e09e]" />
            <span className="hidden md:inline mobile-landscape:hidden">
              Scoreboard
            </span>
          </button>

          <button
            type="button"
            onClick={toggleCompactVideo}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 mobile-landscape:py-1 rounded-lg border text-[11px] font-semibold transition ${
              isCompactVideo
                ? "bg-amber-500/20 border-amber-400/50 text-amber-200"
                : "bg-slate-800/80 hover:bg-slate-700 border-white/10 text-slate-200"
            }`}
            title={
              isCompactVideo
                ? "Switch to Standard Video Tiles"
                : "Switch to Compact Video Tiles"
            }
          >
            {isCompactVideo ? (
              <Maximize2 className="w-3.5 h-3.5" />
            ) : (
              <Minimize2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden lg:inline mobile-landscape:hidden">
              {isCompactVideo ? "Standard" : "Compact"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-1.5 mobile-landscape:p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-slate-200 transition"
            title="Table Settings & Felt Theme"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 mobile-landscape:py-1 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-500/35 text-red-200 text-[11px] font-bold transition"
            title="Leave Table"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline mobile-landscape:hidden">
              Leave
            </span>
          </button>
        </div>
      </header>

      {/* BAND 2 + BAND 3 wrapped in ONE resilient LiveKit connection */}
      <VideoErrorBoundary fallback={stageElement}>
        <VideoOverlay roomCode={roomCode}>{stageElement}</VideoOverlay>
      </VideoErrorBoundary>

      {/* COLLAPSIBLE TABLE CHAT DRAWER (Room-Scoped Socket.IO CHAT_MESSAGE) */}
      {showChatDrawer && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex justify-end"
          onClick={() => setShowChatDrawer(false)}
        >
          <aside
            className="w-full max-w-xs sm:max-w-sm h-full glass-panel border-l border-white/15 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#f6e09e]" />
                <h3 className="text-sm font-bold text-white">Table Chat</h3>
                <span className="text-[10px] font-mono text-slate-400">
                  #{roomCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowChatDrawer(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-xs px-6 gap-1.5">
                  <MessageSquare className="w-7 h-7 text-slate-600" />
                  <p>No messages yet. Say hello to the table!</p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isMine = msg.playerId === currentUserId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        isMine ? "items-end" : "items-start"
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 mb-0.5 px-1">
                        {isMine ? "You" : msg.username}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs break-words ${
                          isMine
                            ? "bg-gradient-to-r from-[#d4af37]/30 to-[#f6e09e]/20 border border-[#f6e09e]/40 text-amber-50 rounded-br-sm"
                            : "bg-slate-800/90 border border-white/10 text-slate-100 rounded-bl-sm"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={handleChatSubmit}
              className="p-3 border-t border-white/10 flex items-center gap-2"
            >
              <input
                type="text"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                maxLength={300}
                placeholder="Type a message..."
                className="flex-1 bg-slate-950/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#f6e09e]"
              />
              <button
                type="submit"
                disabled={!chatDraft.trim()}
                className="p-2 rounded-xl bg-gradient-to-r from-[#f6e09e] to-[#d4af37] disabled:opacity-40 text-slate-950 font-bold transition"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </aside>
        </div>
      )}

      {/* SCOREBOARD MODAL (Round-by-Round + Cumulative Scores) */}
      {showScoreboard && gameState && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowScoreboard(false)}
        >
          <div
            className="glass-panel w-full max-w-lg max-h-[85dvh] rounded-3xl border border-amber-400/40 overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#f6e09e]" />
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">
                    Table Scoreboard
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Round {roundNumber} of {roundCount} • Lowest points leads
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScoreboard(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="space-y-2">
                {finalRankings.map((r, idx) => (
                  <div
                    key={r.playerId}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border ${
                      idx === 0
                        ? "bg-amber-500/15 border-amber-400/45"
                        : "bg-slate-900/70 border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                          idx === 0
                            ? "bg-gradient-to-r from-[#f6e09e] to-[#d4af37] text-slate-950"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        #{r.rank}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {r.username}
                        {r.playerId === currentUserId ? " (You)" : ""}
                      </span>
                    </div>
                    <span className="text-sm font-mono font-black text-[#f6e09e]">
                      {r.totalScore} pts
                    </span>
                  </div>
                ))}
              </div>

              {gameState.roundHistory && gameState.roundHistory.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Round-by-Round Breakdown
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="py-1.5 pr-3">Player</th>
                          {gameState.roundHistory.map((rh) => (
                            <th
                              key={rh.roundNumber}
                              className="py-1.5 px-2 text-right font-mono"
                            >
                              R{rh.roundNumber}
                            </th>
                          ))}
                          <th className="py-1.5 pl-2 text-right font-mono text-[#f6e09e]">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {finalRankings.map((r) => (
                          <tr key={r.playerId}>
                            <td className="py-2 pr-3 font-semibold text-white">
                              {r.username}
                            </td>
                            {gameState.roundHistory!.map((rh) => (
                              <td
                                key={rh.roundNumber}
                                className="py-2 px-2 text-right font-mono text-slate-300"
                              >
                                {rh.scores[r.playerId] ?? 0}
                              </td>
                            ))}
                            <td className="py-2 pl-2 text-right font-mono font-bold text-[#f6e09e]">
                              {r.totalScore}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL (Felt Theme Switcher + Sound Mute + Compact Video) */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="glass-panel w-full max-w-md rounded-3xl border border-amber-400/40 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#f6e09e]" />
                <h3 className="text-base font-bold text-white">
                  Royal 13 Settings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Felt Theme Switcher */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-200">
                  Table Felt Theme
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {FELT_THEMES.map((theme) => {
                    const active = feltTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setFeltTheme(theme.id)}
                        className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border text-center transition ${
                          active
                            ? "bg-amber-500/15 border-[#f6e09e] shadow-lg"
                            : "bg-slate-900/70 border-white/10 hover:border-white/25"
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-full bg-gradient-to-br ${theme.swatch} border-2 ${
                            active ? "border-[#f6e09e]" : "border-white/25"
                          } shadow-inner`}
                        />
                        <span className="text-[11px] font-bold text-white leading-tight">
                          {theme.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Audio & Video Preferences */}
              <div className="space-y-2.5 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={toggleMuted}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 transition"
                >
                  <div className="flex items-center gap-2.5 text-left">
                    {isMuted ? (
                      <VolumeX className="w-4 h-4 text-slate-400" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-[#f6e09e]" />
                    )}
                    <div>
                      <div className="text-xs font-bold text-white">
                        Game Sound Effects
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Card draw, discard, turn chime &amp; win fanfare
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isMuted
                        ? "bg-slate-800 text-slate-400"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {isMuted ? "Muted" : "On"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleCompactVideo}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 transition"
                >
                  <div className="flex items-center gap-2.5 text-left">
                    {isCompactVideo ? (
                      <Minimize2 className="w-4 h-4 text-[#f6e09e]" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-sky-300" />
                    )}
                    <div>
                      <div className="text-xs font-bold text-white">
                        Video Tile Size
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Compact gives extra felt room on smaller screens
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-200 text-[10px] font-bold">
                    {isCompactVideo ? "Compact" : "Standard"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROUND END / GAME OVER RESULTS MODAL */}
      {(isRoundEnd || isGameOver) && gameState && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-xl w-full max-h-[90dvh] overflow-y-auto border border-amber-400/50 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400/60 text-[#f6e09e] mb-1">
                <Trophy className="w-6 h-6" />
              </div>
              <h2 className="font-serif-luxury text-2xl font-bold text-[#f6e09e]">
                {isGameOver
                  ? "Match Complete!"
                  : `Round ${roundNumber} Complete!`}
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm">
                {isGameOver && finalRankings[0] ? (
                  <>
                    Champion:{" "}
                    <strong className="text-white">
                      {finalRankings[0].username}
                    </strong>{" "}
                    ({finalRankings[0].totalScore} total pts)
                  </>
                ) : (
                  <>
                    Round Winner:{" "}
                    <strong className="text-white">
                      {winnerPlayer?.username || "Winner"}
                    </strong>{" "}
                    (0 pts)
                  </>
                )}
              </p>
            </div>

            {gameState.winnerMelds && gameState.winnerMelds.length > 0 && (
              <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-3 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  Winning Melds ({winnerPlayer?.username || "Winner"})
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {gameState.winnerMelds.map((meld, idx) => (
                    <div key={idx} className="flex items-center -space-x-4">
                      {meld.map((c) => (
                        <Card key={c.id} card={c} size="sm" disabled />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {isGameOver
                  ? "Final Standings"
                  : `Round ${roundNumber} Scores`}
              </div>
              {finalRankings.map((entry, idx) => {
                const roundInfo = gameState.roundScores?.[entry.playerId];
                const isRoundWinner = entry.playerId === gameState.winnerId;
                return (
                  <div
                    key={entry.playerId}
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      isGameOver && idx === 0
                        ? "bg-amber-500/15 border-amber-400/50"
                        : isRoundWinner
                        ? "bg-emerald-950/60 border-emerald-500/40"
                        : "bg-slate-900/70 border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          idx === 0
                            ? "bg-gradient-to-r from-[#f6e09e] to-[#d4af37] text-slate-950"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        #{entry.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {entry.username}
                          {entry.playerId === currentUserId ? " (You)" : ""}
                        </div>
                        {roundInfo?.reason && (
                          <div className="text-[11px] text-slate-400">
                            {roundInfo.reason}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {roundInfo && (
                        <div
                          className={`text-sm font-mono font-bold ${
                            roundInfo.points === 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          +{roundInfo.points} pts
                        </div>
                      )}
                      <div className="text-[11px] font-mono text-[#f6e09e]">
                        Total: {entry.totalScore} pts
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              {isRoundEnd && hasMoreRounds && (
                <>
                  {isHost ? (
                    <button
                      type="button"
                      onClick={onNextRound}
                      className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#f6e09e] to-[#d4af37] hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>
                        Start Round {roundNumber + 1} / {roundCount}
                      </span>
                    </button>
                  ) : (
                    <div className="flex-1 py-3 px-4 rounded-xl bg-slate-900 border border-white/10 text-center text-xs text-slate-300 font-semibold">
                      Waiting for host to start Round {roundNumber + 1}...
                    </div>
                  )}
                </>
              )}

              {isGameOver && (
                <button
                  type="button"
                  onClick={onReturnToLobby}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#f6e09e] to-[#d4af37] hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Return to Lobby</span>
                </button>
              )}

              <button
                type="button"
                onClick={onExit}
                className="sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition"
              >
                Leave Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
