"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Award, Crown, Sparkles } from "lucide-react";
import React, { useState } from "react";
import { Card } from "@/components/game/Card";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { Suit } from "@/types";

interface DeckPilesProps {
  onDraw: (source: "CLOSED" | "DISCARD") => void;
  onOpenDeclare: () => void;
}

const SUIT_GLYPH: Record<Suit, { symbol: string; color: string }> = {
  SPADES: { symbol: "♠", color: "text-slate-200" },
  CLUBS: { symbol: "♣", color: "text-slate-200" },
  HEARTS: { symbol: "♥", color: "text-red-400" },
  DIAMONDS: { symbol: "♦", color: "text-red-400" },
  JOKER: { symbol: "★", color: "text-amber-300" },
};

export const DeckPiles: React.FC<DeckPilesProps> = ({
  onDraw,
  onOpenDeclare,
}) => {
  const user = useAuthStore((s) => s.user);
  const gameState = useGameStore((s) => s.gameState);
  const [showRecentTooltip, setShowRecentTooltip] = useState(false);

  if (!gameState) return null;

  const isTossPhase = gameState.status === "TOSS";
  const isPlaying = gameState.status === "PLAYING";
  const isMyTurn = isPlaying && gameState.currentTurnPlayerId === user?.id;
  const isDrawPhase = isMyTurn && gameState.turnPhase === "DRAW";
  const isDiscardPhase = isMyTurn && gameState.turnPhase === "DISCARD";

  const activePlayer = gameState.players.find(
    (p) => p.id === gameState.currentTurnPlayerId
  );

  const wildRankLabel = gameState.wildJoker
    ? gameState.wildJoker.isPrintedJoker ||
      gameState.wildJoker.rank === "PRINTED_JOKER"
      ? "Ace (A)"
      : gameState.wildJoker.rank
    : null;

  const recentDiscards = (gameState.recentDiscards ?? []).slice(-5).reverse();

  // TOSS CARD-REVEAL OVERLAY ON CENTER FELT
  if (isTossPhase && gameState.tossResults && gameState.tossResults.length > 0) {
    const tossWinner = gameState.tossResults[0];
    return (
      <div className="flex flex-col items-center justify-center gap-2 sm:gap-3 mobile-landscape:gap-1.5 z-20 px-2 max-w-full">
        <div className="glass-pill px-3 py-1 rounded-full flex items-center gap-2 text-[10px] sm:text-xs font-semibold text-amber-200 border border-amber-400/35">
          <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>Toss — Determining Turn Order</span>
          <span className="text-emerald-300/90 animate-pulse">
            • Reshuffling &amp; dealing...
          </span>
        </div>

        <div className="glass-panel rounded-2xl px-3 py-2.5 sm:px-5 sm:py-3.5 mobile-landscape:px-2.5 mobile-landscape:py-1.5 border border-amber-400/35 max-w-full overflow-x-auto">
          <div className="flex items-end justify-center gap-2.5 sm:gap-4 mobile-landscape:gap-2">
            {gameState.tossResults.map((res, idx) => {
              const isWinner = idx === 0;
              return (
                <motion.div
                  key={res.playerId}
                  initial={{ opacity: 0, y: 14, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: idx * 0.08 }}
                  className={`flex flex-col items-center gap-1 px-2 py-1.5 mobile-landscape:px-1.5 mobile-landscape:py-1 rounded-xl border ${
                    isWinner
                      ? "bg-amber-500/15 border-amber-300/70 shadow-[0_0_20px_rgba(212,175,55,0.3)]"
                      : "bg-slate-900/50 border-white/10"
                  }`}
                >
                  <span
                    className={`text-[9px] mobile-landscape:text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none ${
                      isWinner
                        ? "bg-gradient-to-r from-[#f6e09e] to-[#d4af37] text-slate-950"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {isWinner ? "#1 Priority" : `#${res.seatIndex + 1}`}
                  </span>

                  <Card card={res.card} size="sm" disabled />

                  <span className="text-[10px] sm:text-xs mobile-landscape:text-[9px] font-bold text-white max-w-[72px] truncate">
                    {res.username}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="glass-pill px-3 py-1 rounded-full text-[10px] sm:text-xs text-slate-200">
          <strong className="text-amber-300">{tossWinner.username}</strong> won
          the toss &amp; plays first!
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 sm:gap-2.5 mobile-landscape:gap-1 z-20 max-w-full">
      {/* Top Center Glass Table Info Pill */}
      <div className="glass-pill px-3 py-1 mobile-landscape:px-2.5 mobile-landscape:py-0.5 rounded-full flex items-center gap-2 text-[10px] sm:text-[11px] mobile-landscape:text-[9px] text-slate-200 font-medium shadow">
        <span className="font-semibold text-amber-200">
          13-Card Points Rummy
        </span>
        <span className="text-white/25">•</span>
        <span>
          Round {gameState.roundNumber}/{gameState.roundCount}
        </span>
        {wildRankLabel && (
          <>
            <span className="text-white/25 hidden sm:inline">•</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-amber-300 font-bold">
              <Sparkles className="w-3 h-3" />
              Wild: {wildRankLabel}
            </span>
          </>
        )}
      </div>

      {/* 3-Column Center Felt: Closed Deck (+ Wild Joker) | Open Discard Pile | Finish / Declare Slot */}
      <div className="flex items-center justify-center gap-6 sm:gap-10 lg:gap-12 mobile-landscape:gap-5 px-4 sm:px-6 mobile-landscape:px-3 py-1.5 sm:py-2 mobile-landscape:py-1">
        {/* COLUMN 1: CLOSED DECK + PEEKING -rotate-90 WILDCARD JOKER */}
        <div className="relative flex flex-col items-center group pl-5 sm:pl-7 mobile-landscape:pl-4">
          {/* Wildcard Joker peeking sideways (-rotate-90) underneath Closed Deck */}
          {gameState.wildJoker && (
            <div className="absolute -left-2 sm:-left-3 mobile-landscape:-left-1.5 top-2 mobile-landscape:top-1 -rotate-90 z-0 transition-transform group-hover:-translate-x-1 pointer-events-none">
              <Card card={gameState.wildJoker} size="deck" disabled />
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#f6e09e] to-[#d4af37] text-slate-950 text-[7px] sm:text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full shadow leading-none whitespace-nowrap">
                Joker
              </div>
            </div>
          )}

          {/* 3D Stacked Closed Deck Layers */}
          <div className="relative z-10">
            <div className="absolute -top-1 -left-1 w-full h-full rounded-lg card-back opacity-50 pointer-events-none" />
            <div className="absolute -top-0.5 -left-0.5 w-full h-full rounded-lg card-back opacity-75 pointer-events-none" />

            <motion.div
              whileHover={isDrawPhase ? { scale: 1.04 } : undefined}
              whileTap={isDrawPhase ? { scale: 0.95 } : undefined}
              onClick={() => isDrawPhase && onDraw("CLOSED")}
              className={`relative rounded-lg ${
                isDrawPhase
                  ? "cursor-pointer draw-highlight ring-2 ring-[#f6e09e]"
                  : "cursor-default"
              }`}
            >
              <Card faceDown size="deck" disabled={!isDrawPhase} />
              {/* Remaining Deck Count Badge */}
              <div className="absolute -top-2 -right-2 bg-slate-950/95 text-[#f6e09e] border border-[#d4af37]/60 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-lg leading-none">
                {gameState.closedDeckCount}
              </div>
            </motion.div>
          </div>

          <span className="mt-1.5 mobile-landscape:mt-1 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold uppercase tracking-wider text-emerald-100/80 leading-none">
            Closed Deck
          </span>
        </div>

        {/* COLUMN 2: OPEN DISCARD PILE + LAST 5 HOVER TOOLTIP */}
        <div
          className="relative flex flex-col items-center"
          onMouseEnter={() => setShowRecentTooltip(true)}
          onMouseLeave={() => setShowRecentTooltip(false)}
        >
          {/* Hover Tooltip: Last 5 Discarded Cards */}
          {showRecentTooltip && recentDiscards.length > 0 && (
            <div className="hidden sm:block mobile-landscape:hidden absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-40 glass-panel rounded-xl px-2.5 py-2 border border-amber-400/35 shadow-2xl whitespace-nowrap pointer-events-none">
              <div className="text-[9px] uppercase tracking-wider font-bold text-amber-300 mb-1 text-center">
                Recent Discards (Last {recentDiscards.length})
              </div>
              <div className="flex items-center gap-1.5">
                {recentDiscards.map((rc, i) => {
                  const glyph = SUIT_GLYPH[rc.suit];
                  return (
                    <span
                      key={`${rc.id}-${i}`}
                      className={`px-1.5 py-0.5 rounded bg-slate-900/90 border text-[10px] font-bold font-mono ${
                        i === 0
                          ? "border-amber-400/70 text-white"
                          : "border-white/10 text-slate-300"
                      }`}
                    >
                      {rc.isPrintedJoker ? "JKR" : rc.rank}
                      <span className={`ml-0.5 ${glyph.color}`}>
                        {glyph.symbol}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <motion.div
            whileHover={
              isDrawPhase && gameState.topDiscardCard
                ? { scale: 1.04 }
                : undefined
            }
            whileTap={
              isDrawPhase && gameState.topDiscardCard
                ? { scale: 0.95 }
                : undefined
            }
            onClick={() =>
              isDrawPhase && gameState.topDiscardCard && onDraw("DISCARD")
            }
            className={`relative z-10 rounded-lg ${
              isDrawPhase && gameState.topDiscardCard
                ? "cursor-pointer draw-highlight ring-2 ring-emerald-300"
                : "cursor-default"
            }`}
          >
            <AnimatePresence mode="wait">
              {gameState.topDiscardCard ? (
                <motion.div
                  key={gameState.topDiscardCard.id}
                  initial={{ opacity: 0, y: -12, rotate: -5, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                >
                  <Card
                    card={gameState.topDiscardCard}
                    size="deck"
                    disabled={!isDrawPhase}
                  />
                </motion.div>
              ) : (
                <div className="w-14 h-20 sm:w-[68px] sm:h-[98px] lg:w-[78px] lg:h-[112px] mobile-landscape:w-12 mobile-landscape:h-[68px] rounded-lg border-2 border-dashed border-white/20 bg-black/15 flex items-center justify-center text-slate-400 text-[9px] text-center px-1">
                  Open Pile
                </div>
              )}
            </AnimatePresence>

            {/* Discard Count Badge */}
            <div className="absolute -top-2 -right-2 bg-slate-950/95 text-emerald-300 border border-emerald-400/45 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-lg leading-none">
              {gameState.discardPileCount}
            </div>
          </motion.div>

          <span className="mt-1.5 mobile-landscape:mt-1 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold uppercase tracking-wider text-emerald-100/80 leading-none">
            Open Pile
          </span>
        </div>

        {/* COLUMN 3: FINISH / DECLARE SLOT */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => isDiscardPhase && onOpenDeclare()}
            disabled={!isDiscardPhase}
            className={`w-14 h-20 sm:w-[68px] sm:h-[98px] lg:w-[78px] lg:h-[112px] mobile-landscape:w-12 mobile-landscape:h-[68px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 px-1 text-center transition-all ${
              isDiscardPhase
                ? "border-[#f6e09e] bg-amber-500/15 hover:bg-amber-500/25 text-[#f6e09e] cursor-pointer shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:scale-105"
                : "border-[#d4af37]/35 bg-black/15 text-[#d4af37]/55 cursor-not-allowed"
            }`}
            title={
              isDiscardPhase
                ? "Click to finish & declare your melds"
                : "Available after drawing a card on your turn"
            }
          >
            <Award className="w-4 h-4 sm:w-5 sm:h-5 mobile-landscape:w-3.5 mobile-landscape:h-3.5 shrink-0" />
            <span className="text-[8px] sm:text-[9px] mobile-landscape:text-[7px] font-extrabold uppercase tracking-wider leading-tight">
              Finish Slot
            </span>
          </button>

          <span className="mt-1.5 mobile-landscape:mt-1 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold uppercase tracking-wider text-amber-200/75 leading-none">
            Declare
          </span>
        </div>
      </div>

      {/* Bottom Center Turn Status Glass Pill */}
      <div
        className={`glass-pill px-3.5 py-1 mobile-landscape:px-2.5 mobile-landscape:py-0.5 rounded-full text-[10px] sm:text-xs mobile-landscape:text-[9px] font-semibold flex items-center gap-1.5 shadow ${
          isMyTurn
            ? "border-[#f6e09e]/60 text-[#f6e09e]"
            : "border-white/10 text-slate-200"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isMyTurn ? "bg-[#f6e09e] animate-pulse" : "bg-emerald-400"
          }`}
        />
        {isDrawPhase ? (
          <span>Your Turn — Pick from Closed Deck or Open Pile</span>
        ) : isDiscardPhase ? (
          <span>Your Turn — Select 1 card &amp; Discard or Finish</span>
        ) : activePlayer ? (
          <span>
            <strong className="text-white">{activePlayer.username}</strong> is
            playing ({gameState.turnPhase === "DRAW" ? "Drawing" : "Discarding"}
            )...
          </span>
        ) : (
          <span>Table Ready</span>
        )}
      </div>
    </div>
  );
};
