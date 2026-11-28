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
  size?: "xs" | "sm" | "hand" | "deck" | "md" | "lg";
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
  HEARTS: "text-[#B91C1C]",
  DIAMONDS: "text-[#B91C1C]",
  CLUBS: "text-[#111827]",
  SPADES: "text-[#111827]",
  JOKER: "text-amber-700",
};

const RoyalCrownSvg: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M3 17.5h18v2.25a.75.75 0 0 1-.75.75H3.75a.75.75 0 0 1-.75-.75V17.5Zm.6-2.25L2.25 7.7a.75.75 0 0 1 1.24-.69L7.6 10.7l3.78-5.4a.75.75 0 0 1 1.24 0l3.78 5.4 4.11-3.69a.75.75 0 0 1 1.24.69l-1.35 7.55H3.6Z" />
  </svg>
);

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
    xs: "w-7 h-10 sm:w-8 sm:h-11 text-[8px] sm:text-[9px] p-0.5 rounded-md",
    sm: "w-10 h-14 sm:w-11 sm:h-16 text-[10px] sm:text-[11px] p-0.5 sm:p-1 rounded-lg",
    hand: "w-11 h-16 sm:w-[54px] sm:h-[78px] xl:w-[62px] xl:h-[92px] mobile-landscape:w-10 mobile-landscape:h-[60px] text-[10px] sm:text-xs xl:text-sm mobile-landscape:text-[10px] p-0.5 sm:p-1 mobile-landscape:p-0.5 rounded-lg",
    deck: "w-14 h-20 sm:w-[68px] sm:h-[98px] lg:w-[78px] lg:h-[112px] mobile-landscape:w-12 mobile-landscape:h-[68px] text-[11px] sm:text-sm mobile-landscape:text-[10px] p-1 sm:p-1.5 mobile-landscape:p-0.5 rounded-lg",
    md: "w-14 h-20 sm:w-16 sm:h-24 text-xs sm:text-sm p-1 rounded-lg",
    lg: "w-20 h-28 sm:w-24 sm:h-36 text-base p-1.5 rounded-xl",
  }[size];

  const isMini = size === "xs";
  const isCompact = size === "xs" || size === "sm" || size === "hand";

  // Ornate Royal 13 Filigree Card Back (Royal Navy & Gold)
  if (faceDown || !card) {
    return (
      <motion.div
        whileHover={!disabled ? { y: -3 } : undefined}
        whileTap={!disabled ? { scale: 0.96 } : undefined}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        onClick={!disabled ? onClick : undefined}
        className={`${sizeClasses} ${className} card-back relative flex items-center justify-center cursor-pointer select-none overflow-hidden`}
      >
        {/* Subtle Gold Corner Filigree Diamonds */}
        {!isMini && (
          <>
            <span className="pointer-events-none absolute top-1 left-1 text-[6px] text-[#f6e09e]/75 leading-none">
              ◆
            </span>
            <span className="pointer-events-none absolute top-1 right-1 text-[6px] text-[#f6e09e]/75 leading-none">
              ◆
            </span>
            <span className="pointer-events-none absolute bottom-1 left-1 text-[6px] text-[#f6e09e]/75 leading-none">
              ◆
            </span>
            <span className="pointer-events-none absolute bottom-1 right-1 text-[6px] text-[#f6e09e]/75 leading-none">
              ◆
            </span>
          </>
        )}

        <div className="flex flex-col items-center justify-center gap-0.5 text-center pointer-events-none px-1 py-1 rounded-md border border-[#d4af37]/35 bg-[#0b132a]/65">
          <RoyalCrownSvg
            className={
              isMini
                ? "w-2.5 h-2.5 text-[#f6e09e]"
                : "w-3.5 h-3.5 sm:w-4 sm:h-4 mobile-landscape:w-3 mobile-landscape:h-3 text-[#f6e09e] drop-shadow-[0_1px_4px_rgba(212,175,55,0.6)]"
            }
          />
          {!isMini && (
            <span className="font-serif-luxury text-[#f6e09e]/90 font-bold text-[6px] sm:text-[7px] tracking-[0.18em] uppercase leading-none">
              ROYAL 13
            </span>
          )}
        </div>
      </motion.div>
    );
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];
  const isDealingIn = typeof dealDelay === "number";

  return (
    <motion.div
      layout={!isDealingIn && !isMini}
      initial={
        isMini
          ? false
          : isDealingIn
          ? { opacity: 0, y: -34, scale: 0.78, rotate: -7 }
          : { opacity: 0, y: -10, scale: 0.94 }
      }
      animate={{
        opacity: isDragging ? 0.45 : 1,
        y: isSelected ? -10 : 0,
        scale: isDragging ? 1.04 : 1,
        rotate: 0,
      }}
      exit={isMini ? undefined : { opacity: 0, y: -12, scale: 0.9 }}
      whileHover={!disabled && !isSelected && !isDragging && !isMini ? { y: -5 } : undefined}
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
        card-royal-face relative select-none cursor-pointer
        border transition-shadow duration-200
        ${
          isSelected
            ? "border-[#f6e09e] ring-2 sm:ring-[3px] ring-[#f6e09e]/85 z-20 shadow-[0_12px_24px_rgba(212,175,55,0.45)]"
            : card.isPrintedJoker || card.isWildJoker
            ? "border-[#d4af37]/80 hover:shadow-xl"
            : "border-[#d9ccb2] hover:shadow-xl"
        }
        ${isDragging ? "ring-2 ring-emerald-400 border-emerald-400" : ""}
        ${disabled ? "cursor-default" : ""}
        overflow-hidden flex flex-col justify-between
      `}
    >
      {/* Subtle Gilded Inner Frame */}
      {!isMini && (
        <div
          className={`pointer-events-none absolute inset-[2px] rounded-[6px] border ${
            card.isPrintedJoker || card.isWildJoker
              ? "border-[#d4af37]/55"
              : "border-[#c7a85d]/22"
          }`}
        />
      )}

      {/* Top Left Rank & Suit */}
      <div
        className={`relative z-10 flex flex-col items-center leading-none ${suitColor} font-black tracking-tight w-fit`}
      >
        <span>{card.isPrintedJoker ? "JK" : card.rank}</span>
        <span
          className={`${
            isMini
              ? "text-[9px]"
              : isCompact
              ? "text-xs sm:text-sm xl:text-base"
              : "text-sm sm:text-lg"
          } leading-none`}
        >
          {suitSymbol}
        </span>
      </div>

      {/* Center Emblem / Watermark Pip */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {card.isPrintedJoker ? (
          <div className="flex flex-col items-center justify-center">
            <div
              className={`rounded-full bg-gradient-to-br from-[#132145] via-[#1b2c5a] to-[#0d162e] border border-[#d4af37] shadow-md flex items-center justify-center ${
                isMini
                  ? "w-4 h-4"
                  : isCompact
                  ? "w-6 h-6 sm:w-8 sm:h-8"
                  : "w-9 h-9 sm:w-11 sm:h-11"
              }`}
            >
              <RoyalCrownSvg
                className={`${
                  isMini
                    ? "w-2.5 h-2.5"
                    : isCompact
                    ? "w-3.5 h-3.5 sm:w-4 sm:h-4"
                    : "w-5 h-5 sm:w-6 sm:h-6"
                } text-[#f6e09e]`}
              />
            </div>
            {!isMini && (
              <div className="mt-0.5 text-[6px] sm:text-[7px] font-black text-amber-800 tracking-[0.16em] uppercase leading-none">
                ★ JOKER ★
              </div>
            )}
          </div>
        ) : (
          <span
            className={`${
              isMini
                ? "text-xs opacity-20"
                : isCompact
                ? "text-lg sm:text-2xl xl:text-[26px] opacity-[0.18]"
                : "text-2xl sm:text-3xl opacity-[0.18]"
            } ${suitColor}`}
          >
            {suitSymbol}
          </span>
        )}
      </div>

      {/* Wild Joker Ornate Gold Crown Ribbon */}
      {card.isWildJoker && !card.isPrintedJoker && (
        <div
          className={`absolute top-0 right-0 z-10 bg-gradient-to-br from-[#f9e7a9] via-[#e2bd55] to-[#b8891f] text-[#111827] font-black rounded-bl-md shadow flex items-center gap-0.5 leading-none ${
            isMini
              ? "px-0.5 py-[1px] text-[6px]"
              : "px-1 py-0.5 text-[7px] sm:text-[8px] mobile-landscape:text-[7px]"
          }`}
        >
          <RoyalCrownSvg className={isMini ? "w-2 h-2" : "w-2.5 h-2.5"} />
          {!isMini && (
            <>
              <span className="sm:hidden mobile-landscape:inline">J</span>
              <span className="hidden sm:inline mobile-landscape:hidden">WILD</span>
            </>
          )}
        </div>
      )}

      {/* Bottom Right Inverted Rank & Suit (hidden on xs mini cards for crispness) */}
      {!isMini && (
        <div
          className={`relative z-10 flex flex-col items-center leading-none ${suitColor} font-black tracking-tight rotate-180 self-end w-fit`}
        >
          <span>{card.isPrintedJoker ? "JK" : card.rank}</span>
          <span
            className={`${
              isCompact ? "text-xs sm:text-sm xl:text-base" : "text-sm sm:text-lg"
            } leading-none`}
          >
            {suitSymbol}
          </span>
        </div>
      )}
    </motion.div>
  );
};
