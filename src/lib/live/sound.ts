/** The alert tone: generated in the browser (no audio file), throttled, and mutable per device. */
export const MUTE_KEY = "connect-daet:sound-muted";
export const SOUND_GAP_MS = 3000;

export function isMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* private mode: the choice just lasts until the page closes */
  }
}

/** Whether a tone may play now: not muted and at least SOUND_GAP_MS since the last one. */
export function canPlay(now: number, last: number, muted: boolean): boolean {
  return !muted && now - last >= SOUND_GAP_MS;
}

let last = 0;
let context: AudioContext | null = null;
let unlocked = false;

/** Browsers only allow audio after a tap on the page; remember the first one. */
export function unlockSoundOnFirstTap() {
  if (typeof window === "undefined" || unlocked) return;
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function playAlertTone() {
  if (typeof window === "undefined" || !unlocked) return;
  const now = Date.now();
  if (!canPlay(now, last, isMuted())) return;
  last = now;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    context = context ?? new Ctx();
    const ctx = context;
    const start = ctx.currentTime;
    for (const [i, freq] of [880, 1175].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, start + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.14 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + i * 0.14);
      osc.stop(start + i * 0.14 + 0.25);
    }
  } catch {
    /* no audio available: the toast still shows */
  }
}
