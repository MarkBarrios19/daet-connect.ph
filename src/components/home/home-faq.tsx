import Link from "next/link";
import type { CSSProperties } from "react";
import { FaqList } from "@/components/ui/faq";
import { HOME_FAQ } from "@/lib/faq";

/**
 * The questions that decide whether someone books, in the owner's layout: the
 * title and one line on the left, the disclosures on the right.
 *
 * Six, all of them answered today, so this band never shows a placeholder. The
 * page has the rest.
 */
export function HomeFaq() {
  return (
    <section aria-labelledby="home-faq" className="mx-auto w-full max-w-7xl px-4 pt-20 sm:px-6 sm:pt-32 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-12">
        <div>
          <h2 id="home-faq" data-reveal className="display-2 text-daet-ink">
            Common questions
          </h2>
          <p data-reveal style={{ "--reveal-index": 1 } as CSSProperties} className="mt-3 text-lg leading-relaxed text-daet-ink">
            The six things people ask before they book.
          </p>
          <Link
            href="/tours/faq"
            className="mt-4 inline-flex min-h-11 items-center font-bold text-blue-700 underline underline-offset-2 dark:text-blue-300"
          >
            All questions
          </Link>
        </div>
        <div data-reveal style={{ "--reveal-index": 2 } as CSSProperties}>
          <FaqList items={HOME_FAQ} />
        </div>
      </div>
    </section>
  );
}
