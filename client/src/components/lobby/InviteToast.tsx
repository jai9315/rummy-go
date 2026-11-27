"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Check, X } from "lucide-react";
import { useGameStore } from "../../store/useGameStore";

export const InviteToast: React.FC = () => {
  const router = useRouter();
  const pendingInvite = useGameStore((s) => s.pendingInvite);
  const clearPendingInvite = useGameStore((s) => s.clearPendingInvite);

  const handleJoin = () => {
    if (!pendingInvite) return;
    const code = pendingInvite.roomCode;
    clearPendingInvite();
    router.push(`/room/${code}`);
  };

  return (
    <AnimatePresence>
      {pendingInvite && (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 360, damping: 28 }}
          role="dialog"
          aria-label="Room Invitation"
          className="fixed top-4 right-4 z-[70] w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-400/40 bg-emerald-950/95 p-4 text-white shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30">
              <BellRing className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                Room Invitation
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                <span className="text-amber-200">{pendingInvite.fromUsername}</span>{" "}
                — Your friend invited you to join a Rummy game.
              </p>
              <p className="mt-1 text-xs text-emerald-200/80 truncate">
                Table: <span className="font-semibold text-white">{pendingInvite.roomName}</span>{" "}
                <span className="font-mono text-amber-300">#{pendingInvite.roomCode}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={clearPendingInvite}
              aria-label="Dismiss invitation"
              className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleJoin}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-3 py-2 text-xs font-extrabold text-black shadow-md hover:from-amber-400 hover:to-yellow-400 transition"
            >
              <Check className="h-3.5 w-3.5" />
              Join Game
            </button>
            <button
              type="button"
              onClick={clearPendingInvite}
              className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"
            >
              Decline
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
