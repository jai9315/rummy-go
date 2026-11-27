"use client";

import {
  ArrowRight,
  BookOpen,
  History,
  LogOut,
  Plus,
  Shield,
  Sparkles,
  User as UserIcon,
  Users,
  Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { InviteToast } from "../components/lobby/InviteToast";
import { useSocket } from "../hooks/useSocket";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import { FriendItem, MatchHistoryItem } from "../types";

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, initAuth, logout } = useAuthStore();

  // Keep Socket.IO connected while authenticated for live online presence & room invitations
  useSocket(undefined, { autoJoin: false });

  const [joinCode, setJoinCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [roundCount, setRoundCount] = useState(1);
  const [turnTimeLimitSeconds, setTurnTimeLimitSeconds] = useState(30);
  const [entryPoints, setEntryPoints] = useState(80);
  const [roomPassword, setRoomPassword] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      api.getFriends().then((res) => setFriends(res.friends)).catch(() => {});
      api.getHistory().then((res) => setHistory(res.history)).catch(() => {});
    }
  }, [isAuthenticated]);

  const onlineFriendsCount = friends.filter((f) => f.isOnline).length;

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setActionLoading(true);

    try {
      if (!isAuthenticated) {
        const guestRes = await api.guestLogin({ displayName: "HostPlayer" });
        useAuthStore.getState().setUserSession(guestRes.user, guestRes.token);
      }

      const res = await api.createRoom({
        roomName: roomName || `${user?.username || "Player"}'s Room`,
        maxPlayers,
        roundCount,
        entryPoints,
        turnTimeLimitSeconds,
        password: roomPassword.trim() || undefined,
      });

      router.push(`/room/${res.room.roomCode}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length >= 4) {
      router.push(`/room/${joinCode.trim().toUpperCase()}`);
    }
  };

  const handleQuickPlay = async () => {
    setActionLoading(true);
    try {
      if (!isAuthenticated) {
        const guestRes = await api.guestLogin({ displayName: "CardPlayer" });
        useAuthStore.getState().setUserSession(guestRes.user, guestRes.token);
      }
      const res = await api.createRoom({
        roomName: "Quick Play Table",
        maxPlayers: 2,
      });
      router.push(`/room/${res.room.roomCode}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Quick Play failed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950 via-zinc-950 to-black text-white flex flex-col">
      <InviteToast />

      {/* Top Header */}
      <header className="w-full flex items-center justify-between px-6 py-4 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center text-amber-400 font-bold text-xl tracking-wider">
            <span className="text-xl mr-1">♠</span>
            <span>INDIAN RUMMY LIVE</span>
          </div>
          <span className="hidden sm:inline-block text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
            VIDEO CONFERENCING
          </span>
        </div>

        {/* User Profile Bar */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/profile"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-xs font-bold transition"
                title="View Profile & Friends"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Profile & Friends</span>
                <span className="sm:hidden">Profile</span>
                {onlineFriendsCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                    {onlineFriendsCount}
                  </span>
                )}
              </Link>

              <Link
                href="/profile"
                className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 hover:border-amber-500/40 rounded-xl px-3 py-1.5 transition"
                title="Open Profile"
              >
                <div className="relative w-7 h-7 rounded-full overflow-hidden border border-amber-400">
                  <Image
                    src={
                      user.profileImage ||
                      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                        user.username
                      )}`
                    }
                    alt={user.username}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-white leading-none">{user.username}</div>
                  <span className="text-[10px] text-zinc-400 font-medium">
                    {user.isGuest ? "Guest User" : "Member"}
                  </span>
                </div>
              </Link>

              <button
                onClick={logout}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 border border-zinc-800 transition"
                title="Log Out"
                aria-label="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs uppercase tracking-wider transition shadow-md shadow-amber-500/20"
            >
              Sign In / Guest
            </Link>
          )}
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 flex flex-col justify-center">
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-600/20 border border-red-500/50 text-red-300 text-xs font-semibold text-center">
            {error}
          </div>
        )}

        {/* Hero Banner */}
        <div className="relative rounded-3xl bg-gradient-to-r from-emerald-900/60 via-zinc-900/80 to-emerald-950/60 border border-amber-500/30 p-6 sm:p-10 shadow-2xl mb-8 overflow-hidden">
          <div className="relative z-10 max-w-xl">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                Classic 13-Card Indian Rummy
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
              Play Private Tables with Friends & Live Video
            </h1>
            <p className="text-sm text-zinc-300 leading-relaxed mb-6">
              Full WebRTC audio/video calling directly on the table, cryptographic card shuffling, and guaranteed private card security.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-300 text-zinc-950 font-extrabold text-xs uppercase tracking-wider transition shadow-xl shadow-amber-500/30 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Private Table</span>
              </button>

              <button
                onClick={handleQuickPlay}
                disabled={actionLoading}
                className="px-6 py-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider border border-zinc-700 transition flex items-center gap-2"
              >
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Quick Play</span>
              </button>
            </div>
          </div>

          {/* Decorative Card Illustration */}
          <div className="absolute right-4 -bottom-6 opacity-30 sm:opacity-90 hidden sm:flex items-center -space-x-8 rotate-12 pointer-events-none">
            <div className="w-24 h-36 rounded-xl bg-white shadow-2xl border flex flex-col justify-between p-2 text-red-600 font-bold">
              <span>A♥</span>
              <span className="text-3xl self-center">♥</span>
              <span className="self-end rotate-180">A♥</span>
            </div>
            <div className="w-24 h-36 rounded-xl bg-white shadow-2xl border flex flex-col justify-between p-2 text-zinc-900 font-bold -translate-y-4">
              <span>K♠</span>
              <span className="text-3xl self-center">♠</span>
              <span className="self-end rotate-180">K♠</span>
            </div>
            <div className="w-24 h-36 rounded-xl bg-white shadow-2xl border flex flex-col justify-between p-2 text-red-600 font-bold -translate-y-8">
              <span>Q♦</span>
              <span className="text-3xl self-center">♦</span>
              <span className="self-end rotate-180">Q♦</span>
            </div>
          </div>
        </div>

        {/* Action Grid: Join Room & Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Join by Code Card */}
          <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm uppercase tracking-wider mb-2">
                <Users className="w-4 h-4" />
                <span>Join with Code</span>
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                Have a 6-character room code from your friends? Enter it below.
              </p>
            </div>

            <form onSubmit={handleJoinByCode} className="space-y-3">
              <input
                type="text"
                placeholder="e.g. AB12CD"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-center font-mono text-base font-bold text-amber-300 tracking-widest placeholder-zinc-700 focus:outline-none focus:border-amber-400 uppercase"
              />
              <button
                type="submit"
                disabled={joinCode.length < 4}
                className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${
                  joinCode.length >= 4
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                }`}
              >
                <span>Enter Room</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Live Video Calling Info */}
          <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider mb-2">
                <Video className="w-4 h-4" />
                <span>Video & Audio Chat</span>
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                See and speak with your friends around the table in real-time while playing, with mute and camera controls.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
              <span className="text-[11px] text-zinc-400 font-medium">
                LiveKit WebRTC • Low Latency • Adaptive Bitrate
              </span>
            </div>
          </div>

          {/* Rules & Privacy Card */}
          <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm uppercase tracking-wider mb-2">
                <Shield className="w-4 h-4" />
                <span>Private Card Security</span>
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                Your 13 cards are protected on the server. Opponents can only see their own cards.
              </p>
            </div>
            <Link
              href="/rules"
              className="py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase tracking-wider border border-zinc-700 transition flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>Read Game Rules</span>
            </Link>
          </div>
        </div>

        {/* Recent Matches Section (if available) */}
        {history.length > 0 && (
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl mb-8">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
              <History className="w-4 h-4" />
              <span>Recent Match History</span>
            </div>
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs"
                >
                  <span className="text-white font-medium">
                    {h.game?.room?.roomName || "Rummy Table"}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={h.isWinner ? "text-emerald-400 font-bold" : "text-red-400"}>
                      {h.isWinner ? "Winner (0 pts)" : `+${h.points} pts`}
                    </span>
                    <span className="text-zinc-500 text-[10px]">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-amber-500/40 p-6 shadow-2xl my-auto">
            <h2 className="text-lg font-black text-white mb-1">Create Private Rummy Room</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Configure your table. An invitation code and share link will be generated.
            </p>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Room Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Friends Casino Night"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Maximum Players
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setMaxPlayers(num)}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        maxPlayers === num
                          ? "bg-amber-500 text-zinc-950 border-amber-400 shadow"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Rounds
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRoundCount(num)}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        roundCount === num
                          ? "bg-amber-500 text-zinc-950 border-amber-400 shadow"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                      }`}
                    >
                      {num} {num === 1 ? "Round" : "Rounds"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Turn Timer
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[20, 30, 45, 60].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setTurnTimeLimitSeconds(sec)}
                        className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                          turnTimeLimitSeconds === sec
                            ? "bg-amber-500 text-zinc-950 border-amber-400 shadow"
                            : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Entry Points
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[80, 100, 160, 200].map((pts) => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => setEntryPoints(pts)}
                        className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                          entryPoints === pts
                            ? "bg-amber-500 text-zinc-950 border-amber-400 shadow"
                            : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                        }`}
                      >
                        {pts} pts
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Room Password (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Leave blank for open invite link"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                <div className="flex justify-between">
                  <span>Game Type:</span>
                  <strong className="text-white">13-Card Points Rummy</strong>
                </div>
                <div className="flex justify-between">
                  <span>Turn Time Limit:</span>
                  <strong className="text-amber-300">{turnTimeLimitSeconds} Seconds</strong>
                </div>
                <div className="flex justify-between">
                  <span>Entry Points / Stake:</span>
                  <strong className="text-amber-300">{entryPoints} Points</strong>
                </div>
                <div className="flex justify-between">
                  <span>Drops:</span>
                  <strong className="text-white">First 20 pts • Middle 40 pts</strong>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase tracking-wider transition shadow-lg shadow-amber-500/20"
                >
                  {actionLoading ? "Creating..." : "Create & Play"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
