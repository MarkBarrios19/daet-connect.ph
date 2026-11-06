"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const BEAT_MS = 60_000;

/** Stamps "last seen" about once a minute while a signed-in user has the app open and visible. */
export function PresenceHeartbeat() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createSupabaseBrowserClient();
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.resolve(supabase.rpc("tours_touch_presence")).catch(() => {});
    };
    beat();
    const timer = window.setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}
