"use client";

import confetti from "canvas-confetti";
import {
  Award,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  LogOut,
  Mic,
  MicOff,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/game/Card";
import { CardHand } from "@/components/game/CardHand";
import { DeckPiles } from "@/components/game/DeckPiles";
import { DeclareModal } from "@/components/game/DeclareModal";
import { RotateDeviceOverlay } from "@/components/game/RotateDeviceOverlay";
import { VideoErrorBoundary } from "@/components/video/VideoErrorBoundary";
import { VideoOverlay } from "@/components/video/VideoOverlay";
import { ClientEvaluator } from "@/lib/clientEvaluator";
import { soundEffects } from "@/lib/soundEffects";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { useVideoStore } from "@/store/useVideoStore";
import { Card as CardType, MeldType } from "@/types";

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
  onExit: () => void;
}

function getMeldBadgeLabel(type: MeldType): { label: string; className: string } {
  switch (type) {
    case "PURE_SEQUENCE":
      return {
        label: "Pure Seq",
        className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      };
    case "IMPURE_SEQUENCE":
      return {
        label: "Impure Seq",
        className: "bg-blue-500/20 text-blue-300 border-blue-500/40",
      };
    case "SET":
      return {
        label: "Set",
        className: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      };
    default:
      return {
        label: "Group",
        className: "bg-zinc-800 text-zinc-300 border-zinc-700",
      };
  }
}

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
  } = useGameStore();
  const {
    isMicMuted,
    isCameraOff,
    isVideoCollapsed,
    micPermissionDenied,
    cameraPermissionDenied,
    videoStatus,
    videoStatusLabel,
    toggleMic,
    toggleCamera,
    toggleCollapsed,
    requestRetry,
  } = useVideoStore();

  const [copiedCode, setCopiedCode] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const prevTurnPlayerRef = useRef<string | null>(null);
  const celebratedKeyRef = useRef<string | null>(null);

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
      ? (gameState.showEndsAt ?? gameState.turnEndsAt ?? null)
      : gameState?.status === "PLAYING"
      ? (gameState.turnEndsAt ?? null)
      : null;

  // Smooth 1-second client countdown derived from server-authoritative turnEndsAt / showEndsAt
  useEffect(() => {
    if (!activeDeadline) return;
    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeDeadline]);

  const displayedSeconds = activeDeadline
    ? Math.max(0, Math.ceil((activeDeadline - nowMs) / 1000))
    : Math.max(0, gameState?.turnTimeRemainingSeconds ?? 0);

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
  const currentPlayerInfo = gameState?.players.find((p) => p.id === currentUserId);
  const winnerPlayer = gameState?.players.find((p) => p.id === gameState.winnerId);
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
    return ClientEvaluator.calculatePlayerScore(handGroups);
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
    if (turnId && turnId !== prevTurnPlayerRef.current && turnId === currentUserId) {
      soundEffects.playTurnAlert(isMuted);
    }
    prevTurnPlayerRef.current = turnId;
  }, [gameState, currentUserId, isMuted]);

  // Confetti + win fanfare celebration on ROUND_END / GAME_OVER
  useEffect(() => {
    if (!gameState || (gameState.status !== "ROUND_END" && gameState.status !== "GAME_OVER")) {
      return;
    }

    const celebrationKey = `${gameState.status}-${gameState.roundNumber ?? 1}-${gameState.winnerId ?? ""}`;
    if (celebratedKeyRef.current === celebrationKey) return;

    const championId = finalRankings[0]?.playerId;
    const localWonRound = Boolean(currentUserId && gameState.winnerId === currentUserId);
    const localWonGame = Boolean(
      gameState.status === "GAME_OVER" && currentUserId && championId === currentUserId
    );

    if (localWonRound || localWonGame) {
      celebratedKeyRef.current = celebrationKey;
      soundEffects.playWinFanfare(isMuted);
      confetti({
        particleCount: gameState.status === "GAME_OVER" ? 130 : 80,
        spread: 75,
        origin: { y: 0.6 },
        colors: ["#fbbf24", "#34d399", "#f87171", "#ffffff"],
      });
    }
  }, [gameState, currentUserId, finalRankings, isMuted]);

  const isVideoLive = videoStatus === "live" || videoStatus === "audio-only";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col justify-between bg-zinc-950 text-white select-none">
      {/* Mobile Portrait Lock Overlay (CSS-only visibility — keeps Table, Socket.IO & LiveKit mounted) */}
      <RotateDeviceOverlay />

      {/* Declare Modal */}
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

      {/* BAND 1: Compact Single-Row Top Header Bar (44px-48px desktop; 36px mobile landscape) */}
      <header className="shrink-0 h-11 sm:h-12 mobile-landscape:h-9 w-full flex items-center justify-between gap-1.5 px-2 sm:px-4 mobile-landscape:px-2 mobile-landscape:text-xs bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 z-30">
        {/* Left: Room Code, Round & Compact WebRTC Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="hidden md:flex items-center gap-1.5 bg-emerald-950/80 px-2 py-1 rounded-lg border border-emerald-600/40 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[11px] font-bold text-emerald-300 leading-none">
              Live Table
            </span>
          </div>

          <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded-lg border border-zinc-800 shrink-0">
            <span className="hidden sm:inline text-[11px] text-zinc-400 font-medium">
              Room:
            </span>
            <span className="text-[11px] sm:text-xs font-mono font-bold text-amber-400 leading-none">
              {roomCode}
            </span>
            <button
              onClick={copyCode}
              className="text-zinc-400 hover:text-white p-0.5 transition"
              title="Copy Room Code"
            >
              {copiedCode ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>

          <span className="hidden sm:inline text-[11px] font-semibold text-zinc-400 whitespace-nowrap">
            R{roundNumber}
            {roundCount > 1 ? `/${roundCount}` : ""}
          </span>

          {/* Compact WebRTC Status Pill (replaces old separate video header bar) */}
          <div className="hidden lg:flex items-center gap-1">
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border leading-none whitespace-nowrap ${
                videoStatus === "live"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : videoStatus === "audio-only"
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700"
              }`}
            >
              {videoStatusLabel}
            </span>
            {videoStatus === "offline" && (
              <button
                type="button"
                onClick={requestRetry}
                className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 transition"
                title="Retry Video Connection"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Center: Live Turn / Show Timer Countdown Pill */}
        {gameState && (gameState.status === "PLAYING" || gameState.status === "SHOW") && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-zinc-400 font-medium hidden md:inline">
              {gameState.status === "SHOW" ? "Show:" : "Timer:"}
            </span>
            <div className="flex items-center gap-1 bg-zinc-900 px-2.5 py-1 mobile-landscape:px-2 mobile-landscape:py-0.5 rounded-full border border-zinc-700">
              <Clock className="w-3 h-3 text-amber-400" />
              <span
                className={`text-[11px] sm:text-xs font-black font-mono leading-none ${
                  displayedSeconds <= 10
                    ? "text-red-400 animate-pulse"
                    : "text-amber-400"
                }`}
              >
                {displayedSeconds}s
              </span>
            </div>
          </div>
        )}

        {/* Right: Mic, Camera, Collapse Video, Game Audio & Leave */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {isVideoLive && (
            <>
              <button
                type="button"
                onClick={toggleMic}
                disabled={micPermissionDenied}
                aria-label={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
                title={
                  micPermissionDenied
                    ? "Microphone permission denied"
                    : isMicMuted
                    ? "Unmute Mic"
                    : "Mute Mic"
                }
                className={`p-1.5 mobile-landscape:p-1 rounded-lg border transition ${
                  micPermissionDenied
                    ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : isMicMuted
                    ? "bg-red-600/25 border-red-500/60 text-red-300 hover:bg-red-600/40"
                    : "bg-zinc-900 border-zinc-700 text-emerald-400 hover:bg-zinc-800"
                }`}
              >
                {isMicMuted || micPermissionDenied ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                disabled={cameraPermissionDenied}
                aria-label={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
                title={
                  cameraPermissionDenied
                    ? "Camera unavailable (Audio-only mode)"
                    : isCameraOff
                    ? "Turn Camera On"
                    : "Turn Camera Off"
                }
                className={`p-1.5 mobile-landscape:p-1 rounded-lg border transition ${
                  cameraPermissionDenied
                    ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : isCameraOff
                    ? "bg-red-600/25 border-red-500/60 text-red-300 hover:bg-red-600/40"
                    : "bg-zinc-900 border-zinc-700 text-blue-400 hover:bg-zinc-800"
                }`}
              >
                {isCameraOff || cameraPermissionDenied ? (
                  <CameraOff className="w-3.5 h-3.5" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}

          {videoStatus === "offline" && (
            <button
              type="button"
              onClick={requestRetry}
              aria-label="Retry Video Connection"
              title="Retry Video Connection"
              className="lg:hidden p-1.5 mobile-landscape:p-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={isVideoCollapsed ? "Show Player Video Tiles" : "Hide Player Video Tiles"}
            title={isVideoCollapsed ? "Expand Video Strip" : "Collapse Video Strip"}
            className="p-1.5 mobile-landscape:p-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition"
          >
            {isVideoCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-0.5 hidden sm:block" />

          <button
            type="button"
            onClick={toggleMuted}
            aria-label={isMuted ? "Unmute Game Audio" : "Mute Game Audio"}
            title={isMuted ? "Unmute Game Audio" : "Mute Game Audio"}
            className={`p-1.5 mobile-landscape:p-1 rounded-lg border transition ${
              isMuted
                ? "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                : "bg-zinc-900 border-amber-500/40 text-amber-400 hover:bg-zinc-800"
            }`}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={onExit}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 mobile-landscape:py-1 rounded-lg bg-zinc-900 hover:bg-red-950 text-[11px] sm:text-xs font-semibold text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-600/40 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* MIDDLE FELT AREA (BAND 2 Video Strip + BAND 3 Center Table Felt) */}
      <main className="relative flex-1 min-h-0 flex flex-col overflow-hidden bg-felt-pattern border-y-2 border-amber-600/30 shadow-inner">
        {/* BAND 2: Compact Upper Video Strip (shrink-0) */}
        <section
          className={`shrink-0 w-full z-20 ${
            isVideoCollapsed
              ? "py-0"
              : "pt-1.5 pb-1 px-2 mobile-landscape:py-0.5 mobile-landscape:px-1.5"
          }`}
        >
          <VideoErrorBoundary>
            <VideoOverlay roomCode={roomCode} />
          </VideoErrorBoundary>
        </section>

        {/* BAND 3: Center Table Felt (flex-1 min-h-0, Deck Piles OR Show Panel) */}
        <section className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-1.5 sm:gap-2 mobile-landscape:gap-1 px-2 py-1 mobile-landscape:py-0.5 overflow-hidden z-10">
          {isShowPhase && gameState ? (
            <div className="w-full max-w-3xl max-h-full overflow-y-auto rounded-2xl bg-zinc-950/90 backdrop-blur-md border border-amber-500/50 p-3 sm:p-4 shadow-2xl">
              {/* Show Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-white">
                      {winnerPlayer?.username || "Winner"} Declared Rummy!
                    </h2>
                    <p className="text-[11px] text-zinc-400">
                      {canSubmitOpponentMelds
                        ? "Group your valid sequences & sets below and submit melds to reduce your points."
                        : "Waiting for remaining opponents to submit their melds."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/40">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span
                    className={`text-xs font-black font-mono ${
                      displayedSeconds <= 10 ? "text-red-400 animate-pulse" : "text-amber-300"
                    }`}
                  >
                    {displayedSeconds}s
                  </span>
                </div>
              </div>

              {/* Winner's Declared Melds */}
              {gameState.winnerMelds && gameState.winnerMelds.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider mb-1.5">
                    Winning Hand ({winnerPlayer?.username || "Winner"})
                  </div>
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
                    {gameState.winnerMelds.map((meld, mIdx) => {
                      const evaluated = ClientEvaluator.evaluateMeld(meld);
                      const badge = getMeldBadgeLabel(evaluated.type);
                      return (
                        <div
                          key={mIdx}
                          className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-zinc-950/70 border border-zinc-800"
                        >
                          <div className="flex items-center -space-x-4">
                            {meld.map((card) => (
                              <div key={card.id} className="pointer-events-none">
                                <Card card={card} size="sm" />
                              </div>
                            ))}
                          </div>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Opponent Submission Status Pills */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {activeShowOpponents.map((opp) => {
                  const done = submittedIds.has(opp.id);
                  return (
                    <span
                      key={opp.id}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                        done
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-zinc-900 text-zinc-300 border-zinc-700"
                      }`}
                    >
                      {done && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      <span>
                        {opp.username}: {done ? "Submitted" : "Arranging..."}
                      </span>
                    </span>
                  );
                })}
              </div>

              {/* Action Bar for Active Opponent */}
              {canSubmitOpponentMelds ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="text-xs text-zinc-200">
                    <span>Estimated Deadwood: </span>
                    <strong className="text-amber-300 font-mono text-sm">
                      {liveDeadwoodPreview ? `${liveDeadwoodPreview.points} pts` : "80 pts"}
                    </strong>
                    <span className="text-zinc-400 ml-1">(cap 80)</span>
                  </div>
                  <button
                    onClick={() => onSubmitMelds(handGroups)}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/30 flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Melds</span>
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-center text-xs text-zinc-300">
                  {currentUserId === gameState.winnerId
                    ? "Your winning declaration is verified! Waiting for opponents to submit their melds..."
                    : submittedIds.has(currentUserId)
                    ? "Melds submitted! Waiting for remaining players..."
                    : "You dropped this round. Waiting for show phase to complete..."}
                </div>
              )}
            </div>
          ) : (
            <DeckPiles onDraw={handleDrawWithSound} />
          )}
        </section>

        {/* Round End / Game Over Scores Overlay */}
        {(isRoundEnd || isGameOver) && gameState && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="w-full max-w-xl rounded-2xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-amber-500/50 p-6 shadow-2xl flex flex-col items-center my-auto">
              <div className="p-3 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 mb-3">
                <Trophy className="w-8 h-8" />
              </div>

              <h2 className="text-xl font-black text-white tracking-wide text-center">
                {isGameOver
                  ? "Game Over — Final Rankings"
                  : `Round ${roundNumber} of ${roundCount} Finished!`}
              </h2>
              <p className="text-xs text-zinc-400 mb-4 text-center">
                {isGameOver
                  ? `Lowest cumulative score wins across ${roundNumber} round${roundNumber === 1 ? "" : "s"}`
                  : "Official Round & Cumulative Points Breakdown"}
              </p>

              {/* Winner's Declared Melds (if round ended via valid declaration) */}
              {gameState.winnerMelds && gameState.winnerMelds.length > 0 && (
                <div className="w-full mb-4">
                  <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider mb-1.5">
                    Declared Winning Melds ({winnerPlayer?.username || "Winner"})
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                    {gameState.winnerMelds.map((meld, mIdx) => {
                      const evaluated = ClientEvaluator.evaluateMeld(meld);
                      const badge = getMeldBadgeLabel(evaluated.type);
                      return (
                        <div
                          key={mIdx}
                          className="flex flex-col items-center gap-1 p-1.5 rounded-lg bg-zinc-900 border border-zinc-800"
                        >
                          <div className="flex items-center -space-x-4">
                            {meld.map((card) => (
                              <div key={card.id} className="pointer-events-none">
                                <Card card={card} size="sm" />
                              </div>
                            ))}
                          </div>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Scores / Rankings List */}
              <div className="w-full space-y-2 mb-6">
                {isGameOver ? (
                  finalRankings.map((entry) => {
                    const roundInfo = gameState.roundScores?.[entry.playerId];
                    const isChampion = entry.rank === 1;
                    return (
                      <div
                        key={entry.playerId}
                        className={`flex items-center justify-between p-3 rounded-xl border ${
                          isChampion
                            ? "bg-amber-500/15 border-amber-400/60 shadow-md"
                            : "bg-zinc-900 border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                              isChampion
                                ? "bg-amber-400 text-zinc-950"
                                : "bg-zinc-800 text-zinc-300"
                            }`}
                          >
                            #{entry.rank}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">
                                {entry.username}
                              </span>
                              {isChampion && (
                                <span className="bg-amber-400 text-zinc-950 text-[9px] font-black px-1.5 rounded">
                                  CHAMPION
                                </span>
                              )}
                            </div>
                            {roundInfo && (
                              <span className="text-[10px] text-zinc-400">
                                Last Round: {roundInfo.reason} (+{roundInfo.points} pts)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <strong
                            className={`text-sm ${
                              isChampion ? "text-emerald-400" : "text-amber-300"
                            }`}
                          >
                            {entry.totalScore} pts
                          </strong>
                          <div className="text-[10px] text-zinc-500">Total</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  gameState.roundScores &&
                  Object.entries(gameState.roundScores).map(([playerId, scoreInfo]) => {
                    const player = gameState.players.find((p) => p.id === playerId);
                    const isWinner =
                      playerId === gameState.winnerId || scoreInfo.points === 0;

                    return (
                      <div
                        key={playerId}
                        className={`flex items-center justify-between p-3 rounded-xl border ${
                          isWinner
                            ? "bg-amber-500/10 border-amber-500/50 shadow-md"
                            : "bg-zinc-900 border-zinc-800"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">
                              {player?.username || playerId}
                            </span>
                            {isWinner && (
                              <span className="bg-amber-400 text-zinc-950 text-[9px] font-black px-1.5 rounded">
                                WINNER
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400">
                            {scoreInfo.reason}
                          </span>
                        </div>

                        <div className="text-right font-mono">
                          <strong
                            className={`text-sm ${
                              isWinner ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            +{scoreInfo.points} pts
                          </strong>
                          <div className="text-[10px] text-zinc-400">
                            Total: {scoreInfo.totalScore} pts
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-2.5">
                {isRoundEnd && hasMoreRounds && (
                  isHost ? (
                    <button
                      onClick={onNextRound}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Next Round ({roundNumber + 1} / {roundCount})</span>
                    </button>
                  ) : (
                    <div className="w-full py-2.5 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-center text-xs text-amber-300 font-semibold">
                      Waiting for host to start Round {roundNumber + 1}...
                    </div>
                  )
                )}

                <button
                  onClick={onReturnToLobby}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 ${
                    isGameOver
                      ? "bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 shadow-lg shadow-amber-500/20"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                  }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Return to Lobby</span>
                </button>

                {isGameOver && (
                  <button
                    onClick={onExit}
                    className="w-full py-2 rounded-xl bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-300 border border-zinc-800 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Leave Room</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* BAND 4: Bottom Player Hand Dock (shrink-0, always 100% visible) */}
      <footer className="shrink-0 w-full bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 z-30">
        <CardHand
          onDiscard={handleDiscardWithSound}
          onDeclare={(declareCardId) => setShowDeclareModal(true, declareCardId ?? null)}
          onDrop={onDrop}
          onSort={onSort}
        />
      </footer>
    </div>
  );
};
