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
      label: "Pure Seq ✓",
      color: "bg-emerald-600/90 text-white border-emerald-400",
    },
    IMPURE_SEQUENCE: {
      label: "Impure Seq ✓",
      color: "bg-blue-600/90 text-white border-blue-400",
    },
    SET: {
      label: "Set ✓",
      color: "bg-purple-600/90 text-white border-purple-400",
    },
    INVALID: {
      label: cards.length >= 3 ? "Invalid ✗" : `${cards.length} cards`,
      color: "bg-zinc-800/80 text-zinc-300 border-zinc-600",
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
      className={`flex flex-col items-center p-1.5 rounded-xl backdrop-blur-sm border shadow-lg transition-colors shrink-0 ${
        isGroupTargeted
          ? "bg-emerald-900/50 border-amber-400 ring-2 ring-amber-400/50"
          : "bg-zinc-900/70 border-zinc-700/60"
      }`}
    >
      {/* Group Status Pill & Optional Ungroup Button */}
      <div className="flex items-center gap-1 mb-1">
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-sm leading-none ${badgeConfig.color}`}
        >
          {badgeConfig.label}
        </span>
        {onUngroup && (
          <button
            type="button"
            onClick={onUngroup}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-amber-300 border border-zinc-600 text-[10px] font-semibold leading-none transition"
            title="Ungroup cards back to hand"
            aria-label={`Ungroup group ${groupIndex + 1}`}
          >
            <Ungroup className="w-2.5 h-2.5" />
            <span className="hidden sm:inline">Ungroup</span>
          </button>
        )}
      </div>

      {/* Cards in this meld: tight responsive negative overlap with top lift room */}
      <div className="flex items-end px-1 pt-2.5 pb-0.5">
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
                  const cardId = e.dataTransfer.getData("text/plain") || draggingCardId;
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
                  cardIdx > 0 ? "-ml-4 sm:-ml-5 xl:-ml-6" : ""
                } ${isCardDropTarget ? "pl-2 border-l-2 border-amber-400" : ""}`}
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
