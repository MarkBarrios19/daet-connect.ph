import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FaqLayout, FaqList } from "@/components/ui/faq";
import { PageFrame } from "@/components/ui/page-frame";
import { faqGroupsWithAnswers, faqJsonLd } from "@/lib/faq";

/**
 * The questions people ask before they book a boat, pay for a trip, or come to
 * Daet. Most answers come from the travel assistant's knowledge base (see
 * `src/lib/faq.ts`), so the page and the assistant say the same thing.
 *
 * Static and script-free: every question is a native `<details>`, so it opens
 * without JavaScript and its text is in the HTML for search. The opening is
 * animated in CSS (globals.css), which the reference in image-46 asks for and
 * which costs the page no script.
 */

export const metadata: Metadata = {
  title: "Common questions",
  description:
    "How booking, paying, tickets and cancellations work on CONNECT-Daet, how to get to Daet and around, and what to expect on the day.",
};

export default function FaqPage() {
  const groups = faqGroupsWithAnswers();
  const jsonLd = faqJsonLd(groups.flatMap((group) => group.items));

  return (
    <PageFrame>
      <FaqLayout
        aside={
          <>
            <h1 className="display-2 text-daet-ink">Common questions</h1>
            <p className="mt-3 text-lg leading-relaxed text-daet-ink/80">
              Boats, payments, cancellations and the day itself — answered from the same pages the travel guide uses.
            </p>
            <nav aria-label="Jump to a group" className="mt-6 hidden lg:block">
              <ul>
                {groups.map((group) => (
                  <li key={group.id}>
                    <a
                      href={`#${group.id}`}
                      className="inline-flex min-h-11 items-center text-base font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
                    >
                      {group.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <ButtonLink href="/tours/help" className="mt-6 hidden lg:inline-flex">
              Ask the travel guide
            </ButtonLink>
          </>
        }
      >
        {groups.map((group) => (
          <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`} className="scroll-mt-[calc(var(--header-h)+1.5rem)]">
            <h2 id={`${group.id}-heading`} className="mb-4 text-xl font-bold text-daet-ink">
              {group.title}
            </h2>
            <FaqList items={group.items} />
          </section>
        ))}

        <section aria-labelledby="faq-more" className="card-edge rounded-2xl bg-surface p-5 sm:p-6">
          <h2 id="faq-more" className="text-2xl font-bold text-daet-ink">
            Still not answered?
          </h2>
          <p className="mt-2 text-lg leading-relaxed text-daet-ink">
            Ask the travel guide in your own words, and it answers from the same pages these answers come from. For anything about a booking, message its operator; for anything else,
            message the Daet Tourism Office.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/tours/help">Ask the travel guide</ButtonLink>
            <ButtonLink href="/tours/messages" variant="secondary">
              Messages
            </ButtonLink>
          </div>
        </section>

        <p className="text-base text-daet-ink">
          Getting to Daet, by bus, plane or car, is also on the{" "}
          <Link href="/#home-getting-here" className="font-bold text-blue-700 underline underline-offset-2 dark:text-blue-300">
            home page
          </Link>
          .
        </p>
      </FaqLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </PageFrame>
  );
}
