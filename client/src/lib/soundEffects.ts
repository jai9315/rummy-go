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

function playNoiseFlutter(
  delaySec: number,
  durationSec: number,
  filterFreq: number,
  gainPeak: number
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.85;
    }

    const start = ctx.currentTime + delaySec;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterFreq, start);
    filter.Q.setValueAtTime(2.2, start);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start(start);
    src.stop(start + durationSec + 0.01);
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

  /**
   * Subtle riffle-shuffle flutter cue (~0.65s across 10 rapid card-snap bursts).
   */
  playCardShuffle(muted: boolean): void {
    if (muted) return;
    const bursts = 10;
    for (let i = 0; i < bursts; i++) {
      const delay = 0.08 + i * 0.052;
      const freq = 1400 + (i % 4) * 260;
      playNoiseFlutter(delay, 0.036, freq, 0.055);
    }
    // Crisp bridge/square-up finish thud
    playNoiseFlutter(0.68, 0.06, 900, 0.06);
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
