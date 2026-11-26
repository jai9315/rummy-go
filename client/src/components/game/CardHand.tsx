"use client";

import { Award, EyeOff, Layers, RefreshCw } from "lucide-react";
import React from "react";
import { MeldGroupView } from "@/components/game/MeldGroup";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";

interface CardHandProps {
  onDiscard: (cardId: string) => void;
  onDeclare: () => void;
  onDrop: () => void;
  onSort: (by: "SUIT" | "RANK") => void;
}

export const CardHand: React.FC<CardHandProps> = ({
  onDiscard,
  onDeclare,
  onDrop,
  onSort,
}) => {
  const user = useAuthStore((s) => s.user);
  const {
    gameState,
    handGroups,
    selectedCardIds,
    toggleCardSelection,
    groupSelectedCards,
    setShowDeclareModal,
  } = useGameStore();

  const isMyTurn = gameState?.currentTurnPlayerId === user?.id;
  const isDiscardPhase = isMyTurn && gameState?.turnPhase === "DISCARD";
  const isDrawPhase = isMyTurn && gameState?.turnPhase === "DRAW";

  const handleDiscardClick = () => {
    if (selectedCardIds.length === 1 && isDiscardPhase) {
      onDiscard(selectedCardIds[0]);
    }
  };

  const handleDeclareClick = () => {
    if (selectedCardIds.length === 1 && isDiscardPhase) {
      setShowDeclareModal(true, selectedCardIds[0]);
    } else {
      setShowDeclareModal(true, null);
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-3 px-2 sm:px-6 pb-4">
      {/* Action Controls Bar */}
      <div className="flex flex-wrap items-center justify-center gap-2 bg-zinc-950/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-amber-500/30 shadow-2xl">
        {/* Sort Buttons */}
        <button
          onClick={() => onSort("SUIT")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-600 transition"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
          <span>Sort Suit</span>
        </button>

        <button
          onClick={() => onSort("RANK")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-600 transition"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
          <span>Sort Rank</span>
        </button>

        {/* Group Selected Button */}
        <button
          onClick={groupSelectedCards}
          disabled={selectedCardIds.length < 2}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            selectedCardIds.length >= 2
              ? "bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold shadow-md shadow-amber-500/20"
              : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 cursor-not-allowed"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Group ({selectedCardIds.length})</span>
        </button>

        <div className="h-5 w-px bg-zinc-700 mx-1 hidden sm:block" />

        {/* Discard Button */}
        <button
          onClick={handleDiscardClick}
          disabled={!isDiscardPhase || selectedCardIds.length !== 1}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            isDiscardPhase && selectedCardIds.length === 1
              ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 animate-pulse"
              : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 cursor-not-allowed"
          }`}
        >
          <span>Discard</span>
        </button>

        {/* Declare Button */}
        <button
          onClick={handleDeclareClick}
          disabled={!isDiscardPhase}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            isDiscardPhase
              ? "bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 shadow-lg shadow-amber-500/30"
              : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 cursor-not-allowed"
          }`}
        >
          <Award className="w-4 h-4 text-zinc-950" />
          <span>Declare</span>
        </button>

        {/* Drop Button */}
        <button
          onClick={onDrop}
          disabled={!isDrawPhase}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
            isDrawPhase
              ? "bg-zinc-800 hover:bg-red-950 text-red-400 border border-red-500/40"
              : "bg-zinc-800/40 text-zinc-600 border border-zinc-800 cursor-not-allowed"
          }`}
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span>Drop</span>
        </button>
      </div>

      {/* Hand Melds Container (Horizontally Scrollable on Mobile) */}
      <div className="w-full flex items-center justify-center overflow-x-auto py-2 px-1">
        <div className="flex items-center gap-3 sm:gap-5 min-w-max">
          {handGroups.map((group, idx) => (
            <MeldGroupView
              key={idx}
              groupIndex={idx}
              cards={group}
              selectedCardIds={selectedCardIds}
              onCardClick={toggleCardSelection}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
