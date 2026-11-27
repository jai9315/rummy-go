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
  dealDelay?: number;
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  HEARTS: "♥",
  DIAMONDS: "♦",
  CLUBS: "♣",
  SPADES: "♠",
  JOKER: "★",
};

const SUIT_COLORS: Record<Suit, string> = {
  HEARTS: "text-[#c81e2b]",
  DIAMONDS: "text-[#c81e2b]",
  CLUBS: "text-[#14171f]",
  SPADES: "text-[#14171f]",
  JOKER: "text-amber-600",
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
  dealDelay,
}) => {
  const sizeClasses = {
    sm: "w-10 h-14 sm:w-11 sm:h-16 text-[10px] sm:text-[11px] p-0.5 sm:p-1",
    hand: "w-11 h-16 sm:w-[54px] sm:h-[78px] xl:w-[62px] xl:h-[92px] mobile-landscape:w-10 mobile-landscape:h-[60px] text-[10px] sm:text-xs xl:text-sm mobile-landscape:text-[10px] p-0.5 sm:p-1 mobile-landscape:p-0.5",
    deck: "w-14 h-20 sm:w-[68px] sm:h-[98px] lg:w-[78px] lg:h-[112px] mobile-landscape:w-12 mobile-landscape:h-[68px] text-[11px] sm:text-sm mobile-landscape:text-[10px] p-1 sm:p-1.5 mobile-landscape:p-0.5",
    md: "w-14 h-20 sm:w-16 sm:h-24 text-xs sm:text-sm p-1",
    lg: "w-20 h-28 sm:w-24 sm:h-36 text-base p-1.5",
  }[size];

  const isCompact = size === "sm" || size === "hand";

  // Ornate Royal 13 Card Back
  if (faceDown || !card) {
    return (
      <motion.div
        whileHover={!disabled ? { y: -3 } : undefined}
        whileTap={!disabled ? { scale: 0.96 } : undefined}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        onClick={!disabled ? onClick : undefined}
        className={`${sizeClasses} ${className} card-back relative rounded-lg flex items-center justify-center cursor-pointer select-none overflow-hidden`}
      >
        <div className="flex flex-col items-center justify-center gap-0.5 text-center pointer-events-none">
          <span className="text-amber-300/90 text-sm sm:text-base mobile-landscape:text-xs leading-none">
            ★
          </span>
          <span className="font-serif-luxury text-amber-200/85 font-bold text-[7px] sm:text-[8px] tracking-[0.18em] uppercase leading-none">
            ROYAL 13
          </span>
        </div>
      </motion.div>
    );
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];

  const isDealingIn = typeof dealDelay === "number";

  return (
    <motion.div
      layout={!isDealingIn}
      initial={
        isDealingIn
          ? { opacity: 0, y: -34, scale: 0.78, rotate: -7 }
          : { opacity: 0, y: -10, scale: 0.94 }
      }
      animate={{
        opacity: isDragging ? 0.45 : 1,
        y: isSelected ? -10 : 0,
        scale: isDragging ? 1.04 : 1,
        rotate: 0,
      }}
      exit={{ opacity: 0, y: -12, scale: 0.9 }}
      whileHover={!disabled && !isSelected && !isDragging ? { y: -5 } : undefined}
      transition={
        isDealingIn
          ? {
              type: "spring",
              stiffness: 340,
              damping: 25,
              delay: dealDelay,
            }
          : { type: "spring", stiffness: 420, damping: 28 }
      }
      onClick={!disabled ? onClick : undefined}
      className={`
        ${sizeClasses}
        ${className}
        relative rounded-lg bg-gradient-to-b from-white via-[#fdfcf8] to-[#f1efe9] shadow-[0_6px_16px_rgba(0,0,0,0.45)] select-none cursor-pointer
        border transition-shadow duration-200
        ${
          isSelected
            ? "border-[#f6e09e] ring-2 sm:ring-[3px] ring-[#f6e09e]/80 z-20 shadow-[0_12px_24px_rgba(212,175,55,0.4)]"
            : "border-zinc-300/90 hover:shadow-xl"
        }
        ${isDragging ? "ring-2 ring-emerald-400 border-emerald-400" : ""}
        ${disabled ? "opacity-75 cursor-not-allowed" : ""}
        overflow-hidden flex flex-col justify-between
      `}
    >
      {/* Top Left Rank & Suit */}
      <div className={`flex flex-col items-center leading-none ${suitColor} font-extrabold w-fit`}>
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
              ★
            </span>
            <div className="text-[7px] sm:text-[8px] font-black text-amber-600 tracking-wider">
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

      {/* Wild Joker Gold Badge */}
      {card.isWildJoker && !card.isPrintedJoker && (
        <div className="absolute top-0 right-0 bg-gradient-to-r from-[#f6e09e] to-[#d4af37] text-slate-950 text-[7px] sm:text-[8px] mobile-landscape:text-[7px] font-black px-1 py-0.5 rounded-bl shadow leading-none">
          <span className="sm:hidden mobile-landscape:inline">★J</span>
          <span className="hidden sm:inline mobile-landscape:hidden">★ JKR</span>
        </div>
      )}

      {/* Bottom Right Inverted Rank & Suit */}
      <div
        className={`flex flex-col items-center leading-none ${suitColor} font-extrabold rotate-180 self-end w-fit`}
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
