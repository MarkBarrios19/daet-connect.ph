"use client";

import { LineIcon } from "@/components/ui/icons";
import type { TransportCard } from "@/lib/tours/assistant/guide-tools";

/** Ways to travel between two places, leg by leg, with fares from tours_fares. Used in the chat and the plan panel. */
export function TransportCardView({ card }: { card: TransportCard }) {
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <p className="font-bold text-daet-ink">{card.title}</p>
      <ol className="mt-2 space-y-3">
        {card.options.map((option, i) => (
          <li key={i} className="rounded-2xl card-edge bg-surface p-2.5">
            {card.options.length > 1 ? <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Option {i + 1}{option.time ? ` · about ${option.time}` : ""}</p> : option.time ? <p className="text-xs font-bold text-slate-600 dark:text-slate-400">About {option.time} in all</p> : null}
            <ol className="mt-1 space-y-2">
              {option.legs.map((leg, j) => (
                <li key={j} className="text-sm">
                  <p className="font-semibold text-daet-ink">
                    {leg.mode}: {leg.from} to {leg.to}
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">{[leg.fare ?? "Fare: ask locally", leg.time].filter(Boolean).join(" · ")}{leg.verified ? "" : " · verify locally"}</p>
                  {leg.note ? <p className="text-xs text-slate-600 dark:text-slate-400">{leg.note}</p> : null}
                  <a href={leg.boardHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-blue-700 dark:text-blue-300 underline">
                    <LineIcon name="pin" className="h-4 w-4" /> Where to board in {leg.from}
                    <span className="sr-only"> (opens Google Maps)</span>
                  </a>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
