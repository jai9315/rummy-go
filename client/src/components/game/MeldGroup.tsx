"use client";

import React from "react";
import { ClientEvaluator } from "../../lib/clientEvaluator";
import { Card as CardType } from "../../types";
import { Card } from "./Card";

interface MeldGroupProps {
  cards: CardType[];
  groupIndex: number;
  selectedCardIds: string[];
  onCardClick: (cardId: string) => void;
  onUngroup?: () => void;
}

export const MeldGroupView: React.FC<MeldGroupProps> = ({
  cards,
  groupIndex,
  selectedCardIds,
  onCardClick,
  onUngroup,
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

  return (
    <div className="flex flex-col items-center p-2 rounded-xl bg-zinc-900/60 backdrop-blur-sm border border-zinc-700/50 shadow-lg transition-all">
      {/* Group Status Pill */}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full border shadow-sm ${badgeConfig.color}`}
        >
          {badgeConfig.label}
        </span>
      </div>

      {/* Cards in this meld with overlapping fan layout */}
      <div className="flex items-center -space-x-8 sm:-space-x-10 hover:space-x-1 transition-all duration-300 px-2 py-1">
        {cards.map((card) => (
          <div key={card.id} className="relative z-10 hover:z-30 transition-transform">
            <Card
              card={card}
              isSelected={selectedCardIds.includes(card.id)}
              onClick={() => onCardClick(card.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
