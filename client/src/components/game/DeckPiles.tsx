"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Award, Crown, Lock, Sparkles } from "lucide-react";
import React, { useState } from "react";
import { Card } from "@/components/game/Card";
import {
  parseDragDataTransfer,
  RUMMY_DRAG_MIME,
  serializeDragItem,
  TableDragItem,
  TableDropZone,
} from "@/components/game/dragTypes";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { Suit } from "@/types";

interface DeckPilesProps {
  isShuffling: boolean;
  shuffleLabel: string;
  shuffleNonce: number;
  activeDrag: TableDragItem | null;
  hoveredZone: TableDropZone | null;
  shouldSuppressClick: () => boolean;
  onDraw: (source: "CLOSED" | "DISCARD") => void;
  onOpenDeclare: () => void;
  onStartDrag: (item: TableDragItem) => void;
  onEndDrag: () => void;
  onHoverZone: (zone: TableDropZone | null) => void;
  onDropOnZone: (item: TableDragItem, zone: TableDropZone) => void;
  onTouchDragStart: (e: React.TouchEvent, item: TableDragItem) => void;
}

const SUIT_GLYPH: Record<Suit, { symbol: string; color: string }> = {
  SPADES: { symbol: "♠", color: "text-slate-200" },
  CLUBS: { symbol: "♣", color: "text-slate-200" },
  HEARTS: { symbol: "♥", color: "text-red-400" },
  DIAMONDS: { symbol: "♦", color: "text-red-400" },
  JOKER: { symbol: "★", color: "text-amber-300" },
};

const RIFFLE_CARDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Crisp Framer Motion Riffle Shuffle animation (~1.05s):
 * Splits 10 ornate .card-back cards into left & right halves, rapidly
 * interleaves them back together with staggered arch motion, and squares up
 * with a golden shimmer ring.
 */
