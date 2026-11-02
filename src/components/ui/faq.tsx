import Link from "next/link";
import { LineIcon } from "@/components/ui/icons";
import type { ResolvedFaq } from "@/lib/faq";

/**
 * The questions, as disclosures.
 *
 * Native `<details>`/`<summary>`, which is how every other disclosure on the
 * site works (the mobile menu, the filters, the booking panel): it opens
 * without JavaScript, keeps its text in the HTML for search and find-in-page,
 * and needs no ARIA to be operable from the keyboard.
 *
 * `name="faq"` makes the browser close the others when one opens, on its own.
 * Older browsers open them independently instead, which is not worth a script.
 *
 * Drawn as the owner's reference (image-46): a rule between one question and the
 * next, the question in ink with a chevron that turns as it opens, and the answer
 * underneath on the page's own ground — no card, no fill. The opening itself is
 * animated in globals.css with `details[data-faq]::details-content`, where the
 * browser can interpolate to `auto`; everywhere else it opens instantly, which is
 * how it behaved before.
 */
export function FaqList({ items, headingLevel = 3 }: { items: ResolvedFaq[]; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="border-t border-hairline">
      {items.map((item) => (
        <details
          key={item.id}
          id={item.id}
          name="faq"
          data-faq
          className="group scroll-mt-[calc(var(--header-h)+1.5rem)] border-b border-hairline"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left [&::-webkit-details-marker]:hidden">
            <Heading className="text-base font-bold leading-snug text-daet-ink sm:text-lg">{item.question}</Heading>
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center text-daet-ink/55 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-180"
            >
              <LineIcon name="chevron-down" className="h-5 w-5" />
            </span>
          </summary>
          <div className="max-w-[46rem] space-y-3 pb-6 pr-6 text-base leading-relaxed text-daet-ink/80">
            {item.answer ? (
              <p>{item.answer}</p>
            ) : (
              <p className="border-l-2 border-hairline pl-3 text-daet-ink/70">[placeholder: {item.todo}]</p>
            )}
            {item.links.length > 0 ? (
              <p className="flex flex-wrap gap-x-5 gap-y-1">
                {item.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex min-h-11 items-center font-bold text-blue-700 underline underline-offset-2 dark:text-blue-300"
                  >
                    {link.label}
                  </Link>
                ))}
              </p>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * The page's opening: the title and one line on the left, the questions on the
 * right, stacked on a phone. The left column sticks while the right scrolls.
 *
 * The reference (image-46) also puts a small label over the title. That is an
 * eyebrow, which the house style bans (docs/DESIGN_SYSTEM.md), so the title
 * carries itself and the questions sit beside it.
 */
export function FaqLayout({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-16">
      <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">{aside}</div>
      <div className="space-y-12">{children}</div>
    </div>
  );
}
