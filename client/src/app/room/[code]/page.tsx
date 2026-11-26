"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Table } from "@/components/game/Table";
import { LobbyView } from "@/components/lobby/LobbyView";
import { useSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = ((params?.code as string) || "").toUpperCase();

  const { user, isAuthenticated, isLoading, initAuth, setUserSession } = useAuthStore();
  const { gameState, resetGame } = useGameStore();

  const [roomData, setRoomData] = useState<any>(null);
  const [guestName, setGuestName] = useState("");
  const [joiningGuest, setJoiningGuest] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Initialize socket hook
  const {
    toggleReady,
    startGame,
    drawCard,
    discardCard,
    declareGame,
    dropGame,
    sortHand,
  } = useSocket(roomCode);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Fetch room metadata
  useEffect(() => {
    if (!roomCode) return;
    api
      .getRoom(roomCode)
      .then((res) => setRoomData(res.room))
      .catch((err) => setRoomError(err.message || "Failed to load room"));
  }, [roomCode]);

  // Guest Join Action for friends opening invite link directly
  const handleQuickGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoiningGuest(true);
    try {
      const res = await api.guestLogin({ displayName: guestName });
      setUserSession(res.user, res.token);
    } catch (err: any) {
      setRoomError(err.message || "Failed to join as guest");
    } finally {
      setJoiningGuest(false);
    }
  };

  const handleExitRoom = () => {
    resetGame();
    router.push("/");
  };

  // If loading authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-amber-400 font-bold">
        Loading Rummy Room...
      </div>
    );
  }

  // If user is not yet authenticated, show 1-click guest name prompt for instant invite joining
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950 via-zinc-950 to-black p-4">
        <div className="w-full max-w-md rounded-3xl bg-zinc-900/90 border border-amber-500/30 p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-6">
            <span className="text-3xl mb-1">♠♥♦♣</span>
            <h2 className="text-2xl font-black text-white">Join Rummy Table</h2>
            <p className="text-xs text-amber-400 font-mono mt-1 font-bold">
              Room Code: {roomCode}
            </p>
          </div>

          {roomError && (
            <div className="mb-4 p-3 rounded-xl bg-red-600/20 border border-red-500/50 text-red-300 text-xs font-semibold text-center">
              {roomError}
            </div>
          )}

          <form onSubmit={handleQuickGuestJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
                Enter Your Player Name
              </label>
              <input
                type="text"
                placeholder="e.g. AceOfHearts"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={15}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={joiningGuest}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-zinc-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{joiningGuest ? "Entering Room..." : "Join Table Now"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active game in progress: render Table
  if (gameState && (gameState.status === "PLAYING" || gameState.status === "DEALING" || gameState.status === "ROUND_END")) {
    return (
      <Table
        roomCode={roomCode}
        onDraw={drawCard}
        onDiscard={discardCard}
        onDeclare={declareGame}
        onDrop={dropGame}
        onSort={sortHand}
        onExit={handleExitRoom}
      />
    );
  }

  // Default: Lobby Waiting Room
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center">
      <LobbyView
        roomCode={roomCode}
        roomData={roomData}
        onToggleReady={toggleReady}
        onStartGame={startGame}
      />
    </div>
  );
}
