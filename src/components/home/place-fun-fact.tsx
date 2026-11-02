"use client";

import { useState } from "react";

/**
 * The Fun fact card under the open place's own card, as sketched (image-30).
 *
 * It folds like the card above it: a slim bar with the heading and a chevron
 * when shut, the line itself when open. The copy is the place's own `funFact`;
 * none is written yet, so it shows a visible placeholder rather than a made-up
 * one — the same rule the rest of the page follows.
 */
export function PlaceFunFact({ name, fact }: { name: string; fact?: string }) {
  const [open, setOpen] = useState(true);

  return (
    <section
      data-fun-fact
      aria-labelledby="place-fun-fact-title"
      className="pointer-events-auto w-full rounded-2xl bg-surface/92 text-daet-ink ring-1 ring-daet-ink/10 backdrop-blur-md dark:bg-slate-950/82 dark:text-white dark:ring-white/15"
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <h3 id="place-fun-fact-title" className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight">
          Fun fact
        </h3>

        <button
          type="button"
          onClick={() => setOpen((shown) => !shown)}
          aria-expanded={open}
          aria-controls="place-fun-fact-body"
          aria-label={open ? "Hide the fun fact" : "Show the fun fact"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-daet-ink ring-1 ring-inset ring-daet-ink/15 transition hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:bg-muted-strong dark:text-white dark:ring-white/20 dark:hover:bg-white/10 dark:active:bg-white/20"
        >
          <svg
            className={`h-5 w-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <div id="place-fun-fact-body" hidden={!open} className="px-4 pb-4">
        <p className="text-sm leading-relaxed text-daet-ink/85 dark:text-white/90">
          {fact ?? `[placeholder: a fun fact about ${name}, to be written by the Tourism Office]`}
        </p>
      </div>
    </section>
  );
}
