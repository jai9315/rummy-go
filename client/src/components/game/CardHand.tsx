"use client";

import { Award, EyeOff, Layers, Plus, RefreshCw } from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { DropTargetInfo, MeldGroupView } from "@/components/game/MeldGroup";
import { ClientEvaluator } from "@/lib/clientEvaluator";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";

interface CardHandProps {
  onDiscard: (cardId: string) => void;
  onDeclare: (declareCardId?: string | null) => void;
  onDrop: () => void;
  onSort: (by: "SUIT" | "RANK") => void;
}

interface TouchDragState {
  cardId: string;
  startX: number;
  startY: number;
  active: boolean;
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
    clearSelection,
    groupSelectedCards,
    ungroupMeld,
    moveCard,
    setShowDeclareModal,
  } = useGameStore();

  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetInfo | null>(null);
  const [touchGhostPos, setTouchGhostPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const touchDragRef = useRef<TouchDragState | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);

  const isPlaying = gameState?.status === "PLAYING";
  const isMyTurn = isPlaying && gameState?.currentTurnPlayerId === user?.id;
  const isDiscardPhase = isMyTurn && gameState?.turnPhase === "DISCARD";
  const isDrawPhase = isMyTurn && gameState?.turnPhase === "DRAW";

  const liveDeadwoodPoints = useMemo(() => {
    if (handGroups.length === 0) return 0;
    return ClientEvaluator.calculatePlayerScore(handGroups).points;
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

  const handleCardClick = useCallback(
    (cardId: string) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      toggleCardSelection(cardId);
    },
    [toggleCardSelection]
  );

  const handleDragStartCard = useCallback((cardId: string) => {
    setDraggingCardId(cardId);
  }, []);

  const handleDragEndCard = useCallback(() => {
    setDraggingCardId(null);
    setDropTarget(null);
  }, []);

  const handleDropCard = useCallback(
    (cardId: string, targetGroupIndex: number, targetCardIndex?: number) => {
      moveCard(cardId, targetGroupIndex, targetCardIndex);
      setDraggingCardId(null);
      setDropTarget(null);
    },
    [moveCard]
  );

  const resolveTouchDropTarget = useCallback(
    (clientX: number, clientY: number): DropTargetInfo | null => {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return null;

      const cardNode = el.closest("[data-card-index]");
      if (cardNode) {
        const gStr = cardNode.getAttribute("data-group-index");
        const cStr = cardNode.getAttribute("data-card-index");
        if (gStr !== null && cStr !== null) {
          const gIdx = parseInt(gStr, 10);
          const cIdx = parseInt(cStr, 10);
          if (!Number.isNaN(gIdx) && !Number.isNaN(cIdx)) {
            return { groupIndex: gIdx, cardIndex: cIdx };
          }
        }
      }

      const groupNode = el.closest("[data-group-index]");
      if (groupNode) {
        const gStr = groupNode.getAttribute("data-group-index");
        if (gStr !== null) {
          const gIdx = parseInt(gStr, 10);
          if (!Number.isNaN(gIdx)) {
            return { groupIndex: gIdx };
          }
        }
      }

      return null;
    },
    []
  );

  const handleTouchStartCard = useCallback(
    (e: React.TouchEvent, cardId: string) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchDragRef.current = {
        cardId,
        startX: touch.clientX,
        startY: touch.clientY,
        active: false,
      };
    },
    []
  );

  const handleTouchMoveCard = useCallback(
    (e: React.TouchEvent) => {
      const state = touchDragRef.current;
      const touch = e.touches[0];
      if (!state || !touch) return;

      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      if (!state.active) {
        if (Math.hypot(dx, dy) < 12) return;
        state.active = true;
        setDraggingCardId(state.cardId);
      }

      setTouchGhostPos({ x: touch.clientX, y: touch.clientY });
      const target = resolveTouchDropTarget(touch.clientX, touch.clientY);
      setDropTarget(target);
    },
    [resolveTouchDropTarget]
  );

  const handleTouchEndCard = useCallback(() => {
    const state = touchDragRef.current;
    if (state?.active) {
      suppressNextClickRef.current = true;
      setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 250);

      if (dropTarget) {
        moveCard(state.cardId, dropTarget.groupIndex, dropTarget.cardIndex);
      }
    }
    touchDragRef.current = null;
    setDraggingCardId(null);
    setDropTarget(null);
    setTouchGhostPos(null);
  }, [dropTarget, moveCard]);

  const newGroupTargetIndex = handGroups.length;
  const isNewGroupTargeted =
    draggingCardId !== null && dropTarget?.groupIndex === newGroupTargetIndex;

  return (
    <div className="w-full min-w-0 flex flex-col items-center gap-1.5 mobile-landscape:gap-0.5">
      {/* Touch Drag Floating Pill */}
      {touchGhostPos && draggingCardId && (
        <div
          style={{
            left: touchGhostPos.x,
            top: touchGhostPos.y - 36,
          }}
          className="fixed z-50 -translate-x-1/2 -translate-y-1/2 pointer-events-none px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-[11px] shadow-xl border border-amber-200"
        >
          Moving Card...
        </div>
      )}

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

      {/* Glassmorphic 13-Card Hand Tray */}
      <div className="glass-panel w-full rounded-2xl mobile-landscape:rounded-xl px-2 py-1.5 mobile-landscape:px-1.5 mobile-landscape:py-1 overflow-x-auto overflow-y-visible">
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
                draggingCardId={draggingCardId}
                dropTarget={dropTarget}
                onCardClick={handleCardClick}
                onUngroup={
                  handGroups.length > 1 ? () => ungroupMeld(idx) : undefined
                }
                onDragStartCard={handleDragStartCard}
                onDragEndCard={handleDragEndCard}
                onHoverDropTarget={setDropTarget}
                onDropCard={handleDropCard}
                onTouchStartCard={handleTouchStartCard}
                onTouchMoveCard={handleTouchMoveCard}
                onTouchEndCard={handleTouchEndCard}
              />
            ))}

            {/* "+ New Group" Drop Zone shown while dragging */}
            {draggingCardId && (
              <div
                data-group-index={newGroupTargetIndex}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropTarget?.groupIndex !== newGroupTargetIndex) {
                    setDropTarget({ groupIndex: newGroupTargetIndex });
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const cardId =
                    e.dataTransfer.getData("text/plain") || draggingCardId;
                  if (cardId) {
                    handleDropCard(cardId, newGroupTargetIndex);
                  }
                }}
                className={`min-w-[68px] h-20 sm:h-24 mobile-landscape:min-w-[54px] mobile-landscape:h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 px-2 text-xs font-bold transition shrink-0 ${
                  isNewGroupTargeted
                    ? "border-[#f6e09e] bg-amber-500/20 text-[#f6e09e] scale-105"
                    : "border-emerald-400/50 bg-emerald-950/40 text-emerald-300/80"
                }`}
              >
                <Plus className="w-4 h-4" />
                <span className="text-[9px] uppercase tracking-wider text-center leading-tight">
                  New Group
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
