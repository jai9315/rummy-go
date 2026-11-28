"use client";

let audioCtx: AudioContext | null = null;
let unlockListenersInstalled = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Unlocks Web Audio API on first user gesture so turn-start chimes
 * play reliably across Chrome, Safari, and mobile browsers.
 */
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

export function installAudioUnlock(): void {
  if (typeof window === "undefined" || unlockListenersInstalled) return;
  unlockListenersInstalled = true;

  const handler = () => {
    unlockAudioContext();
  };

  window.addEventListener("pointerdown", handler, { passive: true });
  window.addEventListener("keydown", handler, { passive: true });
  window.addEventListener("touchstart", handler, { passive: true });
}

export function playCardDraw(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = 0.08;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const envelope = Math.exp(-i / (bufferSize * 0.35));
      data[i] = (Math.random() * 2 - 1) * envelope * 0.25;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  } catch {
    // Ignore autoplay errors
  }
}

export function playCardDiscard(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = 0.1;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const envelope = Math.exp(-i / (bufferSize * 0.35));
      data[i] = (Math.random() * 2 - 1) * envelope * 0.25;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  } catch {
    // Ignore autoplay errors
  }
}

export function playCardShuffle(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let step = 0; step < 5; step++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420 + step * 60, now + step * 0.04);
      gain.gain.setValueAtTime(0.07, now + step * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + step * 0.04 + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + step * 0.04);
      osc.stop(now + step * 0.04 + 0.045);
    }
  } catch {
    // Ignore autoplay errors
  }
}

export function playWinFanfare(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.14, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.48);
    });
  } catch {
    // Ignore autoplay errors
  }
}

export function playInviteChime(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [587.33, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.12, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.28);
    });
  } catch {
    // Ignore autoplay errors
  }
}

/**
 * Crisp two-tone royal chime when it becomes the user's turn.
 */
export function playTurnAlert(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const chimeNotes = [
      { freq: 659.25, start: 0, duration: 0.16, peak: 0.16 }, // E5
      { freq: 987.77, start: 0.11, duration: 0.26, peak: 0.18 }, // B5
    ];

    for (const note of chimeNotes) {
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      overtone.type = "triangle";
      overtone.frequency.setValueAtTime(note.freq * 2, now + note.start);

      const overtoneGain = ctx.createGain();
      overtoneGain.gain.setValueAtTime(0.22, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.linearRampToValueAtTime(note.peak, now + note.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);

      osc.connect(gain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      overtone.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.02);
      overtone.stop(now + note.start + note.duration + 0.02);
    }
  } catch {
    // Ignore autoplay errors
  }
}

/**
 * Crisp low-timer warning pulse when <= 5 seconds remain on the user's turn.
 */
export function playTurnWarningTick(muted = false): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.075);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  } catch {
    // Ignore autoplay errors
  }
}

export const soundEffects = {
  unlock: unlockAudioContext,
  installUnlock: installAudioUnlock,
  playCardDraw,
  playCardDiscard,
  playCardShuffle,
  playWinFanfare,
  playInviteChime,
  playTurnAlert,
  playTurnWarningTick,
};
