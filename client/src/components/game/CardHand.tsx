"use client";

import { Award, EyeOff, Layers, Plus, RefreshCw } from "lucide-react";
import React, { useMemo } from "react";
import {
  parseDragDataTransfer,
  TableDragItem,
  TableDropZone,
} from "@/components/game/dragTypes";
import { MeldGroupView } from "@/components/game/MeldGroup";
import { ClientEvaluator } from "@/lib/clientEvaluator";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";

interface CardHandProps {
  activeDrag: TableDragItem | null;
  hoveredZone: TableDropZone | null;
  isDealingHand: boolean;
  dealBatchKey: number;
  shouldSuppressClick: () => boolean;
  onDiscard: (cardId: string) => void;
  onDeclare: (declareCardId?: string | null) => void;
  onDrop: () => void;
  onSort: (by: "SUIT" | "RANK") => void;
  onStartDrag: (item: TableDragItem) => void;
  onEndDrag: () => void;
  onHoverZone: (zone: TableDropZone | null) => void;
  onDropOnZone: (item: TableDragItem, zone: TableDropZone) => void;
  onTouchDragStart: (e: React.TouchEvent, item: TableDragItem) => void;
}

export const CardHand: React.FC<CardHandProps> = ({
  activeDrag,
  hoveredZone,
  isDealingHand,
  dealBatchKey,
  shouldSuppressClick,
  onDiscard,
  onDeclare,
  onDrop,
  onSort,
  onStartDrag,
  onEndDrag,
  onHoverZone,
  onDropOnZone,
  onTouchDragStart,
}) => {
  const user = useAuthStore((s) => s.user);
  const {
    gameState,
    handGroups,
    selectedCardIds,
    toggleCardSelection,
    clearSelection,
    groupSelectedCards,
    ungroupMeld,
    setShowDeclareModal,
  } = useGameStore();

  const isPlaying = gameState?.status === "PLAYING";
  const isMyTurn = isPlaying && gameState?.currentTurnPlayerId === user?.id;
  const isDiscardPhase = isMyTurn && gameState?.turnPhase === "DISCARD";
  const isDrawPhase = isMyTurn && gameState?.turnPhase === "DRAW";

  const { liveDeadwoodPoints, hasFirstLife, hasSecondLife } = useMemo(() => {
    if (handGroups.length === 0) {
      return { liveDeadwoodPoints: 0, hasFirstLife: false, hasSecondLife: false };
    }
    const evaluated = handGroups.map((g) => ClientEvaluator.evaluateMeld(g));
    const pureCount = evaluated.filter(
      (e) => e.isValid && e.type === "PURE_SEQUENCE"
    ).length;
    const seqCount = evaluated.filter(
      (e) =>
        e.isValid &&
        (e.type === "PURE_SEQUENCE" || e.type === "IMPURE_SEQUENCE")
    ).length;
    return {
      liveDeadwoodPoints: ClientEvaluator.calculatePlayerScore(handGroups).points,
      hasFirstLife: pureCount >= 1,
      hasSecondLife: pureCount >= 1 && seqCount >= 2,
    };
  }, [handGroups]);

  // Compute cumulative card offset per meld group for staggered 13-card deal-in
  const groupCardOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const g of handGroups) {
      offsets.push(running);
      running += g.length;
    }
    return offsets;
  }, [handGroups]);

  const handleDiscardClick = () => {
    if (selectedCardIds.length === 1 && isDiscardPhase) {
      const cardIdToDiscard = selectedCardIds[0];
      onDiscard(cardIdToDiscard);
      clearSelection();
    }
  };

  const handleDeclareClick = () => {
    const preselectedCardId =
      selectedCardIds.length === 1 && isDiscardPhase
        ? selectedCardIds[0]
        : null;
    setShowDeclareModal(true, preselectedCardId);
    onDeclare(preselectedCardId);
  };

  const handleCardClick = (cardId: string) => {
    if (shouldSuppressClick()) return;
    toggleCardSelection(cardId);
  };

  const isDrawDrag =
    activeDrag?.kind === "DRAW_CLOSED" || activeDrag?.kind === "DRAW_OPEN";
  const isHandDrag = activeDrag?.kind === "HAND_CARD";
  const newGroupTargetIndex = handGroups.length;
  const isNewGroupTargeted =
    activeDrag !== null &&
    hoveredZone?.zone === "new-group" &&
    hoveredZone.groupIndex === newGroupTargetIndex;
  const isTrayDropTargeted =
    isDrawDrag &&
    (hoveredZone?.zone === "hand-tray" ||
      hoveredZone?.zone === "meld-group" ||
      hoveredZone?.zone === "new-group");

  const handleTrayDragOver = (e: React.DragEvent) => {
    if (!isDrawDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!hoveredZone || hoveredZone.zone !== "meld-group") {
      onHoverZone({ zone: "hand-tray" });
    }
  };

  const handleTrayDrop = (e: React.DragEvent) => {
    if (!isDrawDrag) return;
    e.preventDefault();
    const item = parseDragDataTransfer(e.dataTransfer, activeDrag);
    if (item && (item.kind === "DRAW_CLOSED" || item.kind === "DRAW_OPEN")) {
      onDropOnZone(item, { zone: "hand-tray" });
    }
    onEndDrag();
  };

  return (
    <div className="w-full min-w-0 flex flex-col items-center gap-1.5 mobile-landscape:gap-0.5">
      {/* Compact Action Toolbar + Live Deadwood Counter */}
      <div className="glass-panel flex flex-wrap mobile-landscape:flex-nowrap items-center justify-center gap-1 sm:gap-1.5 mobile-landscape:gap-1 px-2 py-1 mobile-landscape:px-1.5 mobile-landscape:py-0.5 rounded-xl mobile-landscape:rounded-lg max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => onSort("SUIT")}
          className="flex items-center gap-1 px-2 py-1 mobile-landscape:px-1.5 mobile-landscape:py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[10px] sm:text-[11px] mobile-landscape:text-[10px] font-semibold text-slate-200 border border-white/10 transition whitespace-nowrap"
        >
          <RefreshCw className="w-3 h-3 text-amber-300 shrink-0" />
          <span>Sort Suit</span>
        </button>

        <button
          type="button"
          onClick={() => onSort("RANK")}
          className="flex items-center gap-1 px-2 py-1 mobile-landscape:px-1.5 mobile-landscape:py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[10px] sm:text-[11px] mobile-landscape:text-[10px] font-semibold text-slate-200 border border-white/10 transition whitespace-nowrap"
        >
          <RefreshCw className="w-3 h-3 text-sky-300 shrink-0" />
          <span>Sort Rank</span>
        </button>

        <button
          type="button"
          onClick={groupSelectedCards}
          disabled={selectedCardIds.length < 2}
          className={`flex items-center gap-1 px-2 py-1 mobile-landscape:px-1.5 mobile-landscape:py-0.5 rounded-lg text-[10px] sm:text-[11px] mobile-landscape:text-[10px] font-bold transition whitespace-nowrap ${
            selectedCardIds.length >= 2
              ? "bg-gradient-to-r from-[#f6e09e] to-[#d4af37] text-slate-950 shadow-md"
              : "bg-slate-800/50 text-slate-500 border border-white/5 cursor-not-allowed"
          }`}
        >
          <Layers className="w-3 h-3 shrink-0" />
          <span>Group ({selectedCardIds.length})</span>
        </button>

        <div className="h-4 w-px bg-white/15 hidden sm:block mobile-landscape:block" />

        <button
          type="button"
          onClick={handleDiscardClick}
          disabled={!isDiscardPhase || selectedCardIds.length !== 1}
          className={`px-2.5 py-1 mobile-landscape:px-2 mobile-landscape:py-0.5 rounded-lg text-[10px] sm:text-[11px] mobile-landscape:text-[10px] font-bold transition whitespace-nowrap ${
            isDiscardPhase && selectedCardIds.length === 1
              ? "bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30 animate-pulse"
              : "bg-slate-800/50 text-slate-500 border border-white/5 cursor-not-allowed"
          }`}
        >
          Discard
        </button>

        <button
          type="button"
          onClick={handleDeclareClick}
          disabled={!isDiscardPhase}
          className={`flex items-center gap-1 px-2.5 py-1 mobile-landscape:px-2 mobile-landscape:py-0.5 rounded-lg text-[10px] sm:text-[11px] mobile-landscape:text-[10px] font-bold transition whitespace-nowrap ${
            isDiscardPhase
              ? "bg-gradient-to-r from-[#f6e09e] to-[#d4af37] hover:brightness-110 text-slate-950 shadow-md shadow-amber-500/25"
              : "bg-slate-800/50 text-slate-500 border border-white/5 cursor-not-allowed"
          }`}
        >
          <Award className="w-3 h-3 shrink-0" />
          <span>Declare</span>
        </button>

        <button
          type="button"
          onClick={onDrop}
          disabled={!isDrawPhase}
          className={`flex items-center gap-1 px-2 py-1 mobile-landscape:px-1.5 mobile-landscape:py-0.5 rounded-lg text-[10px] sm:text-[11px] mobile-landscape:text-[10px] font-semibold transition whitespace-nowrap ${
            isDrawPhase
              ? "bg-slate-800/90 hover:bg-red-950/90 text-red-400 border border-red-500/35"
              : "bg-slate-800/40 text-slate-600 border border-white/5 cursor-not-allowed"
          }`}
        >
          <EyeOff className="w-3 h-3 shrink-0" />
          <span>Drop</span>
        </button>

        <div className="h-4 w-px bg-white/15 hidden sm:block mobile-landscape:block" />

        {/* Live 1st Life (Pure Seq) & 2nd Life (2nd Seq) Chips */}
        <div
          className={`px-2 py-1 mobile-landscape:px-1.5 mobile-landscape:py-0.5 rounded-lg border text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold whitespace-nowrap transition ${
            hasFirstLife
              ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
              : "bg-slate-900/75 border-white/15 text-slate-400"
          }`}
          title="1st Life: At least one valid Pure Sequence (no jokers)"
        >
          1st Life {hasFirstLife ? "✓" : "✗"}
        </div>

        <div
          className={`px-2 py-1 mobile-landscape:px-1.5 mobile-landscape:py-0.5 rounded-lg border text-[9px] sm:text-[10px] mobile-landscape:text-[8px] font-bold whitespace-nowrap transition ${
            hasSecondLife
              ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
              : "bg-slate-900/75 border-white/15 text-slate-400"
          }`}
          title="2nd Life: Second valid Sequence (Pure or Impure)"
        >
          2nd Life {hasSecondLife ? "✓" : "✗"}
        </div>

        {/* Live Deadwood Points Badge */}
        <div
          className={`px-2 py-1 mobile-landscape:px-1.5 mobile-landscape:py-0.5 rounded-lg border text-[10px] sm:text-[11px] mobile-landscape:text-[9px] font-mono font-bold whitespace-nowrap ${
            liveDeadwoodPoints === 0
              ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
              : "bg-slate-900/80 border-amber-400/30 text-amber-200"
          }`}
          title="Current deadwood score from your arranged groups"
        >
          Deadwood: {liveDeadwoodPoints} pts
        </div>
      </div>

      {/* Glassmorphic 13-Card Hand Tray (also accepts drag-to-draw drops from Closed Deck / Open Pile) */}
      <div
        data-drop-zone="hand-tray"
        onDragOver={handleTrayDragOver}
        onDrop={handleTrayDrop}
        className={`relative glass-panel w-full rounded-2xl mobile-landscape:rounded-xl px-2 py-1.5 mobile-landscape:px-1.5 mobile-landscape:py-1 overflow-x-auto overflow-y-visible transition-all ${
          isTrayDropTargeted
            ? "ring-2 ring-emerald-400 border-emerald-300 bg-emerald-950/55 shadow-[0_0_24px_rgba(52,211,153,0.35)]"
            : isDrawDrag
            ? "ring-1 ring-[#f6e09e]/70 border-[#f6e09e]/50"
            : ""
        }`}
      >
        {/* Drag-to-Draw Hint Banner */}
        {isDrawDrag && (
          <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 z-30 px-2.5 py-0.5 rounded-full bg-emerald-500/95 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-lg whitespace-nowrap">
            Drop Here or on a Group to Draw
          </div>
        )}

        {handGroups.length === 0 ? (
          <div className="h-20 sm:h-24 mobile-landscape:h-16 flex items-center justify-center text-xs text-slate-400">
            Waiting for cards to be dealt...
          </div>
        ) : (
          <div className="flex items-end gap-2 sm:gap-2.5 mobile-landscape:gap-1.5 w-max mx-auto px-0.5">
            {handGroups.map((group, idx) => (
              <MeldGroupView
                key={idx}
                groupIndex={idx}
                cards={group}
                selectedCardIds={selectedCardIds}
                activeDrag={activeDrag}
                hoveredZone={hoveredZone}
                isDealingHand={isDealingHand}
                dealBatchKey={dealBatchKey}
                dealIndexOffset={groupCardOffsets[idx] ?? 0}
                onCardClick={handleCardClick}
                onUngroup={
                  handGroups.length > 1 ? () => ungroupMeld(idx) : undefined
                }
                onStartDrag={onStartDrag}
                onEndDrag={onEndDrag}
                onHoverZone={onHoverZone}
                onDropOnZone={onDropOnZone}
                onTouchDragStart={onTouchDragStart}
              />
            ))}

            {/* "+ New Group" Drop Zone shown while dragging a hand card or drawing a card */}
            {(isHandDrag || isDrawDrag) && (
              <div
                data-drop-zone="new-group"
                data-group-index={newGroupTargetIndex}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = isDrawDrag ? "copy" : "move";
                  onHoverZone({
                    zone: "new-group",
                    groupIndex: newGroupTargetIndex,
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
                      zone: "new-group",
                      groupIndex: newGroupTargetIndex,
                    });
                  }
                  onEndDrag();
                }}
                className={`min-w-[68px] h-20 sm:h-24 mobile-landscape:min-w-[54px] mobile-landscape:h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 px-2 text-xs font-bold transition shrink-0 ${
                  isNewGroupTargeted
                    ? "border-[#f6e09e] bg-amber-500/25 text-[#f6e09e] scale-105 shadow-[0_0_16px_rgba(246,224,158,0.4)]"
                    : "border-emerald-400/50 bg-emerald-950/40 text-emerald-300/80"
                }`}
              >
                <Plus className="w-4 h-4" />
                <span className="text-[9px] uppercase tracking-wider text-center leading-tight">
                  + New Group
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
