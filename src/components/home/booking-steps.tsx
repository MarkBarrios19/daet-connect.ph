import type { CSSProperties } from "react";
import { LineIcon, type IconName } from "@/components/ui/icons";

const STEPS: ReadonlyArray<{ title: string; text: string; icon: IconName }> = [
  {
    title: "Pick a trip and a date.",
    text: "The meeting point, start time and cancellation terms are on the trip's page before you book.",
    icon: "calendar",
  },
  {
    title: "Send your request.",
    text: "The operator confirms, then you pay by GCash, Maya or card, or upload a bank receipt.",
    icon: "check",
  },
  {
    title: "Show your ticket QR.",
    text: "Your guide scans it at the meeting point, and the boat goes.",
    icon: "ticket",
  },
];

/**
 * How booking works: the page's one full-colour band, laid out as the owner's
 * SVG (image-49).
 *
 * The band is a ticket — a navy frame bitten along every edge, the blue field
 * inside it, and the left half white. The heading and the photograph the Tourism
 * Office will supply live in the white half, the three moves in the blue one, so
 * the section reads title-then-steps exactly as it did before the band was
 * drawn. The copy is the owner's and unchanged.
 *
 * The frame is a decorative layer behind the content (`ticket-frame` masks the
 * bites out of it), so nothing a visitor reads is clipped and the panel's own
 * colours stay put — see the utility's note in globals.css.
 */
export function BookingSteps() {
  return (
    <section
      aria-labelledby="home-how"
      data-ticket
      className="ticket-band relative mt-20 sm:mt-32"
    >
      <div aria-hidden="true" className="ticket-frame absolute inset-0 bg-ticket-frame" />

      <div className="relative grid md:grid-cols-2">
        {/* The white half: the heading, and the photograph's place. */}
        <div
          data-ticket-panel="words"
          className="bg-surface px-5 py-10 text-daet-ink sm:px-10 sm:py-14 lg:px-14"
        >
          <h2 id="home-how" data-reveal className="display-2 max-w-md">
            Booking, in three moves
          </h2>

          {/* The owner is supplying the photograph. Until it lands this is a
              visible placeholder, not a stand-in image: swap the box for an
              <img> (with its credit) and leave the heading where it is. */}
          <figure data-booking-photo className="mt-8 max-w-md sm:mt-12">
            <div className="grid aspect-[16/10] w-full place-items-center rounded-xl border border-dashed border-hairline bg-muted p-6 text-center">
              <p className="text-lg font-bold text-daet-ink/70">
                image here
                <span className="mt-1 block text-sm font-normal">
                  [placeholder: the photograph goes in before launch]
                </span>
              </p>
            </div>
            <figcaption className="sr-only">
              [placeholder: a photograph of a booking step in Daet]
            </figcaption>
          </figure>
        </div>

        {/* The blue half: the three moves, unchanged. */}
        <div
          data-ticket-panel="steps"
          className="bg-blue-600 px-5 py-10 text-white sm:px-10 sm:py-14 lg:px-14"
        >
          <ol className="max-w-xl space-y-8">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                data-reveal
                style={{ "--reveal-index": index } as CSSProperties}
                className="grid grid-cols-[auto_1fr] gap-4"
              >
                <LineIcon name={step.icon} className="mt-1 h-7 w-7" />
                <div>
                  <p className="text-2xl font-bold">{step.title}</p>
                  <p className="mt-1 text-lg text-blue-50">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
