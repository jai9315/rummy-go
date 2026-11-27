"use client";

import { Award, EyeOff, Layers, Plus, RefreshCw } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { DropTargetInfo, MeldGroupView } from "@/components/game/MeldGroup";
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
  const [touchGhostPos, setTouchGhostPos] = useState<{ x: number; y: number } | null>(null);

  const touchDragRef = useRef<TouchDragState | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);

  const isPlaying = gameState?.status === "PLAYING";
  const isMyTurn = isPlaying && gameState?.currentTurnPlayerId === user?.id;
  const isDiscardPhase = isMyTurn && gameState?.turnPhase === "DISCARD";
  const isDrawPhase = isMyTurn && gameState?.turnPhase === "DRAW";

  const handleDiscardClick = () => {
    if (selectedCardIds.length === 1 && isDiscardPhase) {
      const cardIdToDiscard = selectedCardIds[0];
      onDiscard(cardIdToDiscard);
      clearSelection();
    }
  };

  const handleDeclareClick = () => {
    const preselectedCardId =
      selectedCardIds.length === 1 && isDiscardPhase ? selectedCardIds[0] : null;
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

  const resolveTouchDropTarget = useCallback((clientX: number, clientY: number): DropTargetInfo | null => {
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
  }, []);

  const handleTouchStartCard = useCallback((e: React.TouchEvent, cardId: string) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchDragRef.current = {
      cardId,
      startX: touch.clientX,
      startY: touch.clientY,
      active: false,
    };
  }, []);

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
    <div className="w-full flex flex-col items-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 pt-1.5 pb-1.5">
      {/* Touch Drag Floating Pill */}
      {touchGhostPos && draggingCardId && (
        <div
          style={{
            left: touchGhostPos.x,
            top: touchGhostPos.y - 36,
          }}
          className="fixed z-50 -translate-x-1/2 -translate-y-1/2 pointer-events-none px-3 py-1 rounded-full bg-amber-500 text-zinc-950 font-black text-[11px] shadow-xl border border-amber-300"
        >
          Moving Card...
        </div>
      )}

      {/* Compact Action Toolbar (2x3 grid on narrow phones, single tight row on sm+) */}
      <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center justify-center gap-1 sm:gap-1.5 w-full max-w-sm sm:w-auto sm:max-w-none bg-zinc-900/90 backdrop-blur-md px-1.5 sm:px-2.5 py-1 rounded-xl border border-amber-500/25 shadow-lg">
        {/* Sort Suit */}
        <button
          onClick={() => onSort("SUIT")}
          className="flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] sm:text-xs font-semibold text-zinc-200 border border-zinc-700 transition whitespace-nowrap"
        >
          <RefreshCw className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="sm:hidden">Suit</span>
          <span className="hidden sm:inline">Sort Suit</span>
        </button>

        {/* Sort Rank */}
        <button
          onClick={() => onSort("RANK")}
          className="flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] sm:text-xs font-semibold text-zinc-200 border border-zinc-700 transition whitespace-nowrap"
        >
          <RefreshCw className="w-3 h-3 text-blue-400 shrink-0" />
          <span className="sm:hidden">Rank</span>
          <span className="hidden sm:inline">Sort Rank</span>
        </button>

        {/* Group Selected */}
        <button
          onClick={groupSelectedCards}
          disabled={selectedCardIds.length < 2}
          className={`flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition whitespace-nowrap ${
            selectedCardIds.length >= 2
              ? "bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold shadow-md shadow-amber-500/20"
              : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 cursor-not-allowed"
          }`}
        >
          <Layers className="w-3 h-3 shrink-0" />
          <span>Group ({selectedCardIds.length})</span>
        </button>

        <div className="h-4 w-px bg-zinc-700 mx-0.5 hidden sm:block" />

        {/* Discard */}
        <button
          onClick={handleDiscardClick}
          disabled={!isDiscardPhase || selectedCardIds.length !== 1}
          className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition whitespace-nowrap ${
            isDiscardPhase && selectedCardIds.length === 1
              ? "bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30 animate-pulse"
              : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 cursor-not-allowed"
          }`}
        >
          <span>Discard</span>
        </button>

        {/* Declare */}
        <button
          onClick={handleDeclareClick}
          disabled={!isDiscardPhase}
          className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition whitespace-nowrap ${
            isDiscardPhase
              ? "bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 shadow-md shadow-amber-500/30"
              : "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 cursor-not-allowed"
          }`}
        >
          <Award className="w-3.5 h-3.5 shrink-0" />
          <span>Declare</span>
        </button>

        {/* Drop */}
        <button
          onClick={onDrop}
          disabled={!isDrawPhase}
          className={`flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition whitespace-nowrap ${
            isDrawPhase
              ? "bg-zinc-800 hover:bg-red-950 text-red-400 border border-red-500/40"
              : "bg-zinc-800/40 text-zinc-600 border border-zinc-800 cursor-not-allowed"
          }`}
        >
          <EyeOff className="w-3 h-3 shrink-0" />
          <span>Drop</span>
        </button>
      </div>

      {/* Hand Melds Tray (smooth horizontal touch scroll on narrow screens, centered via w-max mx-auto) */}
      <div className="w-full overflow-x-auto overflow-y-visible">
        <div className="flex items-end gap-2 sm:gap-3 w-max mx-auto px-1 pt-1 pb-0.5">
          {handGroups.map((group, idx) => (
            <MeldGroupView
              key={idx}
              groupIndex={idx}
              cards={group}
              selectedCardIds={selectedCardIds}
              draggingCardId={draggingCardId}
              dropTarget={dropTarget}
              onCardClick={handleCardClick}
              onUngroup={handGroups.length > 1 ? () => ungroupMeld(idx) : undefined}
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
                const cardId = e.dataTransfer.getData("text/plain") || draggingCardId;
                if (cardId) {
                  handleDropCard(cardId, newGroupTargetIndex);
                }
              }}
              className={`min-w-[72px] h-20 sm:h-24 xl:h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 px-2 text-xs font-bold transition shrink-0 ${
                isNewGroupTargeted
                  ? "border-amber-400 bg-amber-500/20 text-amber-200 scale-105"
                  : "border-emerald-500/50 bg-emerald-950/40 text-emerald-300/80"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span className="text-[10px] uppercase tracking-wider text-center leading-tight">
                New Group
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
