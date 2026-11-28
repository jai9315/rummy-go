"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Clock,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { getPlayerInitials } from "@/components/video/VideoTile";
import { useFriendsStore } from "../../store/useFriendsStore";

interface FriendsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const FriendsDrawer: React.FC<FriendsDrawerProps> = ({
  open,
  onClose,
}) => {
  const {
    friends,
    pendingRequests,
    outgoingRequests,
    loading,
    fetchFriends,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
  } = useFriendsStore();

  const [usernameInput, setUsernameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    text: string;
    tone: "ok" | "err";
  } | null>(null);

  useEffect(() => {
    if (open) {
      void fetchFriends();
    }
  }, [open, fetchFriends]);

  const showToast = (text: string, tone: "ok" | "err") => {
    setFeedback({ text, tone });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = usernameInput.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await sendFriendRequest({ username: trimmed });
      setUsernameInput("");
      showToast(`Friend request sent to ${trimmed}!`, "ok");
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Failed to send friend request",
        "err"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (
    requestId: string,
    action: "ACCEPT" | "DECLINE"
  ) => {
    setBusyId(requestId);
    try {
      await respondFriendRequest(requestId, action);
      showToast(
        action === "ACCEPT"
          ? "Friend request accepted!"
          : "Friend request declined.",
        "ok"
      );
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Failed to update request",
        "err"
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (friendshipId: string, name: string) => {
    setBusyId(friendshipId);
    try {
      await removeFriend(friendshipId);
      showToast(`Removed ${name} from friends.`, "ok");
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Failed to remove friend",
        "err"
      );
    } finally {
      setBusyId(null);
    }
  };

  const onlineFriends = friends.filter((f) => f.isOnline);
  const offlineFriends = friends.filter((f) => !f.isOnline);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[75] flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Friends Panel"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          {/* Slide-over Royal 13 Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[#d4af37]/35 bg-gradient-to-b from-[#071915] via-[#07111a] to-[#050910] text-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/15 border border-amber-400/35 text-[#f6e09e]">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-wide text-white">
                    Friends
                  </h2>
                  <p className="text-[11px] text-emerald-300/90 font-semibold">
                    {onlineFriends.length} online • {friends.length} total
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void fetchFriends()}
                  disabled={loading}
                  title="Refresh friends list"
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close friends drawer"
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Add Friend by Username */}
            <div className="border-b border-white/10 px-5 py-3.5 bg-black/20">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
                Add Friend by Username
              </label>
              <form onSubmit={handleAddFriend} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Enter exact username..."
                    className="w-full rounded-xl border border-white/15 bg-slate-950/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-[#d4af37] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !usernameInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#f6e09e] to-[#d4af37] px-3.5 py-2 text-xs font-black text-slate-950 shadow hover:brightness-110 disabled:opacity-50 transition"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{submitting ? "..." : "Add"}</span>
                </button>
              </form>

              {feedback && (
                <div
                  className={`mt-2.5 rounded-xl px-3 py-2 text-[11px] font-semibold border ${
                    feedback.tone === "ok"
                      ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
                      : "bg-rose-500/15 border-rose-400/40 text-rose-200"
                  }`}
                >
                  {feedback.text}
                </div>
              )}
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Incoming Pending Requests */}
              {pendingRequests.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Pending Requests</span>
                      <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950 leading-none">
                        {pendingRequests.length}
                      </span>
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {pendingRequests.map((req) => {
                      const sender = req.sender ?? req.requester;
                      const senderName = sender?.username ?? "Unknown player";
                      const isBusy = busyId === req.id;

                      return (
                        <div
                          key={req.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d4af37]/70 bg-slate-900 text-[11px] font-bold text-[#f6e09e]">
                              {getPlayerInitials(senderName)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-bold text-white">
                                {senderName}
                              </div>
                              <div className="text-[10px] text-amber-200/80">
                                Wants to be your friend
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRespond(req.id, "ACCEPT")}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-2.5 py-1.5 text-[11px] font-extrabold text-slate-950 transition disabled:opacity-50"
                            >
                              <Check className="h-3 w-3 stroke-[3]" />
                              <span>Accept</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRespond(req.id, "DECLINE")}
                              className="rounded-lg border border-white/15 bg-white/5 hover:bg-rose-500/20 hover:border-rose-400/40 hover:text-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Outgoing Sent Requests */}
              {outgoingRequests.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    <span>Sent Requests ({outgoingRequests.length})</span>
                  </h3>
                  <div className="space-y-1.5">
                    {outgoingRequests.map((req) => {
                      const target = req.receiver ?? req.addressee;
                      const targetName = target?.username ?? "Player";
                      return (
                        <div
                          key={req.id}
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                        >
                          <span className="truncate text-xs font-semibold text-slate-200">
                            {targetName}
                          </span>
                          <span className="rounded-full bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                            Pending
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Online Friends */}
              <section>
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span>Online Friends ({onlineFriends.length})</span>
                </h3>

                {onlineFriends.length === 0 ? (
                  <p className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 text-center text-xs text-slate-500">
                    No friends online right now.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {onlineFriends.map((f) => {
                      const friendUser = f.friendUser;
                      const name = friendUser?.username ?? "Unknown";
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/30 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/60 bg-slate-900 text-[11px] font-bold text-[#f6e09e]">
                              {getPlayerInitials(name)}
                              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-bold text-white">
                                {name}
                              </div>
                              <div className="text-[10px] font-semibold text-emerald-300">
                                {f.inRoomCode
                                  ? `In Table #${f.inRoomCode}`
                                  : "Online"}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={busyId === f.id}
                            onClick={() => handleRemove(f.id, name)}
                            title={`Remove ${name}`}
                            aria-label={`Remove ${name}`}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Offline Friends */}
              <section>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-500" />
                  <span>Offline Friends ({offlineFriends.length})</span>
                </h3>

                {offlineFriends.length === 0 && onlineFriends.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-500">
                    Add friends by username above or tap <strong className="text-amber-300">+</strong> on players in any waiting room!
                  </p>
                ) : offlineFriends.length === 0 ? (
                  <p className="text-xs text-slate-500 px-1">
                    All your friends are currently online!
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {offlineFriends.map((f) => {
                      const name = f.friendUser?.username ?? "Unknown";
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-slate-900/90 text-[11px] font-bold text-slate-400">
                              {getPlayerInitials(name)}
                              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-slate-500" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-300">
                                {name}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Offline
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={busyId === f.id}
                            onClick={() => handleRemove(f.id, name)}
                            title={`Remove ${name}`}
                            aria-label={`Remove ${name}`}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-rose-500/15 hover:text-rose-300 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
