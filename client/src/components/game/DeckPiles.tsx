"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Flame, Sparkles } from "lucide-react";
import React from "react";
import { Card } from "@/components/game/Card";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";

interface DeckPilesProps {
  onDraw: (source: "CLOSED" | "DISCARD") => void;
}

export const DeckPiles: React.FC<DeckPilesProps> = ({ onDraw }) => {
  const user = useAuthStore((s) => s.user);
  const gameState = useGameStore((s) => s.gameState);

  if (!gameState) return null;

  const isPlaying = gameState.status === "PLAYING";
  const isMyTurn = isPlaying && gameState.currentTurnPlayerId === user?.id;
  const isDrawPhase = isMyTurn && gameState.turnPhase === "DRAW";

  return (
    <div className="flex flex-col mobile-landscape:flex-row items-center justify-center gap-1.5 sm:gap-2 mobile-landscape:gap-3 max-w-full">
      {/* Central Interactive Card Piles */}
      <div className="flex items-center justify-center gap-7 sm:gap-12 mobile-landscape:gap-5 relative pl-9 pr-5 sm:pl-12 sm:pr-7 mobile-landscape:pl-7 mobile-landscape:pr-3 py-2 sm:py-2.5 mobile-landscape:py-1 rounded-2xl mobile-landscape:rounded-xl bg-black/20 backdrop-blur-sm border border-emerald-500/20 shadow-inner shrink-0">
        {/* CLOSED DECK + WILD JOKER UNDERNEATH */}
        <div className="relative flex flex-col items-center group">
          {/* Wild Joker cut card (placed horizontally under closed deck) */}
          {gameState.wildJoker && (
            <div className="absolute -left-6 sm:-left-8 mobile-landscape:-left-5 top-1.5 mobile-landscape:top-0.5 rotate-90 z-0 opacity-90 transition-transform group-hover:-translate-x-0.5 pointer-events-none">
              <Card card={gameState.wildJoker} size="deck" disabled />
            </div>
          )}

          {/* Closed draw pile stack */}
          <motion.div
            whileHover={isDrawPhase ? { scale: 1.04 } : undefined}
            whileTap={isDrawPhase ? { scale: 0.94 } : undefined}
            onClick={() => isDrawPhase && onDraw("CLOSED")}
            className={`relative z-10 ${
              isDrawPhase
                ? "cursor-pointer ring-2 sm:ring-4 mobile-landscape:ring-2 ring-amber-400 ring-offset-2 mobile-landscape:ring-offset-1 ring-offset-emerald-950 rounded-lg"
                : "cursor-default"
            }`}
          >
            <Card faceDown size="deck" />
            {/* Cards remaining count pill */}
            <div className="absolute -bottom-2 mobile-landscape:-bottom-1.5 left-1/2 -translate-x-1/2 bg-zinc-950/90 text-amber-300 border border-amber-500/40 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-lg whitespace-nowrap leading-none">
              {gameState.closedDeckCount} left
            </div>
          </motion.div>

          <span className="text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-semibold text-emerald-200/80 mt-3 mobile-landscape:mt-2 tracking-wide uppercase leading-none">
            Closed Deck
          </span>
        </div>

        {/* OPEN DISCARD PILE */}
        <div className="flex flex-col items-center group">
          <motion.div
            whileHover={isDrawPhase && gameState.topDiscardCard ? { scale: 1.04 } : undefined}
            whileTap={isDrawPhase && gameState.topDiscardCard ? { scale: 0.94 } : undefined}
            onClick={() => isDrawPhase && gameState.topDiscardCard && onDraw("DISCARD")}
            className={`relative z-10 ${
              isDrawPhase && gameState.topDiscardCard
                ? "cursor-pointer ring-2 sm:ring-4 mobile-landscape:ring-2 ring-emerald-400 ring-offset-2 mobile-landscape:ring-offset-1 ring-offset-emerald-950 rounded-lg"
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
                  <Card card={gameState.topDiscardCard} size="deck" />
                </motion.div>
              ) : (
                <motion.div
                  key="empty-discard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-16 h-24 sm:w-20 sm:h-28 [@media(min-height:820px)]:sm:w-24 [@media(min-height:820px)]:sm:h-32 mobile-landscape:w-14 mobile-landscape:h-20 rounded-lg border-2 border-dashed border-zinc-600/60 flex items-center justify-center text-zinc-500 text-[10px] mobile-landscape:text-[9px] text-center px-1"
                >
                  Discard Pile
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <span className="text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-semibold text-emerald-200/80 mt-3 mobile-landscape:mt-2 tracking-wide uppercase leading-none">
            Discard Pile
          </span>
        </div>
      </div>

      {/* Wild Joker + Turn Status Pills (below piles on desktop; neatly beside piles in mobile landscape) */}
      <div className="flex flex-wrap mobile-landscape:flex-col items-center mobile-landscape:items-start justify-center gap-1.5 sm:gap-2 mobile-landscape:gap-1 px-1">
        {gameState.wildJoker && (
          <div className="flex items-center gap-1 px-2.5 py-0.5 sm:py-1 mobile-landscape:h-6 mobile-landscape:py-0 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] sm:text-xs mobile-landscape:text-[10px] font-medium whitespace-nowrap">
            <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
            <span>
              Wild:{" "}
              <strong className="text-amber-200 font-bold">
                {gameState.wildJoker.isPrintedJoker ||
                gameState.wildJoker.rank === "PRINTED_JOKER"
                  ? "Ace (A)"
                  : gameState.wildJoker.rank}
              </strong>
            </span>
          </div>
        )}

        {isMyTurn && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 px-3 py-0.5 sm:py-1 mobile-landscape:h-6 mobile-landscape:py-0 mobile-landscape:px-2.5 rounded-full bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border border-amber-400 text-amber-200 text-[11px] sm:text-xs mobile-landscape:text-[10px] font-bold shadow whitespace-nowrap"
          >
            {isDrawPhase ? (
              <>
                <ArrowDown className="w-3.5 h-3.5 mobile-landscape:w-3 mobile-landscape:h-3 text-amber-400 shrink-0" />
                <span>YOUR TURN: Draw Card</span>
              </>
            ) : (
              <>
                <Flame className="w-3.5 h-3.5 mobile-landscape:w-3 mobile-landscape:h-3 text-amber-400 shrink-0" />
                <span>YOUR TURN: Discard 1 Card</span>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
