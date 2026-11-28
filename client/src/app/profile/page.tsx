"use client";

import {
  ArrowLeft,
  Check,
  Edit3,
  History,
  RefreshCw,
  Save,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useFriendsStore } from "../../store/useFriendsStore";
import { MatchHistoryItem } from "../../types";

const AVATAR_PRESET_SEEDS = [
  "Ace",
  "Royal",
  "Joker",
  "Spades",
  "Ruby",
  "Gold",
  "Lucky",
  "Vegas",
];

function extractAvatarSeed(profileImage: string | undefined, fallback: string): string {
  if (!profileImage) return fallback;
  try {
    const url = new URL(profileImage);
    const seed = url.searchParams.get("seed");
    return seed ? decodeURIComponent(seed) : fallback;
  } catch {
    return fallback;
  }
}

export default function ProfilePage() {
  const { user, isAuthenticated, initAuth, updateUser } = useAuthStore();
  const {
    friends,
    pendingRequests,
    loading: refreshingFriends,
    fetchFriends,
    sendFriendRequest,
    respondFriendRequest,
  } = useFriendsStore();

  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [searchUsername, setSearchUsername] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  // Edit profile state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editAvatarSeed, setEditAvatarSeed] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const showNotice = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    setMessage({ text, tone });
    setTimeout(() => setMessage(null), 3500);
  }, []);

  const loadFriends = useCallback(() => {
    void fetchFriends();
  }, [fetchFriends]);

  const loadHistory = useCallback(() => {
    api
      .getHistory()
      .then((res) => setHistory(res.history ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadFriends();
    loadHistory();
    const interval = setInterval(loadFriends, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, loadFriends, loadHistory]);

  const startEditingProfile = () => {
    if (!user) return;
    setEditUsername(user.username);
    setEditAvatarSeed(extractAvatarSeed(user.profileImage, user.username));
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmedName = editUsername.trim();
    const trimmedSeed = editAvatarSeed.trim() || trimmedName;

    if (trimmedName.length < 3 || trimmedName.length > 20) {
      showNotice("Username must be between 3 and 20 characters", "err");
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.updateProfile({
        username: trimmedName,
        avatarSeed: trimmedSeed,
      });
      updateUser(res.user, res.token);
      setIsEditingProfile(false);
      showNotice("Profile updated successfully!", "ok");
    } catch (err: unknown) {
      showNotice(
        err instanceof Error ? err.message : "Failed to update profile",
        "err"
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchUsername.trim()) return;
    try {
      await sendFriendRequest(searchUsername.trim());
      showNotice(`Friend request sent to ${searchUsername.trim()}!`, "ok");
      setSearchUsername("");
    } catch (err: unknown) {
      showNotice(
        err instanceof Error ? err.message : "Failed to send friend request",
        "err"
      );
    }
  };

  const handleRespond = async (requestId: string, action: "ACCEPT" | "REJECT") => {
    try {
      await respondFriendRequest(requestId, action === "REJECT" ? "DECLINE" : "ACCEPT");
      showNotice(
        action === "ACCEPT" ? "Friend request accepted!" : "Friend request declined.",
        "ok"
      );
    } catch (err: unknown) {
      showNotice(
        err instanceof Error ? err.message : "Failed to respond to request",
        "err"
      );
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-4">
        <p className="text-sm text-zinc-400 mb-4">
          Please log in to view your profile and friends.
        </p>
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
  const wins = history.filter((h) => Boolean(h?.isWinner)).length;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  const previewAvatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
    editAvatarSeed.trim() || editUsername.trim() || user.username
  )}`;

  const sortedFriends = [...friends].sort((a, b) => Number(b.isOnline) - Number(a.isOnline));

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
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-amber-500/30 shadow-2xl mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-amber-400 shadow-xl shrink-0">
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

            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1 flex-wrap">
                <h1 className="text-2xl font-black text-white">{user.username}</h1>
                <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  {user.isGuest ? "Guest Player" : "Registered User"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-3">
                {user.email || "No email linked (guest account)"}
              </p>
              {!isEditingProfile && (
                <button
                  type="button"
                  onClick={startEditingProfile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-amber-300 border border-amber-500/30 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile & Avatar</span>
                </button>
              )}
            </div>

            {/* Quick Stats Grid */}
            <div className="flex items-center gap-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
              <div className="text-center px-2">
                <div className="text-lg font-black text-white">{totalMatches}</div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Matches
                </span>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-center px-2">
                <div className="text-lg font-black text-emerald-400">{wins}</div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Wins
                </span>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-center px-2">
                <div className="text-lg font-black text-amber-400">{winRate}%</div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Win Rate
                </span>
              </div>
            </div>
          </div>

          {/* Inline Edit Profile Panel */}
          {isEditingProfile && (
            <form
              onSubmit={handleSaveProfile}
              className="mt-6 pt-5 border-t border-zinc-800 space-y-4"
            >
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-emerald-400 shrink-0 bg-zinc-950">
                  <Image
                    src={previewAvatarUrl}
                    alt="Avatar Preview"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      minLength={3}
                      maxLength={20}
                      required
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Avatar Seed
                    </label>
                    <input
                      type="text"
                      value={editAvatarSeed}
                      onChange={(e) => setEditAvatarSeed(e.target.value)}
                      maxLength={40}
                      placeholder="Any word or seed"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Quick Avatar Presets
                </span>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_PRESET_SEEDS.map((seed) => (
                    <button
                      key={seed}
                      type="button"
                      onClick={() => setEditAvatarSeed(seed)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                        editAvatarSeed === seed
                          ? "bg-amber-500 text-zinc-950 border-amber-400 font-bold"
                          : "bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      {seed}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingProfile ? "Saving..." : "Save Profile"}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`mb-6 p-3 rounded-xl text-xs font-semibold text-center border ${
              message.tone === "err"
                ? "bg-red-500/20 border-red-500/40 text-red-200"
                : "bg-amber-500/20 border-amber-500/40 text-amber-300"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Friends Section */}
          <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Users className="w-4 h-4" />
                <span>Friends & Connections</span>
              </div>
              <button
                type="button"
                onClick={loadFriends}
                disabled={refreshingFriends}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-semibold text-zinc-400 hover:text-white transition"
                title="Refresh online status"
              >
                <RefreshCw
                  className={`w-3 h-3 ${refreshingFriends ? "animate-spin" : ""}`}
                />
                <span>Refresh</span>
              </button>
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
                  {pendingRequests.map((req) => {
                    const senderName = req.sender?.username ?? "Unknown player";
                    return (
                      <div
                        key={req.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs"
                      >
                        <span className="text-white font-medium">{senderName}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRespond(req.id, "ACCEPT")}
                            className="p-1.5 rounded-lg bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50"
                            aria-label={`Accept ${senderName}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRespond(req.id, "REJECT")}
                            className="p-1.5 rounded-lg bg-red-600/30 text-red-300 hover:bg-red-600/50"
                            aria-label={`Reject ${senderName}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Friends List */}
            <div>
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 block">
                Friends List ({sortedFriends.length})
              </span>
              {sortedFriends.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center">
                  No friends added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {sortedFriends.map((f) => {
                    const friendName = f.friendUser?.username ?? "Unknown player";
                    const online = Boolean(f.isOnline);
                    return (
                      <div
                        key={f.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              online
                                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                                : "bg-zinc-600"
                            }`}
                          />
                          <span className="text-white font-medium truncate">
                            {friendName}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            online
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-zinc-900 text-zinc-500 border-zinc-800"
                          }`}
                        >
                          {online ? "Online" : "Offline"}
                        </span>
                      </div>
                    );
                  })}
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
              <p className="text-xs text-zinc-500 py-8 text-center">
                No games played yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {history.map((item) => {
                  const roomTitle = item.game?.room?.roomName ?? "Rummy Table";
                  const dateLabel = item.createdAt
                    ? new Date(item.createdAt).toLocaleDateString()
                    : "Recent";
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="text-white font-bold">{roomTitle}</div>
                        <span className="text-[10px] text-zinc-400">{dateLabel}</span>
                      </div>
                      <div className="text-right font-mono">
                        <div
                          className={`font-bold ${
                            item.isWinner ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {item.isWinner ? "0 pts (Win)" : `+${item.points} pts`}
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {item.hasDropped ? "Dropped" : "Finished"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
