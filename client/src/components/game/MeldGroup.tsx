"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ungroup } from "lucide-react";
import React from "react";
import {
  parseDragDataTransfer,
  RUMMY_DRAG_MIME,
  serializeDragItem,
  TableDragItem,
  TableDropZone,
} from "@/components/game/dragTypes";
import { ClientEvaluator } from "../../lib/clientEvaluator";
import { Card as CardType } from "../../types";
import { Card } from "./Card";

interface MeldGroupProps {
  cards: CardType[];
  groupIndex: number;
  selectedCardIds: string[];
  activeDrag: TableDragItem | null;
  hoveredZone: TableDropZone | null;
  isDealingHand?: boolean;
  dealBatchKey?: number;
  dealIndexOffset?: number;
  onCardClick: (cardId: string) => void;
  onUngroup?: () => void;
  onStartDrag: (item: TableDragItem) => void;
  onEndDrag: () => void;
  onHoverZone: (zone: TableDropZone | null) => void;
  onDropOnZone: (item: TableDragItem, zone: TableDropZone) => void;
  onTouchDragStart: (e: React.TouchEvent, item: TableDragItem) => void;
}

export const MeldGroupView: React.FC<MeldGroupProps> = ({
  cards,
  groupIndex,
  selectedCardIds,
  activeDrag,
  hoveredZone,
  isDealingHand = false,
  dealBatchKey = 0,
  dealIndexOffset = 0,
  onCardClick,
  onUngroup,
  onStartDrag,
  onEndDrag,
  onHoverZone,
  onDropOnZone,
  onTouchDragStart,
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

  const isDrawDrag =
    activeDrag?.kind === "DRAW_CLOSED" || activeDrag?.kind === "DRAW_OPEN";
  const draggingCardId =
    activeDrag?.kind === "HAND_CARD" ? activeDrag.cardId : null;

  const isGroupHovered =
    activeDrag !== null &&
    hoveredZone?.zone === "meld-group" &&
    hoveredZone.groupIndex === groupIndex;

  const handleGroupDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = isDrawDrag ? "copy" : "move";
    onHoverZone({ zone: "meld-group", groupIndex });
  };

  const handleGroupDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const item = parseDragDataTransfer(e.dataTransfer, activeDrag);
    if (item) {
      onDropOnZone(item, { zone: "meld-group", groupIndex });
    }
    onEndDrag();
  };

  return (
    <motion.div
      layout={!isDealingHand}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
      data-drop-zone="meld-group"
      data-group-index={groupIndex}
      onDragOver={handleGroupDragOver}
      onDrop={handleGroupDrop}
      className={`flex flex-col items-center px-1.5 py-1 mobile-landscape:px-1 mobile-landscape:py-0.5 rounded-xl mobile-landscape:rounded-lg border transition-all shrink-0 ${
        isGroupHovered
          ? isDrawDrag
            ? "bg-emerald-900/55 border-emerald-300 ring-2 ring-emerald-400/60 shadow-[0_0_16px_rgba(52,211,153,0.35)]"
            : "bg-emerald-900/50 border-[#f6e09e] ring-2 ring-[#f6e09e]/60"
          : isDrawDrag
          ? "bg-slate-900/60 border-emerald-400/35"
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
              hoveredZone?.zone === "meld-group" &&
              hoveredZone.groupIndex === groupIndex &&
              hoveredZone.cardIndex === cardIdx;

            const cardKey = `${dealBatchKey}-${card.id}`;
            const staggerDelay = isDealingHand
              ? Math.min((dealIndexOffset + cardIdx) * 0.045, 0.65)
              : undefined;

            return (
              <div
                key={cardKey}
                draggable
                data-card-id={card.id}
                data-drop-zone="meld-group"
                data-group-index={groupIndex}
                data-card-index={cardIdx}
                onDragStart={(e) => {
                  const dragItem: TableDragItem = {
                    kind: "HAND_CARD",
                    cardId: card.id,
                    card,
                  };
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(
                    RUMMY_DRAG_MIME,
                    serializeDragItem(dragItem)
                  );
                  e.dataTransfer.setData("text/plain", card.id);
                  onStartDrag(dragItem);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = isDrawDrag ? "copy" : "move";
                  onHoverZone({
                    zone: "meld-group",
                    groupIndex,
                    cardIndex: isDrawDrag ? undefined : cardIdx,
                  });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const item = parseDragDataTransfer(
                    e.dataTransfer,
                    activeDrag
                  );
                  if (item) {
                    onDropOnZone(item, {
                      zone: "meld-group",
                      groupIndex,
                      cardIndex: item.kind === "HAND_CARD" ? cardIdx : undefined,
                    });
                  }
                  onEndDrag();
                }}
                onDragEnd={onEndDrag}
                onTouchStart={(e) =>
                  onTouchDragStart(e, {
                    kind: "HAND_CARD",
                    cardId: card.id,
                    card,
                  })
                }
                className={`relative z-10 hover:z-30 transition-all touch-pan-x ${
                  cardIdx > 0
                    ? "-ml-4 sm:-ml-5 xl:-ml-6 mobile-landscape:-ml-3.5"
                    : ""
                } ${
                  isCardDropTarget
                    ? "pl-2.5 border-l-2 border-[#f6e09e]"
                    : ""
                }`}
              >
                <Card
                  card={card}
                  size="hand"
                  isSelected={selectedCardIds.includes(card.id)}
                  isDragging={isBeingDragged}
                  dealDelay={staggerDelay}
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
