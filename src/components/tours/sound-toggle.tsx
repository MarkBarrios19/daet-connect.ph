"use client";

import { useEffect, useState } from "react";
import { isMuted, playAlertTone, setMuted, unlockSoundOnFirstTap } from "@/lib/live/sound";

/** Settings switch for the alert tone; the choice is kept on this device. */
export function SoundToggle() {
  const [muted, setState] = useState(false);
  useEffect(() => setState(isMuted()), []);
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-bold text-daet-ink">Alert sound</p>
        <p className="text-sm text-daet-ink/70">Plays a short tone when a new notification or message arrives while this page is open.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!muted}
        aria-label="Alert sound"
        onClick={() => {
          const next = !muted;
          setMuted(next);
          setState(next);
          if (!next) {
            unlockSoundOnFirstTap();
            playAlertTone();
          }
        }}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${muted ? "bg-muted-strong" : "bg-blue-600"}`}
      >
        <span aria-hidden="true" className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-surface transition-transform ${muted ? "" : "translate-x-6"}`} />
      </button>
    </div>
  );
}
