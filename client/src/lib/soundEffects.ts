/**
 * Lightweight Web Audio API sound effects for Rummy gameplay cues.
 * Strictly respects mute state and fails silently on unsupported browsers / SSR.
 */

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) {
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  const Ctx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!Ctx) return null;

  try {
    audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(
  frequency: number,
  durationSec: number,
  type: OscillatorType = "sine",
  gainPeak: number = 0.08,
  delaySec: number = 0
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const start = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  } catch {
    // Ignore autoplay/browser audio restrictions
  }
}

export const soundEffects = {
  playCardDraw(muted: boolean): void {
    if (muted) return;
    playTone(520, 0.07, "triangle", 0.06, 0);
    playTone(680, 0.06, "sine", 0.05, 0.04);
  },

  playCardDiscard(muted: boolean): void {
    if (muted) return;
    playTone(340, 0.08, "triangle", 0.07, 0);
  },

  playTurnAlert(muted: boolean): void {
    if (muted) return;
    playTone(587.33, 0.12, "sine", 0.07, 0); // D5
    playTone(880, 0.16, "sine", 0.07, 0.11); // A5
  },

  playWinFanfare(muted: boolean): void {
    if (muted) return;
    playTone(523.25, 0.14, "triangle", 0.08, 0); // C5
    playTone(659.25, 0.14, "triangle", 0.08, 0.11); // E5
    playTone(783.99, 0.16, "triangle", 0.08, 0.22); // G5
    playTone(1046.5, 0.32, "sine", 0.09, 0.34); // C6
  },

  playInviteChime(muted: boolean): void {
    if (muted) return;
    playTone(660, 0.1, "sine", 0.06, 0);
    playTone(990, 0.14, "sine", 0.06, 0.1);
  },
};
