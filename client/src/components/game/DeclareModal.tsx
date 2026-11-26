"use client";

import { AlertCircle, Award, CheckCircle2, X } from "lucide-react";
import React, { useState } from "react";
import { Card } from "@/components/game/Card";
import { ClientEvaluator } from "@/lib/clientEvaluator";
import { useGameStore } from "@/store/useGameStore";
import { Card as CardType } from "@/types";

interface DeclareModalProps {
  onConfirmDeclare: (melds: CardType[][], declareCardId: string) => void;
  onClose: () => void;
}

export const DeclareModal: React.FC<DeclareModalProps> = ({
  onConfirmDeclare,
  onClose,
}) => {
  const { handGroups, privateHand, declareCardId } = useGameStore();
  const [selectedDeclareCardId, setSelectedDeclareCardId] = useState<string>(
    declareCardId || (privateHand.length === 14 ? privateHand[privateHand.length - 1].id : "")
  );

  const declareCard = privateHand.find((c) => c.id === selectedDeclareCardId);

  // Clean melds excluding declare card
  const filteredMelds: CardType[][] = handGroups
    .map((group) => group.filter((c) => c.id !== selectedDeclareCardId))
    .filter((group) => group.length > 0);

  const totalCardsInMelds = filteredMelds.reduce((sum, g) => sum + g.length, 0);

  // Evaluate each meld
  const evaluatedMelds = filteredMelds.map((g) => ClientEvaluator.evaluateMeld(g));
  const pureCount = evaluatedMelds.filter((m) => m.type === "PURE_SEQUENCE").length;
  const impureCount = evaluatedMelds.filter((m) => m.type === "IMPURE_SEQUENCE").length;
  const totalSequences = pureCount + impureCount;
  const allGroupsValid = evaluatedMelds.every((m) => m.isValid);

  const hasPureSequence = pureCount >= 1;
  const hasTwoSequences = totalSequences >= 2;
  const hasExact13Cards = totalCardsInMelds === 13;
  const canDeclare =
    hasPureSequence && hasTwoSequences && allGroupsValid && hasExact13Cards && selectedDeclareCardId;

  const handleConfirm = () => {
    if (canDeclare && selectedDeclareCardId) {
      onConfirmDeclare(filteredMelds, selectedDeclareCardId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 border border-amber-500/40 shadow-2xl p-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-wide">Declare Rummy</h2>
            <p className="text-xs text-zinc-400">
              Verify your combinations and confirm your winning declaration.
            </p>
          </div>
        </div>

        {/* Declare Card Selection */}
        <div className="mb-6 p-4 rounded-xl bg-zinc-950/60 border border-zinc-800">
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
            1. Select Card to Discard into Declare Slot:
          </h3>
          <div className="flex items-center gap-2 overflow-x-auto py-2">
            {privateHand.map((card) => (
              <div
                key={card.id}
                onClick={() => setSelectedDeclareCardId(card.id)}
                className={`transition-all ${
                  selectedDeclareCardId === card.id
                    ? "ring-4 ring-amber-400 -translate-y-2 rounded-lg"
                    : "opacity-75 hover:opacity-100"
                }`}
              >
                <Card card={card} size="sm" />
              </div>
            ))}
          </div>
          {declareCard && (
            <p className="text-[11px] text-zinc-400 mt-2">
              Discarding: <strong className="text-amber-400">{declareCard.rank} of {declareCard.suit}</strong> into declare slot
            </p>
          )}
        </div>

        {/* Verification Checkpoints */}
        <div className="mb-6 p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-2.5">
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
            2. Declaration Requirements:
          </h3>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">Mandatory Pure Sequence (at least 1)</span>
            <div className="flex items-center gap-1.5 font-bold">
              {hasPureSequence ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> {pureCount} found
                </span>
              ) : (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Missing
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">Total Sequences (at least 2)</span>
            <div className="flex items-center gap-1.5 font-bold">
              {hasTwoSequences ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> {totalSequences} found
                </span>
              ) : (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Need at least 2
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">All Card Groups Valid (Sequences or Sets)</span>
            <div className="flex items-center gap-1.5 font-bold">
              {allGroupsValid ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Valid
                </span>
              ) : (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Invalid group found
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">Melds Card Count (Exactly 13 cards)</span>
            <div className="flex items-center gap-1.5 font-bold">
              {hasExact13Cards ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 13 / 13 cards
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> {totalCardsInMelds} / 13 cards
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canDeclare}
            className={`px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
              canDeclare
                ? "bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 shadow-lg shadow-amber-500/30"
                : "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed"
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Confirm Win Declaration</span>
          </button>
        </div>
      </div>
    </div>
  );
};
