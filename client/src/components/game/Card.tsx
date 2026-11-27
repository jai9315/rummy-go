"use client";

import { motion } from "framer-motion";
import React from "react";
import { Card as CardType, Suit } from "../../types";

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  onClick?: () => void;
  size?: "sm" | "hand" | "deck" | "md" | "lg";
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
  isDragging = false,
  onClick,
  size = "md",
  className = "",
  disabled = false,
}) => {
  const sizeClasses = {
    sm: "w-11 h-16 text-[11px] p-0.5 sm:p-1",
    hand: "w-11 h-16 sm:w-14 sm:h-20 xl:w-16 xl:h-24 mobile-landscape:w-11 mobile-landscape:h-16 text-[11px] sm:text-xs xl:text-sm mobile-landscape:text-[10px] p-0.5 sm:p-1 mobile-landscape:p-0.5",
    deck: "w-16 h-24 sm:w-20 sm:h-28 [@media(min-height:820px)]:sm:w-24 [@media(min-height:820px)]:sm:h-32 mobile-landscape:w-14 mobile-landscape:h-20 text-xs sm:text-sm mobile-landscape:text-[11px] p-1 sm:p-1.5 mobile-landscape:p-0.5",
    md: "w-14 h-20 sm:w-16 sm:h-24 text-xs sm:text-sm p-1",
    lg: "w-20 h-28 sm:w-24 sm:h-36 text-base p-1.5",
  }[size];

  const isCompact = size === "sm" || size === "hand";

  // Card Back Representation (for faceDown or opponents' cards)
  if (faceDown || !card) {
    return (
      <motion.div
        whileHover={!disabled ? { y: -3 } : undefined}
        whileTap={!disabled ? { scale: 0.96 } : undefined}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        onClick={!disabled ? onClick : undefined}
        className={`${sizeClasses} ${className} relative rounded-lg border-2 border-amber-600/40 bg-gradient-to-br from-red-900 via-red-950 to-zinc-950 shadow-md flex items-center justify-center cursor-pointer select-none overflow-hidden`}
      >
        <div className="absolute inset-1 rounded border border-amber-400/30 flex items-center justify-center bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:7px_7px]">
          <span className="text-amber-400/80 font-bold text-[10px] sm:text-xs tracking-wider">
            RUMMY
          </span>
        </div>
      </motion.div>
    );
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10, scale: 0.94 }}
      animate={{
        opacity: isDragging ? 0.55 : 1,
        y: isSelected ? -8 : 0,
        scale: isDragging ? 1.04 : 1,
      }}
      exit={{ opacity: 0, y: -12, scale: 0.9 }}
      whileHover={!disabled && !isSelected ? { y: -4 } : undefined}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      onClick={!disabled ? onClick : undefined}
      className={`
        ${sizeClasses}
        ${className}
        relative rounded-lg bg-gradient-to-b from-white to-zinc-100 shadow-lg select-none cursor-pointer
        border transition-shadow duration-200
        ${
          isSelected
            ? "border-amber-400 ring-2 sm:ring-4 ring-amber-400/60 z-20 shadow-amber-500/20 shadow-xl"
            : "border-zinc-300 hover:shadow-xl"
        }
        ${isDragging ? "ring-2 ring-emerald-400 border-emerald-400" : ""}
        ${disabled ? "opacity-60 cursor-not-allowed" : ""}
        overflow-hidden flex flex-col justify-between
      `}
    >
      {/* Top Left Rank & Suit */}
      <div className={`flex flex-col items-center leading-none ${suitColor} font-bold w-fit`}>
        <span>{card.isPrintedJoker ? "JKR" : card.rank}</span>
        <span
          className={`${
            isCompact ? "text-xs sm:text-sm xl:text-base" : "text-sm sm:text-lg"
          } leading-none`}
        >
          {suitSymbol}
        </span>
      </div>

      {/* Center Large Graphic / Pip */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {card.isPrintedJoker ? (
          <div className="text-center">
            <span
              className={`${
                isCompact ? "text-base sm:text-xl xl:text-2xl" : "text-xl sm:text-3xl"
              } text-amber-500`}
            >
              🎭
            </span>
            <div className="text-[7px] sm:text-[8px] font-extrabold text-amber-600 tracking-wider">
              JOKER
            </div>
          </div>
        ) : (
          <span
            className={`${
              isCompact ? "text-lg sm:text-xl xl:text-2xl" : "text-2xl sm:text-3xl"
            } opacity-20 ${suitColor}`}
          >
            {suitSymbol}
          </span>
        )}
      </div>

      {/* Wild Joker Badge Overlay */}
      {card.isWildJoker && !card.isPrintedJoker && (
        <div className="absolute top-0 right-0 bg-amber-500 text-zinc-950 text-[7px] sm:text-[8px] mobile-landscape:text-[7px] font-black px-0.5 sm:px-1 mobile-landscape:px-0.5 rounded-bl shadow leading-tight">
          <span className="sm:hidden mobile-landscape:inline">★J</span>
          <span className="hidden sm:inline mobile-landscape:hidden">★ JKR</span>
        </div>
      )}

      {/* Bottom Right Inverted Rank & Suit */}
      <div
        className={`flex flex-col items-center leading-none ${suitColor} font-bold rotate-180 self-end w-fit`}
      >
        <span>{card.isPrintedJoker ? "JKR" : card.rank}</span>
        <span
          className={`${
            isCompact ? "text-xs sm:text-sm xl:text-base" : "text-sm sm:text-lg"
          } leading-none`}
        >
          {suitSymbol}
        </span>
      </div>
    </motion.div>
  );
};
