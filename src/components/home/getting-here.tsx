import type { CSSProperties } from "react";
import {
  GETTING_HERE,
  GETTING_HERE_CHECK,
  GETTING_HERE_RESEARCHED,
  GETTING_HERE_SOURCES,
} from "@/lib/getting-here";

/**
 * How people actually reach Daet: three short cards, the "check before you
 * travel" line, and the sources the copy was drawn from. The copy itself lives
 * in src/lib/getting-here.ts.
 */
export function GettingHere() {
  return (
    <section aria-labelledby="home-getting-here" className="mx-auto w-full max-w-7xl px-4 pt-20 sm:px-6 sm:pt-32 lg:px-8">
      <h2 id="home-getting-here" data-reveal className="display-2 text-daet-ink">
        Getting to Daet
      </h2>
      <p
        data-reveal
        style={{ "--reveal-index": 1 } as CSSProperties}
        className="mb-6 mt-3 max-w-2xl text-lg text-daet-ink"
      >
        Daet is on the Bicol road, about a day from Manila by land. Here is how most people come.
      </p>

      <ul className="grid gap-3 md:grid-cols-3">
        {GETTING_HERE.map((card, index) => (
          <li
            key={card.title}
            data-reveal
            style={{ "--reveal-index": index } as CSSProperties}
            className="rounded-2xl card-edge bg-surface p-5"
          >
            <h3 className="text-xl font-bold text-daet-ink">{card.title}</h3>
            <p className="mt-2 text-base leading-relaxed text-daet-ink/90">{card.text}</p>
          </li>
        ))}
      </ul>

      <p className="mt-4 rounded-2xl bg-muted p-4 text-base font-bold text-daet-ink">{GETTING_HERE_CHECK}</p>

      <details className="mt-3 text-sm text-daet-ink/80">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-blue-700 dark:text-blue-300">
          Where this comes from · {GETTING_HERE_RESEARCHED}
        </summary>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {GETTING_HERE_SOURCES.map((source) => (
            <li key={source.href}>
              <a href={source.href} target="_blank" rel="noreferrer" className="underline hover:text-blue-700 dark:hover:text-blue-300">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
