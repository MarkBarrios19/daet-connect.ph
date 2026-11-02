"use client";

import { openAssistant } from "@/lib/ui-overlay";

/**
 * The one place the page says "just ask". A blue band with a single action,
 * because a visitor who has read six places and three trips still has to decide
 * what to do with one day.
 */
export function AskBand() {
  return (
    <section aria-labelledby="home-ask" className="mt-20 bg-blue-600 py-14 text-white sm:mt-32 sm:py-16">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-5 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <h2 id="home-ask" data-reveal className="display-2">
            Not sure where to start?
          </h2>
          <p className="mt-2 max-w-xl text-lg text-blue-50">
            Tell the travel guide how long you have and what you like, and it will put a day together for you.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAssistant()}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-surface px-7 text-base font-bold text-blue-700 transition hover:bg-blue-50 active:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-950/40 dark:active:bg-blue-900/40"
        >
          Ask what to do in one day
        </button>
      </div>
    </section>
  );
}
