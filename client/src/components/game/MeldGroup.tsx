"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ungroup } from "lucide-react";
import React from "react";
import { ClientEvaluator } from "../../lib/clientEvaluator";
import { Card as CardType } from "../../types";
import { Card } from "./Card";

export interface DropTargetInfo {
  groupIndex: number;
  cardIndex?: number;
}

interface MeldGroupProps {
  cards: CardType[];
  groupIndex: number;
  selectedCardIds: string[];
  draggingCardId: string | null;
  dropTarget: DropTargetInfo | null;
  onCardClick: (cardId: string) => void;
  onUngroup?: () => void;
  onDragStartCard: (cardId: string) => void;
  onDragEndCard: () => void;
  onHoverDropTarget: (target: DropTargetInfo | null) => void;
  onDropCard: (cardId: string, targetGroupIndex: number, targetCardIndex?: number) => void;
  onTouchStartCard: (e: React.TouchEvent, cardId: string) => void;
  onTouchMoveCard: (e: React.TouchEvent) => void;
  onTouchEndCard: () => void;
}

export const MeldGroupView: React.FC<MeldGroupProps> = ({
  cards,
  groupIndex,
  selectedCardIds,
  draggingCardId,
  dropTarget,
  onCardClick,
  onUngroup,
  onDragStartCard,
  onDragEndCard,
  onHoverDropTarget,
  onDropCard,
  onTouchStartCard,
  onTouchMoveCard,
  onTouchEndCard,
}) => {
  const meld = ClientEvaluator.evaluateMeld(cards);

  const badgeConfig = {
    PURE_SEQUENCE: {
      label: "Pure Sequence ✓",
      shortLabel: "Pure ✓",
      color: "bg-emerald-500/25 text-emerald-200 border-emerald-400/60",
    },
    IMPURE_SEQUENCE: {
      label: "Impure Sequence ✓",
      shortLabel: "Impure ✓",
      color: "bg-sky-500/25 text-sky-200 border-sky-400/60",
    },
    SET: {
      label: "Set ✓",
      shortLabel: "Set ✓",
      color: "bg-purple-500/25 text-purple-200 border-purple-400/60",
    },
    INVALID: {
      label: "Ungrouped",
      shortLabel: `${cards.length}c`,
      color: "bg-slate-800/80 text-slate-300 border-white/15",
    },
  }[meld.type];

  const isGroupTargeted =
    draggingCardId !== null && dropTarget?.groupIndex === groupIndex;

  const handleGroupDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (
      dropTarget?.groupIndex !== groupIndex ||
      dropTarget?.cardIndex !== undefined
    ) {
      onHoverDropTarget({ groupIndex });
    }
  };

  const handleGroupDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain") || draggingCardId;
    if (cardId) {
      onDropCard(cardId, groupIndex);
    }
    onDragEndCard();
  };

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
      data-group-index={groupIndex}
      onDragOver={handleGroupDragOver}
      onDrop={handleGroupDrop}
      className={`flex flex-col items-center px-1.5 py-1 mobile-landscape:px-1 mobile-landscape:py-0.5 rounded-xl mobile-landscape:rounded-lg border transition-colors shrink-0 ${
        isGroupTargeted
          ? "bg-emerald-900/50 border-[#f6e09e] ring-2 ring-[#f6e09e]/50"
          : "bg-slate-950/45 border-white/10"
      }`}
    >
      {/* Colored Meld Validation Pill & Optional Ungroup Button */}
      <div className="flex items-center gap-1 mb-0.5">
        <span
          className={`text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold px-2 py-0.5 mobile-landscape:px-1.5 rounded-full border leading-none whitespace-nowrap ${badgeConfig.color}`}
        >
          <span className="hidden sm:inline mobile-landscape:hidden">
            {badgeConfig.label}
          </span>
          <span className="sm:hidden mobile-landscape:inline">
            {badgeConfig.shortLabel}
          </span>
        </span>
        {onUngroup && (
          <button
            type="button"
            onClick={onUngroup}
            className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-amber-200 border border-white/10 text-[9px] font-semibold leading-none transition"
            title="Ungroup cards back to hand"
            aria-label={`Ungroup group ${groupIndex + 1}`}
          >
            <Ungroup className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* Cards with tight negative horizontal overlap & lift clearance */}
      <div className="flex items-end px-0.5 pt-2.5 pb-0.5 mobile-landscape:pt-2 mobile-landscape:pb-0">
        <AnimatePresence mode="popLayout">
          {cards.map((card, cardIdx) => {
            const isBeingDragged = draggingCardId === card.id;
            const isCardDropTarget =
              draggingCardId !== null &&
              draggingCardId !== card.id &&
              dropTarget?.groupIndex === groupIndex &&
              dropTarget?.cardIndex === cardIdx;

            return (
              <div
                key={card.id}
                draggable
                data-card-id={card.id}
                data-group-index={groupIndex}
                data-card-index={cardIdx}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", card.id);
                  onDragStartCard(card.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  if (
                    dropTarget?.groupIndex !== groupIndex ||
                    dropTarget?.cardIndex !== cardIdx
                  ) {
                    onHoverDropTarget({ groupIndex, cardIndex: cardIdx });
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const cardId =
                    e.dataTransfer.getData("text/plain") || draggingCardId;
                  if (cardId) {
                    onDropCard(cardId, groupIndex, cardIdx);
                  }
                  onDragEndCard();
                }}
                onDragEnd={onDragEndCard}
                onTouchStart={(e) => onTouchStartCard(e, card.id)}
                onTouchMove={onTouchMoveCard}
                onTouchEnd={onTouchEndCard}
                onTouchCancel={onTouchEndCard}
                className={`relative z-10 hover:z-30 transition-transform touch-pan-x ${
                  cardIdx > 0
                    ? "-ml-4 sm:-ml-5 xl:-ml-6 mobile-landscape:-ml-3.5"
                    : ""
                } ${isCardDropTarget ? "pl-2 border-l-2 border-[#f6e09e]" : ""}`}
              >
                <Card
                  card={card}
                  size="hand"
                  isSelected={selectedCardIds.includes(card.id)}
                  isDragging={isBeingDragged}
                  onClick={() => onCardClick(card.id)}
                />
              </div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
