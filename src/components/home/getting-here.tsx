import type { CSSProperties } from "react";
import { LineIcon } from "@/components/ui/icons";
import {
  GETTING_HERE,
  GETTING_HERE_CHECK,
  GETTING_HERE_RESEARCHED,
  GETTING_HERE_SOURCES,
} from "@/lib/getting-here";

/**
 * How people actually reach Daet: the three routes, the "check before you
 * travel" line, and the sources the copy was drawn from. The copy itself lives
 * in src/lib/getting-here.ts.
 *
 * The routes are one band rather than three loose cards, drawn from the owner's
 * reference (image-47): a single outlined card, a rule between one route and the
 * next, and each route numbered in the brand blue with its own vehicle drawn at
 * the top right. It keeps the three routes reading as one answer — "here is how
 * most people come" — instead of three things that happen to sit in a row.
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

      <div data-routes className="card-edge overflow-hidden rounded-2xl bg-surface">
        <ul className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
          {GETTING_HERE.map((card, index) => (
            <li
              key={card.title}
              data-reveal
              style={{ "--reveal-index": index } as CSSProperties}
              className="flex flex-col gap-3 p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <span aria-hidden="true" className="text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <LineIcon
                  name={card.icon}
                  className="h-9 w-9 shrink-0 text-blue-700/85 dark:text-blue-300/85"
                />
              </div>
              <h3 className="text-xl font-bold text-daet-ink">{card.title}</h3>
              <p className="text-base leading-relaxed text-daet-ink/85">{card.text}</p>
            </li>
          ))}
        </ul>
      </div>

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
