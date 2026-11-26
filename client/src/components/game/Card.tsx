"use client";

import React from "react";
import { Card as CardType, Suit } from "../../types";

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  HEARTS: "♥",
  DIAMONDS: "♦",
  CLUBS: "♣",
  SPADES: "♠",
  JOKER: "★",
};

const SUIT_COLORS: Record<Suit, string> = {
  HEARTS: "text-red-600",
  DIAMONDS: "text-red-500",
  CLUBS: "text-zinc-900",
  SPADES: "text-zinc-950",
  JOKER: "text-amber-500",
};

export const Card: React.FC<CardProps> = ({
  card,
  faceDown = false,
  isSelected = false,
  onClick,
  size = "md",
  className = "",
  disabled = false,
}) => {
  const sizeClasses = {
    sm: "w-12 h-16 text-xs",
    md: "w-16 h-24 sm:w-20 sm:h-28 text-sm",
    lg: "w-20 h-28 sm:w-24 sm:h-36 text-base",
  }[size];

  // Card Back Representation (for faceDown or opponents' cards)
  if (faceDown || !card) {
    return (
      <div
        onClick={!disabled ? onClick : undefined}
        className={`${sizeClasses} ${className} relative rounded-lg border-2 border-amber-600/40 bg-gradient-to-br from-red-900 via-red-950 to-zinc-950 shadow-md flex items-center justify-center cursor-pointer select-none overflow-hidden transition-transform duration-200 hover:-translate-y-1`}
      >
        <div className="absolute inset-1 rounded border border-amber-400/30 flex items-center justify-center bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:8px_8px]">
          <span className="text-amber-400/80 font-bold text-xs tracking-wider">RUMMY</span>
        </div>
      </div>
    );
  }

  const isRed = card.suit === "HEARTS" || card.suit === "DIAMONDS";
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`
        ${sizeClasses}
        ${className}
        relative rounded-lg bg-gradient-to-b from-white to-zinc-100 shadow-lg select-none cursor-pointer
        border transition-all duration-200
        ${isSelected ? "border-amber-400 ring-4 ring-amber-400/60 -translate-y-3 z-20 shadow-amber-500/20 shadow-xl" : "border-zinc-300 hover:-translate-y-1.5 hover:shadow-xl"}
        ${disabled ? "opacity-60 cursor-not-allowed" : ""}
        overflow-hidden flex flex-col justify-between p-1 sm:p-1.5
      `}
    >
      {/* Top Left Rank & Suit */}
      <div className={`flex flex-col items-center leading-none ${suitColor} font-bold`}>
        <span>{card.isPrintedJoker ? "JKR" : card.rank}</span>
        <span className="text-base sm:text-lg leading-none">{suitSymbol}</span>
      </div>

      {/* Center Large Graphic / Pip */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {card.isPrintedJoker ? (
          <div className="text-center">
            <span className="text-2xl sm:text-3xl text-amber-500">🎭</span>
            <div className="text-[9px] font-extrabold text-amber-600 tracking-wider">JOKER</div>
          </div>
        ) : (
          <span className={`text-2xl sm:text-3xl opacity-20 ${suitColor}`}>{suitSymbol}</span>
        )}
      </div>

      {/* Wild Joker Badge Overlay */}
      {card.isWildJoker && !card.isPrintedJoker && (
        <div className="absolute top-0 right-0 bg-amber-500 text-zinc-950 text-[9px] font-black px-1 rounded-bl shadow">
          ★ JOKER
        </div>
      )}

      {/* Bottom Right Inverted Rank & Suit */}
      <div className={`flex flex-col items-center leading-none ${suitColor} font-bold rotate-180 self-end`}>
        <span>{card.isPrintedJoker ? "JKR" : card.rank}</span>
        <span className="text-base sm:text-lg leading-none">{suitSymbol}</span>
      </div>
    </div>
  );
};