const RiffleShuffleOverlay: React.FC<{
  label: string;
  shuffleNonce: number;
}> = ({ label, shuffleNonce }) => {
  return (
    <motion.div
      key={`shuffle-${shuffleNonce}`}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.16 }}
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/30 backdrop-blur-[1.5px] rounded-[inherit]"
    >
      <div className="relative w-44 h-28 sm:w-56 sm:h-32 mobile-landscape:w-36 mobile-landscape:h-20 flex items-center justify-center">
        {/* Golden aura pulse on final square-up */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 0.25, 0.75, 0], scale: [0.7, 1.08, 1.18, 1.3] }}
          transition={{ duration: 1.05, times: [0, 0.35, 0.78, 1] }}
          className="absolute w-20 h-28 sm:w-24 sm:h-32 mobile-landscape:w-14 mobile-landscape:h-20 rounded-xl border-2 border-[#f6e09e] shadow-[0_0_28px_rgba(246,224,158,0.65)]"
        />

        {RIFFLE_CARDS.map((idx) => {
          const isLeftHalf = idx % 2 === 0;
          const halfIndex = Math.floor(idx / 2); // 0..4 within each half
          const splitX = isLeftHalf ? -46 - halfIndex * 1.5 : 46 + halfIndex * 1.5;
          const splitRot = isLeftHalf ? -10 - halfIndex : 10 + halfIndex;
          const archY = -14 - halfIndex * 2;
          const interleaveDelay = idx * 0.032;

          return (
            <motion.div
              key={idx}
              style={{ zIndex: 10 + idx }}
              initial={{ x: 0, y: -halfIndex * 1.2, rotate: 0, scale: 1 }}
              animate={{
                x: [0, splitX, splitX * 0.65, 0, 0],
                y: [
                  -halfIndex * 1.2,
                  -halfIndex * 1.5,
                  archY,
                  -idx * 0.6,
                  -idx * 0.4,
                ],
                rotate: [0, splitRot, splitRot * 0.35, 0, 0],
                scale: [1, 0.98, 1.04, 1, 1],
              }}
              transition={{
                duration: 0.78,
                delay: interleaveDelay,
                times: [0, 0.28, 0.56, 0.84, 1],
                ease: [0.22, 1, 0.36, 1],
              }}
              className="card-back absolute w-14 h-20 sm:w-[68px] sm:h-[98px] mobile-landscape:w-12 mobile-landscape:h-[68px] rounded-lg flex items-center justify-center shadow-xl"
            >
              <span className="text-amber-300/90 text-xs sm:text-sm leading-none">
                ★
              </span>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-1 glass-pill px-3 py-1 rounded-full border border-[#f6e09e]/50 text-[#f6e09e] text-[10px] sm:text-xs mobile-landscape:text-[9px] font-bold tracking-wide shadow-lg"
      >
        {label}
      </motion.div>
    </motion.div>
  );
};

export const DeckPiles: React.FC<DeckPilesProps> = ({
  isShuffling,
  shuffleLabel,
  shuffleNonce,
  activeDrag,
  hoveredZone,
  shouldSuppressClick,
  onDraw,
  onOpenDeclare,
  onStartDrag,
  onEndDrag,
  onHoverZone,
  onDropOnZone,
  onTouchDragStart,
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

  // Part 1 Item 6: Block picking Printed Joker or Wildcard Joker from the Open Discard Pile
  const topDiscard = gameState.topDiscardCard;
  const isTopDiscardJoker = Boolean(
    topDiscard &&
      (topDiscard.isPrintedJoker ||
        topDiscard.rank === "PRINTED_JOKER" ||
        topDiscard.isWildJoker ||
        (gameState.wildRank && topDiscard.rank === gameState.wildRank))
  );
  const canDrawFromOpen = Boolean(isDrawPhase && topDiscard && !isTopDiscardJoker);

  const isDraggingHandCard = activeDrag?.kind === "HAND_CARD";
  const isDiscardZoneActive = isDraggingHandCard && isDiscardPhase;
  const isDiscardZoneHovered =
    isDraggingHandCard && hoveredZone?.zone === "discard-pile";
  const isDeclareZoneHovered =
    isDraggingHandCard && hoveredZone?.zone === "declare-slot";

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
  if (
    isTossPhase &&
    gameState.tossResults &&
    gameState.tossResults.length > 0
  ) {
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
    <div className="relative flex flex-col items-center justify-center gap-2 sm:gap-2.5 mobile-landscape:gap-1 z-20 max-w-full w-full h-full">
      {/* Riffle Shuffle Overlay (plays after TOSS, on NEXT_ROUND, & on discard-pile reshuffle) */}
      <AnimatePresence>
        {isShuffling && (
          <RiffleShuffleOverlay
            label={shuffleLabel}
            shuffleNonce={shuffleNonce}
          />
        )}
      </AnimatePresence>

      {/* Top Center Glass Table Info Pill */}
      <div className="glass-pill px-3 py-1 mobile-landscape:px-2.5 mobile-landscape:py-0.5 rounded-full flex items-center gap-2 text-[10px] sm:text-[11px] mobile-landscape:text-[9px] text-slate-200 font-medium shadow">
        <span className="font-semibold text-amber-200">
          Pool {gameState.targetPoints ?? 101} Rummy
        </span>
        <span className="text-white/25">•</span>
        <span>Round {gameState.roundNumber}</span>
        {gameState.deckCount && (
          <>
            <span className="text-white/25 hidden sm:inline">•</span>
            <span className="hidden sm:inline text-emerald-200/90">
              {gameState.deckCount === 1 ? "1 Deck" : `${gameState.deckCount} Decks`}
            </span>
          </>
        )}
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
        {/* COLUMN 1: CLOSED DECK (Click OR Drag to Hand Tray in DRAW phase) */}
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

            <div
              draggable={isDrawPhase}
              onDragStart={(e) => {
                if (!isDrawPhase) {
                  e.preventDefault();
                  return;
                }
                const dragItem: TableDragItem = { kind: "DRAW_CLOSED" };
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData(
                  RUMMY_DRAG_MIME,
                  serializeDragItem(dragItem)
                );
                e.dataTransfer.setData("text/plain", "DRAW_CLOSED");
                onStartDrag(dragItem);
              }}
              onDragEnd={onEndDrag}
              onTouchStart={(e) => {
                if (isDrawPhase) {
                  onTouchDragStart(e, { kind: "DRAW_CLOSED" });
                }
              }}
              onClick={() => {
                if (shouldSuppressClick()) return;
                if (isDrawPhase) onDraw("CLOSED");
              }}
              className={`relative rounded-lg transition-transform ${
                isDrawPhase
                  ? "cursor-grab active:cursor-grabbing touch-none draw-highlight ring-2 ring-[#f6e09e] hover:scale-105"
                  : "cursor-default"
              } ${
                activeDrag?.kind === "DRAW_CLOSED"
                  ? "opacity-60 scale-95"
                  : ""
              }`}
              title={
                isDrawPhase
                  ? "Click or drag down to your hand to draw from Closed Deck"
                  : "Closed Deck"
              }
            >
              <Card faceDown size="deck" disabled={!isDrawPhase} />
              {/* Remaining Deck Count Badge */}
              <div className="absolute -top-2 -right-2 bg-slate-950/95 text-[#f6e09e] border border-[#d4af37]/60 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-lg leading-none pointer-events-none">
                {gameState.closedDeckCount}
              </div>
            </div>
          </div>

          <span className="mt-1.5 mobile-landscape:mt-1 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold uppercase tracking-wider text-emerald-100/80 leading-none">
            Closed Deck
          </span>
        </div>

        {/* COLUMN 2: OPEN DISCARD PILE (Click/Drag to Draw in DRAW phase; Drop Hand Card to Discard in DISCARD phase) */}
        <div
          data-drop-zone="discard-pile"
          onMouseEnter={() => setShowRecentTooltip(true)}
          onMouseLeave={() => setShowRecentTooltip(false)}
          onDragOver={(e) => {
            if (!isDraggingHandCard) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = isDiscardPhase ? "move" : "none";
            onHoverZone({ zone: "discard-pile" });
          }}
          onDragLeave={(e) => {
            if (
              hoveredZone?.zone === "discard-pile" &&
              !e.currentTarget.contains(e.relatedTarget as Node | null)
            ) {
              onHoverZone(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const item = parseDragDataTransfer(e.dataTransfer, activeDrag);
            if (item && item.kind === "HAND_CARD") {
              onDropOnZone(item, { zone: "discard-pile" });
            }
            onEndDrag();
          }}
          className={`relative flex flex-col items-center rounded-xl p-1 -m-1 transition-all ${
            isDiscardZoneHovered && isDiscardPhase
              ? "scale-105"
              : ""
          }`}
        >
          {/* Floating "Drop to Discard" Hint when dragging a hand card over Open Pile */}
          {isDiscardZoneActive && (
            <div
              className={`pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-40 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider whitespace-nowrap shadow-lg transition-all ${
                isDiscardZoneHovered
                  ? "bg-amber-400 text-slate-950 scale-110"
                  : "bg-amber-500/85 text-slate-950/90 opacity-90"
              }`}
            >
              Drop to Discard
            </div>
          )}

          {/* Hover Tooltip: Last 5 Discarded Cards (hidden while actively dragging) */}
          {showRecentTooltip &&
            !activeDrag &&
            recentDiscards.length > 0 && (
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

          <div
            draggable={canDrawFromOpen}
            onDragStart={(e) => {
              if (!canDrawFromOpen || !gameState.topDiscardCard) {
                e.preventDefault();
                return;
              }
              const dragItem: TableDragItem = {
                kind: "DRAW_OPEN",
                card: gameState.topDiscardCard,
              };
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData(
                RUMMY_DRAG_MIME,
                serializeDragItem(dragItem)
              );
              e.dataTransfer.setData("text/plain", "DRAW_OPEN");
              onStartDrag(dragItem);
            }}
            onDragEnd={onEndDrag}
            onTouchStart={(e) => {
              if (canDrawFromOpen && gameState.topDiscardCard) {
                onTouchDragStart(e, {
                  kind: "DRAW_OPEN",
                  card: gameState.topDiscardCard,
                });
              }
            }}
            onClick={() => {
              if (shouldSuppressClick()) return;
              if (canDrawFromOpen) {
                onDraw("DISCARD");
              }
            }}
            className={`relative z-10 rounded-lg transition-all ${
              isDiscardZoneHovered && isDiscardPhase
                ? "ring-4 ring-amber-400 shadow-[0_0_28px_rgba(251,191,36,0.75)]"
                : isDiscardZoneActive
                ? "ring-2 ring-amber-400/75 shadow-[0_0_18px_rgba(251,191,36,0.4)]"
                : canDrawFromOpen
                ? "cursor-grab active:cursor-grabbing touch-none draw-highlight ring-2 ring-emerald-300 hover:scale-105"
                : isDrawPhase && isTopDiscardJoker
                ? "cursor-not-allowed ring-1 ring-amber-500/45 opacity-90"
                : "cursor-default"
            } ${
              activeDrag?.kind === "DRAW_OPEN" ? "opacity-60 scale-95" : ""
            }`}
            title={
              isDiscardPhase
                ? "Drag a card from your hand here to discard"
                : isTopDiscardJoker
                ? "Cannot pick a Joker from the Open Pile"
                : canDrawFromOpen
                ? "Click or drag down to your hand to draw from Open Pile"
                : "Open Discard Pile"
            }
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
                    disabled={!canDrawFromOpen && !isDiscardZoneActive}
                  />
                </motion.div>
              ) : (
                <div className="w-14 h-20 sm:w-[68px] sm:h-[98px] lg:w-[78px] lg:h-[112px] mobile-landscape:w-12 mobile-landscape:h-[68px] rounded-lg border-2 border-dashed border-white/20 bg-black/15 flex items-center justify-center text-slate-400 text-[9px] text-center px-1">
                  Open Pile
                </div>
              )}
            </AnimatePresence>

            {/* Subtle Lock Badge when top Open Pile card is a Joker */}
            {isTopDiscardJoker && !isDiscardZoneActive && (
              <div
                className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-950/95 border border-amber-400/65 text-amber-300 text-[7px] sm:text-[8px] font-black uppercase tracking-wider whitespace-nowrap shadow-lg"
                title="Cannot pick a Joker from the Open Pile"
              >
                <Lock className="w-2.5 h-2.5 shrink-0" />
                <span>Joker Locked</span>
              </div>
            )}

            {/* Discard Count Badge */}
            <div className="absolute -top-2 -right-2 bg-slate-950/95 text-emerald-300 border border-emerald-400/45 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-lg leading-none pointer-events-none">
              {gameState.discardPileCount}
            </div>
          </div>

          <span className="mt-1.5 mobile-landscape:mt-1 text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold uppercase tracking-wider text-emerald-100/80 leading-none">
            Open Pile
          </span>
        </div>

        {/* COLUMN 3: FINISH / DECLARE SLOT (Click OR Drop Hand Card to Declare in DISCARD phase) */}
        <div
          data-drop-zone="declare-slot"
          onDragOver={(e) => {
            if (!isDraggingHandCard) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = isDiscardPhase ? "move" : "none";
            onHoverZone({ zone: "declare-slot" });
          }}
          onDragLeave={(e) => {
            if (
              hoveredZone?.zone === "declare-slot" &&
              !e.currentTarget.contains(e.relatedTarget as Node | null)
            ) {
              onHoverZone(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const item = parseDragDataTransfer(e.dataTransfer, activeDrag);
            if (item && item.kind === "HAND_CARD") {
              onDropOnZone(item, { zone: "declare-slot" });
            }
            onEndDrag();
          }}
          className="relative flex flex-col items-center"
        >
          {/* Floating "Drop to Declare" Hint when dragging a hand card over Declare Slot */}
          {isDraggingHandCard && isDiscardPhase && (
            <div
              className={`pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 z-40 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider whitespace-nowrap shadow-lg transition-all ${
                isDeclareZoneHovered
                  ? "bg-emerald-400 text-slate-950 scale-110"
                  : "bg-emerald-500/85 text-slate-950/90 opacity-90"
              }`}
            >
              Drop to Declare
            </div>
          )}

          <button
            type="button"
            onClick={() => isDiscardPhase && onOpenDeclare()}
            disabled={!isDiscardPhase && !isDraggingHandCard}
            className={`w-14 h-20 sm:w-[68px] sm:h-[98px] lg:w-[78px] lg:h-[112px] mobile-landscape:w-12 mobile-landscape:h-[68px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 px-1 text-center transition-all ${
              isDeclareZoneHovered && isDiscardPhase
                ? "border-emerald-300 bg-emerald-500/30 text-emerald-100 scale-105 ring-4 ring-emerald-400/80 shadow-[0_0_28px_rgba(52,211,153,0.7)]"
                : isDraggingHandCard && isDiscardPhase
                ? "border-emerald-400/80 bg-emerald-500/15 text-emerald-200 ring-2 ring-emerald-400/50 shadow-[0_0_16px_rgba(52,211,153,0.35)]"
                : isDeclareZoneHovered && !isDiscardPhase
                ? "border-red-400/80 bg-red-500/15 text-red-200"
                : isDiscardPhase
                ? "border-[#f6e09e] bg-amber-500/15 hover:bg-amber-500/25 text-[#f6e09e] cursor-pointer shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:scale-105"
                : "border-[#d4af37]/35 bg-black/15 text-[#d4af37]/55 cursor-not-allowed"
            }`}
            title={
              isDiscardPhase
                ? "Click or drag your finish card here to declare"
                : "Available after drawing a card on your turn"
            }
          >
            <Award className="w-4 h-4 sm:w-5 sm:h-5 mobile-landscape:w-3.5 mobile-landscape:h-3.5 shrink-0" />
            <span className="text-[8px] sm:text-[9px] mobile-landscape:text-[7px] font-extrabold uppercase tracking-wider leading-tight">
              {isDeclareZoneHovered && isDiscardPhase
                ? "Drop Finish"
                : "Finish Slot"}
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
          <span>Your Turn — Click or Drag from Closed Deck / Open Pile</span>
        ) : isDiscardPhase ? (
          <span>
            Your Turn — Drag a card to Open Pile to Discard or Finish Slot to
            Declare
          </span>
        ) : activePlayer ? (
          <span>
            <strong className="text-white">{activePlayer.username}</strong> is
            playing (
            {gameState.turnPhase === "DRAW" ? "Drawing" : "Discarding"})...
          </span>
        ) : (
          <span>Table Ready</span>
        )}
      </div>
    </div>
  );
};
