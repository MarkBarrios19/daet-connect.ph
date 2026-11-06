"use client";

import { useLive } from "@/components/live/live-provider";
import type { LiveCounts } from "@/lib/live/summary";

/**
 * A number that starts at the server's value and then follows the poll, so a
 * dashboard count changes in place without a page refresh. With `waiting`, a
 * count above zero is drawn in the attention colour.
 */
export function LiveCount({ name, initial, className = "", waiting = false }: { name: keyof LiveCounts; initial: number; className?: string; waiting?: boolean }) {
  const live = useLive();
  const value = (live?.ready ? live.summary.counts[name] : undefined) ?? initial;
  const tone = waiting && value > 0 ? "text-yellow-800 dark:text-yellow-200" : "text-daet-ink";
  return <span className={`${className} ${tone}`.trim()}>{value}</span>;
}
