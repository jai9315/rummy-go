"use client";

import { ArrowLeft, Check, History, Shield, Trophy, UserPlus, Users, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";

export default function ProfilePage() {
  const { user, isAuthenticated, initAuth } = useAuthStore();
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [searchUsername, setSearchUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      loadFriends();
      loadHistory();
    }
  }, [isAuthenticated]);

  const loadFriends = () => {
    api
      .getFriends()
      .then((res) => {
        setFriends(res.friends);
        setPendingRequests(res.pendingRequests);
      })
      .catch(() => {});
  };

  const loadHistory = () => {
    api
      .getHistory()
      .then((res) => setHistory(res.history))
      .catch(() => {});
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchUsername.trim()) return;
    try {
      await api.sendFriendRequest(searchUsername.trim());
      setMessage(`Friend request sent to ${searchUsername}!`);
      setSearchUsername("");
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage(err.message || "Failed to send friend request");
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleRespond = async (requestId: string, action: "ACCEPT" | "REJECT") => {
    try {
      await api.respondFriendRequest(requestId, action);
      loadFriends();
    } catch (err: any) {
      console.error(err);
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-4">
        <p className="text-sm text-zinc-400 mb-4">Please log in to view your profile and friends.</p>
        <Link
          href="/login"
          className="px-6 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs uppercase"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  const totalMatches = history.length;
  const wins = history.filter((h) => h.isWinner).length;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950 via-zinc-950 to-black text-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>

        {/* Profile Card */}
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-amber-500/30 shadow-2xl mb-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-amber-400 shadow-xl">
            <Image
              src={user.profileImage || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`}
              alt={user.username}
              fill
              className="object-cover"
            />
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <h1 className="text-2xl font-black text-white">{user.username}</h1>
              <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                {user.isGuest ? "Guest Player" : "Registered User"}
              </span>
            </div>
            <p className="text-xs text-zinc-400">{user.email || "No email linked (guest account)"}</p>
          </div>

          {/* Quick Stats Grid */}
          <div className="flex items-center gap-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
            <div className="text-center px-2">
              <div className="text-lg font-black text-white">{totalMatches}</div>
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Matches</span>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div className="text-center px-2">
              <div className="text-lg font-black text-emerald-400">{wins}</div>
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Wins</span>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div className="text-center px-2">
              <div className="text-lg font-black text-amber-400">{winRate}%</div>
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Win Rate</span>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className="mb-6 p-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold text-center">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Friends Section */}
          <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-4">
              <Users className="w-4 h-4" />
              <span>Friends & Connections</span>
            </div>

            {/* Add Friend Input */}
            <form onSubmit={handleSendRequest} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Enter exact username"
                value={searchUsername}
                onChange={(e) => setSearchUsername(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs flex items-center gap-1 hover:bg-amber-400 transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div className="mb-4">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 block">
                  Pending Friend Requests ({pendingRequests.length})
                </span>
                <div className="space-y-2">
                  {pendingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs"
                    >
                      <span className="text-white font-medium">{req.sender.username}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRespond(req.id, "ACCEPT")}
                          className="p-1.5 rounded-lg bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRespond(req.id, "REJECT")}
                          className="p-1.5 rounded-lg bg-red-600/30 text-red-300 hover:bg-red-600/50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends List */}
            <div>
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 block">
                Friends List ({friends.length})
              </span>
              {friends.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center">No friends added yet.</p>
              ) : (
                <div className="space-y-2">
                  {friends.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-white font-medium">{f.friendUser.username}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500">Connected</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Match History */}
          <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-4">
              <History className="w-4 h-4" />
              <span>Match History</span>
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-zinc-500 py-8 text-center">No games played yet.</p>
            ) : (
              <div className="space-y-2.5">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="text-white font-bold">
                        {item.game?.room?.roomName || "Rummy Table"}
                      </div>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <div className={`font-bold ${item.isWinner ? "text-emerald-400" : "text-red-400"}`}>
                        {item.isWinner ? "0 pts (Win)" : `+${item.points} pts`}
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {item.hasDropped ? "Dropped" : "Finished"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
