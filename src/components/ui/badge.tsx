import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Status colours from the team standard: success green-500, warning
 * yellow-500, error red-600, primary blue-600. Green and yellow carry dark
 * text, because white on them fails contrast. In dark mode the same hues are
 * a soft tint with light text, so full-strength chips don't glare on navy.
 */
const TONES = {
  neutral: "bg-muted-strong text-slate-900 dark:text-slate-100",
  brand: "bg-blue-600 text-white dark:bg-blue-500/20 dark:text-blue-200",
  success: "bg-green-500 text-slate-950 dark:bg-green-500/15 dark:text-green-300",
  warning: "bg-yellow-500 text-slate-950 dark:bg-yellow-400/15 dark:text-yellow-200",
  danger: "bg-red-600 text-white dark:bg-red-500/20 dark:text-red-200",
  info: "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300",
  // Money returned: violet, so a refund never reads as a warning or an error.
  refund: "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200",
} as const;

export type BadgeTone = keyof typeof TONES;

/** The chip colours as classes, for status pills that aren't a <Badge>. */
export const badgeTone = (tone: BadgeTone): string => TONES[tone];

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", TONES[tone], className)}>
      {children}
    </span>
  );
}
