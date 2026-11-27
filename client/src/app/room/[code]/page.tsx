"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Lock,
  Sparkles,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Table } from "@/components/game/Table";
import { InviteToast } from "@/components/lobby/InviteToast";
import { LobbyView } from "@/components/lobby/LobbyView";
import { useSocket } from "@/hooks/useSocket";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useGameStore } from "@/store/useGameStore";
import { RoomInfo } from "@/types";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = ((params?.code as string) || "").toUpperCase();

  const { user, isAuthenticated, isLoading, initAuth, setUserSession } =
    useAuthStore();
  const {
    gameState,
    lobbyPlayers,
    error: socketError,
    kickedMessage,
    setError,
    resetGame,
  } = useGameStore();

  const [roomData, setRoomData] = useState<RoomInfo | null>(null);
  const [roomLoading, setRoomLoading] = useState<boolean>(true);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isRoomNotFound, setIsRoomNotFound] = useState<boolean>(false);

  const [guestName, setGuestName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [submittedPassword, setSubmittedPassword] = useState<string | undefined>(
    undefined
  );
  const [joiningGuest, setJoiningGuest] = useState(false);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Fetch room metadata
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    setRoomLoading(true);
    setRoomError(null);
    setIsRoomNotFound(false);

    api
      .getRoom(roomCode)
      .then((res) => {
        if (cancelled) return;
        setRoomData(res.room);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setIsRoomNotFound(true);
          setRoomError(err.message || "Room not found or code is invalid");
        } else if (err instanceof Error) {
          setRoomError(err.message || "Failed to load room");
        } else {
          setRoomError("Failed to load room");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRoomLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  const isRoomHost = Boolean(
    roomData?.host?.id && user?.id && roomData.host.id === user.id
  );
  const isInRoom = Boolean(
    gameState || lobbyPlayers.some((p) => p.userId === user?.id)
  );
  const canAutoJoin = Boolean(
    isAuthenticated &&
      !roomLoading &&
      !isRoomNotFound &&
      !kickedMessage &&
      (!roomData?.hasPassword || isRoomHost || Boolean(submittedPassword))
  );

  // Initialize socket hook
  const {
    joinRoom,
    leaveRoom,
    kickPlayer,
    toggleReady,
    startGame,
    nextRound,
    returnToLobby,
    drawCard,
    discardCard,
    declareGame,
    submitMelds,
    dropGame,
    sortHand,
    inviteFriend,
  } = useSocket(roomCode, {
    autoJoin: canAutoJoin,
    password: submittedPassword,
  });

  // Guest Join Action for friends opening invite link directly
  const handleQuickGuestJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRoomNotFound) return;
    setJoiningGuest(true);
    setRoomError(null);
    try {
      if (roomData?.hasPassword && roomPassword.trim()) {
        setSubmittedPassword(roomPassword.trim());
      }
      const res = await api.guestLogin({ displayName: guestName });
      setUserSession(res.user, res.token);
    } catch (err: unknown) {
      setRoomError(
        err instanceof Error ? err.message : "Failed to join as guest"
      );
    } finally {
      setJoiningGuest(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pwd = roomPassword.trim();
    if (!pwd) {
      setError("Please enter the room password");
      return;
    }
    setError(null);
    setSubmittedPassword(pwd);
    joinRoom(pwd);
  };

  const handleExitRoom = () => {
    leaveRoom();
    resetGame();
    router.push("/");
  };

  const handleGoHome = () => {
    resetGame();
    router.push("/");
  };

  const combinedError = roomError || socketError;

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

          {combinedError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-600/20 border border-red-500/50 text-red-200 text-xs font-semibold flex items-center justify-center gap-2 text-center"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{combinedError}</span>
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
                disabled={isRoomNotFound || joiningGuest}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {roomData?.hasPassword && !isRoomNotFound && (
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Room Password
                </label>
                <input
                  type="password"
                  placeholder="Enter table password"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  required
                  disabled={joiningGuest}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 disabled:opacity-50"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={joiningGuest || isRoomNotFound}
              className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 ${
                isRoomNotFound
                  ? "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-zinc-950 shadow-lg shadow-amber-500/20"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isRoomNotFound
                  ? "Room Not Found"
                  : joiningGuest
                  ? "Entering Room..."
                  : "Join Table Now"}
              </span>
              {!isRoomNotFound && <ArrowRight className="w-4 h-4" />}
            </button>

            {isRoomNotFound && (
              <button
                type="button"
                onClick={handleGoHome}
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Home</span>
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  // Authenticated user kicked by host
  if (kickedMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-4">
        <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-red-500/40 p-6 sm:p-8 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Removed from Room</h2>
          <p className="text-xs text-red-200 mb-6">{kickedMessage}</p>
          <button
            onClick={handleGoHome}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    );
  }

  // Authenticated user landed on a non-existent room (404)
  if (isRoomNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-4">
        <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-red-500/40 p-6 sm:p-8 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Room Not Found</h2>
          <p className="text-xs text-red-200 mb-6">
            {combinedError || `Room ${roomCode} does not exist.`}
          </p>
          <button
            onClick={handleGoHome}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
        </div>
      </div>
    );
  }

  // Authenticated user joining a password-protected room (non-host, not yet joined)
  if (roomData?.hasPassword && !isRoomHost && !isInRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-4">
        <div className="w-full max-w-md rounded-3xl bg-zinc-900 border border-amber-500/40 p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-white">Password Required</h2>
            <p className="text-xs text-zinc-400 mt-1">
              {roomData.roomName} ({roomCode}) is protected by a room password.
            </p>
          </div>

          {combinedError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-600/20 border border-red-500/50 text-red-200 text-xs font-semibold flex items-center justify-center gap-2 text-center"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{combinedError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="Enter room password"
              value={roomPassword}
              onChange={(e) => setRoomPassword(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2"
            >
              <span>Unlock & Join Room</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleGoHome}
              className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active game, Show phase, Round End, or Game Over: render Table
  if (
    gameState &&
    (gameState.status === "PLAYING" ||
      gameState.status === "DEALING" ||
      gameState.status === "SHOW" ||
      gameState.status === "DECLARED" ||
      gameState.status === "ROUND_END" ||
      gameState.status === "GAME_OVER")
  ) {
    return (
      <div className="h-[100dvh] w-full overflow-hidden">
        <InviteToast />
        <Table
          roomCode={roomCode}
          onDraw={drawCard}
          onDiscard={discardCard}
          onDeclare={declareGame}
          onSubmitMelds={submitMelds}
          onNextRound={nextRound}
          onReturnToLobby={returnToLobby}
          onDrop={dropGame}
          onSort={sortHand}
          onExit={handleExitRoom}
        />
      </div>
    );
  }

  // Default: Lobby Waiting Room
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center">
      <InviteToast />
      <LobbyView
        roomCode={roomCode}
        roomData={roomData}
        roomError={roomError}
        onToggleReady={toggleReady}
        onStartGame={startGame}
        onKickPlayer={kickPlayer}
        onInviteFriend={inviteFriend}
        onLeaveRoom={handleExitRoom}
      />
    </div>
  );
}
