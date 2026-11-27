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
    <div className="flex flex-col items-center justify-center gap-3">
      {/* Central Interactive Card Piles */}
      <div className="flex items-center justify-center gap-8 sm:gap-14 relative p-4 rounded-3xl bg-black/20 backdrop-blur-sm border border-emerald-500/20 shadow-inner">
        {/* CLOSED DECK + WILD JOKER UNDERNEATH */}
        <div className="relative flex flex-col items-center group">
          {/* Wild Joker cut card (placed horizontally under closed deck) */}
          {gameState.wildJoker && (
            <div className="absolute -left-8 sm:-left-10 top-2 rotate-90 z-0 opacity-90 transition-transform group-hover:-translate-x-1">
              <Card card={gameState.wildJoker} size="md" />
            </div>
          )}

          {/* Closed draw pile stack */}
          <motion.div
            whileHover={isDrawPhase ? { scale: 1.05 } : undefined}
            whileTap={isDrawPhase ? { scale: 0.94 } : undefined}
            onClick={() => isDrawPhase && onDraw("CLOSED")}
            className={`relative z-10 ${
              isDrawPhase
                ? "cursor-pointer ring-4 ring-amber-400 ring-offset-2 ring-offset-emerald-950 rounded-lg animate-bounce"
                : "cursor-default"
            }`}
          >
            <Card faceDown size="md" />
            {/* Cards remaining count pill */}
            <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-zinc-950/90 text-amber-300 border border-amber-500/40 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
              {gameState.closedDeckCount} left
            </div>
          </motion.div>

          <span className="text-[11px] font-semibold text-emerald-200/80 mt-4 tracking-wide uppercase">
            Closed Deck
          </span>
        </div>

        {/* OPEN DISCARD PILE */}
        <div className="flex flex-col items-center group">
          <motion.div
            whileHover={isDrawPhase && gameState.topDiscardCard ? { scale: 1.05 } : undefined}
            whileTap={isDrawPhase && gameState.topDiscardCard ? { scale: 0.94 } : undefined}
            onClick={() => isDrawPhase && gameState.topDiscardCard && onDraw("DISCARD")}
            className={`relative z-10 ${
              isDrawPhase && gameState.topDiscardCard
                ? "cursor-pointer ring-4 ring-emerald-400 ring-offset-2 ring-offset-emerald-950 rounded-lg"
                : "cursor-default"
            }`}
          >
            <AnimatePresence mode="wait">
              {gameState.topDiscardCard ? (
                <motion.div
                  key={gameState.topDiscardCard.id}
                  initial={{ opacity: 0, y: -16, rotate: -6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                >
                  <Card card={gameState.topDiscardCard} size="md" />
                </motion.div>
              ) : (
                <motion.div
                  key="empty-discard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-zinc-600/60 flex items-center justify-center text-zinc-500 text-xs"
                >
                  Discard Pile
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <span className="text-[11px] font-semibold text-emerald-200/80 mt-2 tracking-wide uppercase">
            Discard Pile
          </span>
        </div>
      </div>

      {/* Wild Joker Explanatory Pill */}
      {gameState.wildJoker && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>
            Wild Joker:{" "}
            <strong className="text-amber-200 font-bold">
              {gameState.wildJoker.isPrintedJoker ||
              gameState.wildJoker.rank === "PRINTED_JOKER"
                ? "Ace (A)"
                : gameState.wildJoker.rank}
            </strong>{" "}
            of any suit
          </span>
        </div>
      )}

      {/* Turn Action Guidance Banner */}
      {isMyTurn && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border border-amber-400 text-amber-200 text-xs font-bold animate-pulse shadow-lg"
        >
          {isDrawPhase ? (
            <>
              <ArrowDown className="w-4 h-4 text-amber-400" />
              <span>YOUR TURN: Click the Closed Deck or Open Card to Draw</span>
            </>
          ) : (
            <>
              <Flame className="w-4 h-4 text-amber-400" />
              <span>YOUR TURN: Select 1 card in your hand and click Discard</span>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
};
