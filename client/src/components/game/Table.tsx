"use client";

import { Award, CheckCircle2, ChevronRight, Copy, LogOut, Trophy, Volume2 } from "lucide-react";
import React, { useState } from "react";
import { CardHand } from "@/components/game/CardHand";
import { DeckPiles } from "@/components/game/DeckPiles";
import { DeclareModal } from "@/components/game/DeclareModal";
import { VideoOverlay } from "@/components/video/VideoOverlay";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";

interface TableProps {
  roomCode: string;
  onDraw: (source: "CLOSED" | "DISCARD") => void;
  onDiscard: (cardId: string) => void;
  onDeclare: (melds: any[], declareCardId: string) => void;
  onDrop: () => void;
  onSort: (by: "SUIT" | "RANK") => void;
  onExit: () => void;
}

export const Table: React.FC<TableProps> = ({
  roomCode,
  onDraw,
  onDiscard,
  onDeclare,
  onDrop,
  onSort,
  onExit,
}) => {
  const user = useAuthStore((s) => s.user);
  const { gameState, showDeclareModal, setShowDeclareModal, error } = useGameStore();
  const [copiedCode, setCopiedCode] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isRoundEnd = gameState?.status === "ROUND_END";

  return (
    <div className="relative w-full min-h-screen flex flex-col justify-between bg-zinc-950 text-white overflow-hidden">
      {/* Declare Modal */}
      {showDeclareModal && (
        <DeclareModal
          onConfirmDeclare={onDeclare}
          onClose={() => setShowDeclareModal(false)}
        />
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600/95 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-2xl border border-red-400 animate-bounce">
          {error}
        </div>
      )}

      {/* Top Game Navigation Bar */}
      <header className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-600/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-bold text-emerald-300">Live Table</span>
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
            <span className="text-xs text-zinc-400 font-medium">Room:</span>
            <span className="text-xs font-mono font-bold text-amber-400">{roomCode}</span>
            <button
              onClick={copyCode}
              className="text-zinc-400 hover:text-white p-0.5 ml-1 transition"
              title="Copy Room Code"
            >
              {copiedCode ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <span className="hidden sm:inline text-xs font-semibold text-zinc-400">
            Round {gameState?.roundNumber || 1}
          </span>
        </div>

        {/* Turn Timer Countdown Bar */}
        {gameState && gameState.status === "PLAYING" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium hidden sm:inline">Timer:</span>
            <div className="flex items-center gap-1.5 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-700">
              <span
                className={`text-xs font-black font-mono ${
                  gameState.turnTimeRemainingSeconds <= 10
                    ? "text-red-400 animate-pulse"
                    : "text-amber-400"
                }`}
              >
                {gameState.turnTimeRemainingSeconds}s
              </span>
            </div>
          </div>
        )}

        {/* Exit & Sound Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onExit}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-red-950 text-xs font-semibold text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-600/40 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </header>

      {/* Center Table Surface */}
      <main className="relative flex-1 flex flex-col items-center justify-between p-2 sm:p-4 bg-felt-pattern border-y-4 border-amber-600/30 shadow-inner">
        {/* Perimeter LiveKit Video Tiles */}
        <div className="w-full z-20">
          <VideoOverlay roomCode={roomCode} />
        </div>

        {/* Center Deck Piles and Wild Joker */}
        <div className="my-auto py-2 z-10">
          <DeckPiles onDraw={onDraw} />
        </div>

        {/* Round End Scores Overlay */}
        {isRoundEnd && gameState.roundScores && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-md rounded-2xl bg-gradient-to-b from-zinc-900 to-zinc-950 border border-amber-500/50 p-6 shadow-2xl flex flex-col items-center">
              <div className="p-3 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 mb-3">
                <Trophy className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-white tracking-wide">Round Finished!</h2>
              <p className="text-xs text-zinc-400 mb-4">Official Points & Penalty Breakdown</p>

              {/* Scores List */}
              <div className="w-full space-y-2 mb-6">
                {Object.entries(gameState.roundScores).map(([playerId, scoreInfo]) => {
                  const player = gameState.players.find((p) => p.id === playerId);
                  const isWinner = scoreInfo.points === 0;

                  return (
                    <div
                      key={playerId}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        isWinner
                          ? "bg-amber-500/10 border-amber-500/50 shadow-md"
                          : "bg-zinc-900 border-zinc-800"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white">
                            {player?.username || playerId}
                          </span>
                          {isWinner && (
                            <span className="bg-amber-400 text-zinc-950 text-[9px] font-black px-1.5 rounded">
                              WINNER
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-400">{scoreInfo.reason}</span>
                      </div>

                      <div className="text-right font-mono">
                        <strong
                          className={`text-sm ${
                            isWinner ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          +{scoreInfo.points} pts
                        </strong>
                        <div className="text-[10px] text-zinc-500">
                          Total: {scoreInfo.totalScore}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={onExit}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Player Hand & Toolbar */}
      <footer className="w-full bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 z-30">
        <CardHand
          onDiscard={onDiscard}
          onDeclare={() => setShowDeclareModal(true)}
          onDrop={onDrop}
          onSort={onSort}
        />
      </footer>
    </div>
  );
};
