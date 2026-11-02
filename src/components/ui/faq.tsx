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
 * Nothing animates: the card steps one tone (`open:bg-blue-50`) and the marker
 * swaps from `plus` to `close`, as in the owner's sketch.
 */
export function FaqList({ items, headingLevel = 3 }: { items: ResolvedFaq[]; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details
          key={item.id}
          id={item.id}
          name="faq"
          className="group scroll-mt-[calc(var(--header-h)+1.5rem)] rounded-2xl bg-surface open:bg-blue-50 dark:open:bg-blue-950/40"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-left [&::-webkit-details-marker]:hidden">
            <Heading className="text-lg font-bold text-daet-ink">{item.question}</Heading>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-blue-700 dark:text-blue-300">
              <LineIcon name="plus" className="h-5 w-5 group-open:hidden" />
              <LineIcon name="close" className="hidden h-5 w-5 group-open:block" />
            </span>
          </summary>
          <div className="space-y-3 px-5 pb-5 text-base leading-relaxed text-daet-ink">
            {item.answer ? (
              <p>{item.answer}</p>
            ) : (
              <p className="rounded-xl bg-muted px-4 py-3">[placeholder: {item.todo}]</p>
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
 */
export function FaqLayout({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-12">
      <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">{aside}</div>
      <div className="space-y-10">{children}</div>
    </div>
  );
}
