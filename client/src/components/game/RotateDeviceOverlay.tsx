"use client";

import { motion } from "framer-motion";
import { Maximize2, RotateCw, Smartphone } from "lucide-react";
import React, { useCallback, useState } from "react";

interface LockableScreenOrientation extends ScreenOrientation {
  lock?: (orientation: "landscape" | "landscape-primary" | "landscape-secondary") => Promise<void>;
}

/**
 * Mobile Portrait Lock Overlay.
 * Shown purely via CSS (`hidden mobile-portrait:flex` => `@media (orientation: portrait) and (max-width: 767px)`)
 * so the underlying Table, Socket.IO connection, and LiveKitRoom stay mounted without disconnecting.
 */
export const RotateDeviceOverlay: React.FC = () => {
  const [helperNote, setHelperNote] = useState<string | null>(null);
  const [isAttempting, setIsAttempting] = useState<boolean>(false);

  const handleFullscreenAndRotate = useCallback(async () => {
    setIsAttempting(true);
    setHelperNote(null);

    try {
      const rootEl = document.documentElement;
      if (rootEl.requestFullscreen && !document.fullscreenElement) {
        await rootEl.requestFullscreen();
      }
    } catch {
      // Fullscreen may be unavailable or rejected (e.g. iOS Safari) — continue gracefully
    }

    try {
      const orientation = window.screen?.orientation as LockableScreenOrientation | undefined;
      if (orientation && typeof orientation.lock === "function") {
        await orientation.lock("landscape");
      } else {
        setHelperNote("Turn off Portrait Lock and rotate your phone sideways.");
      }
    } catch {
      setHelperNote("Turn off Portrait Lock and rotate your phone sideways.");
    } finally {
      setIsAttempting(false);
    }
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rotate device to landscape"
      className="hidden mobile-portrait:flex fixed inset-0 z-50 flex-col items-center justify-center p-6 bg-felt-pattern backdrop-blur-md text-center select-none"
    >
      <div className="w-full max-w-xs rounded-3xl bg-zinc-950/90 border border-amber-500/40 p-6 shadow-2xl flex flex-col items-center gap-4">
        {/* Animated Rotating Phone Illustration */}
        <div className="relative w-20 h-20 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center shadow-inner">
          <motion.div
            animate={{ rotate: [0, 0, -90, -90, 0] }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.2, 0.55, 0.85, 1],
            }}
            className="text-amber-400"
          >
            <Smartphone className="w-10 h-10" />
          </motion.div>
          <span className="absolute -bottom-1.5 -right-1.5 p-1.5 rounded-full bg-amber-400 text-zinc-950 shadow-md">
            <RotateCw className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-black text-white leading-snug">
            Rotate your device to Landscape (16:9) to play
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Your game table and live video call stay connected while you rotate.
          </p>
        </div>

        <button
          type="button"
          onClick={handleFullscreenAndRotate}
          disabled={isAttempting}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition disabled:opacity-60"
        >
          <Maximize2 className="w-4 h-4 shrink-0" />
          <span>{isAttempting ? "Rotating..." : "Fullscreen & Rotate"}</span>
        </button>

        {helperNote && (
          <p className="text-[11px] text-amber-300/90 leading-snug">
            {helperNote}
          </p>
        )}
      </div>
    </div>
  );
};
