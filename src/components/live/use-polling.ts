"use client";

import { useEffect, useRef } from "react";
import { nextDelay } from "@/lib/live/schedule";

const MIN_GAP_MS = 1000;

/**
 * Runs `task` every `intervalMs` while the tab is visible. It pauses when the
 * tab is hidden, runs at once when the tab comes back, gets focus or the
 * network returns, and waits longer after each failure in a row.
 * Returns nothing; `trigger` lets callers ask for an immediate run.
 */
export function usePolling(task: () => Promise<void>, intervalMs: number, enabled = true) {
  const taskRef = useRef(task);
  taskRef.current = task;
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let timer: number | null = null;
    let failures = 0;
    let stopped = false;
    let running = false;

    const clear = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (stopped || document.visibilityState !== "visible") return;
      timer = window.setTimeout(run, nextDelay(intervalMs, failures));
    };
    let lastStart = 0;
    const run = async () => {
      clear();
      if (stopped || running || document.visibilityState !== "visible") return;
      // However it is asked (focus, a Realtime nudge, another poll), never more than once a second.
      if (Date.now() - lastStart < MIN_GAP_MS) return schedule();
      lastStart = Date.now();
      running = true;
      try {
        await taskRef.current();
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
        schedule();
      }
    };
    const onVisible = () => (document.visibilityState === "visible" ? void run() : clear());
    const onNow = () => void run();

    triggerRef.current = onNow;
    void run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onNow);
    window.addEventListener("online", onNow);
    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onNow);
      window.removeEventListener("online", onNow);
    };
  }, [intervalMs, enabled]);

  return { trigger: () => triggerRef.current() };
}
