"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Check, Sparkles, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { getActiveSocket } from "../../lib/socketRegistry";
import { useGameStore } from "../../store/useGameStore";

const AUTO_DISMISS_SECONDS = 30;

export const RoomInviteToast: React.FC = () => {
  const router = useRouter();
  const pendingInvite = useGameStore((s) => s.pendingInvite);
  const clearPendingInvite = useGameStore((s) => s.clearPendingInvite);
  const [secondsLeft, setSecondsLeft] = useState<number>(AUTO_DISMISS_SECONDS);

  // Auto-dismiss after 30 seconds with live countdown
  useEffect(() => {
    if (!pendingInvite) {
      setSecondsLeft(AUTO_DISMISS_SECONDS);
      return;
    }

    const startedAt = pendingInvite.timestamp || Date.now();
    const updateRemaining = () => {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, AUTO_DISMISS_SECONDS - elapsedSec);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearPendingInvite();
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 500);
    return () => clearInterval(interval);
  }, [pendingInvite, clearPendingInvite]);

  const handleJoinTable = () => {
    if (!pendingInvite) return;
    const { inviteId, roomCode } = pendingInvite;
    const activeSocket = getActiveSocket();
    if (activeSocket && activeSocket.connected) {
      activeSocket.emit("ACCEPT_ROOM_INVITE", {
        inviteId,
        roomCode,
      });
    }
    clearPendingInvite();
    router.push(`/room/${roomCode}?invited=1`);
  };

  const fromName =
    pendingInvite?.fromUser?.name || pendingInvite?.fromUsername || "A friend";
  const poolTarget = pendingInvite?.targetPoints ?? 101;
  const progressPct = Math.max(
    0,
    Math.min(100, (secondsLeft / AUTO_DISMISS_SECONDS) * 100)
  );

  return (
    <AnimatePresence>
      {pendingInvite && (
        <motion.div
          initial={{ opacity: 0, y: -28, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 360, damping: 28 }}
          role="dialog"
          aria-label="Direct Room Invitation"
          className="fixed top-4 right-4 z-[85] w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#d4af37]/60 bg-gradient-to-br from-[#07261c]/95 via-[#081a18]/95 to-[#060c14]/95 text-white shadow-[0_20px_50px_rgba(0,0,0,0.75),0_0_24px_rgba(212,175,55,0.22)] backdrop-blur-xl"
        >
          {/* Top Gold Shimmer Progress Bar (30s auto-dismiss) */}
          <div className="h-1 w-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-[#f6e09e] via-[#d4af37] to-emerald-400 transition-[width] duration-500 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f6e09e]/25 to-[#d4af37]/15 text-[#f6e09e] border border-[#d4af37]/45 shadow-inner">
                <BellRing className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#f6e09e]">
                    <Sparkles className="h-3 w-3" />
                    Direct Table Invite
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {secondsLeft}s
                  </span>
                </div>

                <p className="mt-1 text-sm font-semibold leading-snug text-white">
                  <span className="font-extrabold text-[#f6e09e]">
                    {fromName}
                  </span>{" "}
                  invited you to a{" "}
                  <span className="font-bold text-emerald-300">
                    Pool {poolTarget}
                  </span>{" "}
                  Rummy table!
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-emerald-100/80">
                  <span className="truncate font-semibold text-white/90">
                    {pendingInvite.roomName || `Table ${pendingInvite.roomCode}`}
                  </span>
                  {typeof pendingInvite.playerCount === "number" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      <Users className="h-2.5 w-2.5" />
                      {pendingInvite.playerCount}/{pendingInvite.maxPlayers ?? 6}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={clearPendingInvite}
                aria-label="Decline invitation"
                className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleJoinTable}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#f6e09e] via-[#e4c158] to-[#d4af37] px-3.5 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/25 hover:brightness-110 transition"
              >
                <Check className="h-3.5 w-3.5 stroke-[3]" />
                <span>Join Table</span>
              </button>
              <button
                type="button"
                onClick={clearPendingInvite}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"
              >
                Decline
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
