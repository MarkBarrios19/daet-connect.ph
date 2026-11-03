import Image from "next/image";
import type { CSSProperties } from "react";
import { LineIcon, type IconName } from "@/components/ui/icons";
import { PHOTOS } from "@/lib/photo-credits";

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
 * How booking works, printed on a ticket (the owner's design, image-62).
 *
 * The band is one ticket: the owner's shape behind everything, the photograph
 * filling the left of it, the three moves on a light card on the right, and
 * their "Booking in 3 moves" lettering over the middle of it. The lettering is
 * the owner's SVG, kept as a file rather than redrawn: it is their artwork,
 * noise and drop shadow included.
 *
 * On a phone the halves stack: the lettering straddles the seam between them,
 * and the pair of bites on the edge moves from the top and bottom edges to the
 * left and right ones, level with that seam. The perforation, which belongs to
 * a vertical tear, goes.
 *
 * The measured design is in the reference: cream ticket, a photograph inset
 * from its edges, and a card of nearly the page's own white on the right. In
 * dark mode the ticket turns the theme's card tone and the panel a step off it,
 * so the band sits in the dark theme instead of glaring out of it.
 *
 * The band carries its own measurements — `--ticket-pad-x`, `--ticket-pad-y`,
 * `--ticket-gap` — and the padding and gap are set from them, so the seam the
 * mask is torn along (ticket-seam, in globals.css) is worked out from the same
 * numbers that lay the two halves out. It is an inline-size container so that
 * sum can measure the band itself.
 */
export function BookingSteps() {
  return (
    <section
      aria-labelledby="home-how"
      data-ticket
      className="relative mt-20 [container-type:inline-size] [--ticket-gap:0rem] [--ticket-pad-x:0.75rem] [--ticket-pad-y:0.75rem] sm:mt-32 sm:[--ticket-pad-x:1.75rem] sm:[--ticket-pad-y:1.5rem] md:[--ticket-gap:4.5rem] md:[--ticket-pad-x:2.25rem] md:[--ticket-pad-y:1.75rem] lg:[--ticket-gap:7.5rem] lg:[--ticket-pad-x:2.75rem] lg:[--ticket-pad-y:2rem]"
    >
      {/* The ticket itself: the owner's cream, bitten at its four corners and
          twice on the edge with the tear, by `ticket-shape` — masked circles of
          a fixed radius, so they stay circles at any width. The grain is the
          owner's noise at a tenth: the reference's own speckle was too loud on a
          cream this big (their note on image-64), so it is down by seventy per
          cent. */}
      <div data-ticket-shape aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="ticket-shape ticket-seam absolute inset-0 bg-ticket-frame">
          <div className="ticket-noise absolute inset-0 opacity-[0.06]" />
        </div>
        {/* The perforation, where the ticket is torn — under the lettering and
            running into the bites in the top and bottom edges. Dropped on a
            phone: the tear there runs across the ticket, and its bites are on
            the left and right edges instead. */}
        <span
          data-ticket-perf
          aria-hidden="true"
          className="absolute inset-y-6 left-[56%] hidden w-0 -translate-x-1/2 border-l-[3px] border-dashed border-ticket-perf md:block"
        />
      </div>

      <div className="relative px-[var(--ticket-pad-x)] py-[var(--ticket-pad-y)]">
        <div className="grid gap-[var(--ticket-gap)] md:grid-cols-[1.35fr_1fr] md:items-stretch">
          {/* The photograph, inset from the ticket's edge, filling the left
              half. In dark mode it is seated in the theme rather than blazing
              out of it: a fifth of the page's own ground, over it. */}
          <div
            data-ticket-photo
            className="relative isolate aspect-[4/3] overflow-hidden rounded-[1.25rem] md:aspect-auto md:min-h-[300px] md:rounded-[1.5rem]"
          >
            <Image
              src={PHOTOS.rizalMonumentPark.src}
              alt={PHOTOS.rizalMonumentPark.alt}
              fill
              sizes="(min-width: 768px) 55vw, 100vw"
              className="object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 hidden bg-canvas/25 dark:block" />
            <div aria-hidden="true" className="ticket-noise pointer-events-none absolute inset-0 opacity-[0.06]" />
          </div>

          {/* The owner's lettering. On a phone it straddles the seam, half on
              the photograph and half on the card below it (their reference,
              image-68); from md up it is centred on the band, so it clears the
              words on the card beside it (their note on image-64). */}
          <div
            data-ticket-art
            className="ticket-seam absolute left-1/2 top-[var(--ticket-seam)] z-10 w-[136px] -translate-x-1/2 -translate-y-1/2 sm:w-[152px] md:top-1/2 md:w-[180px] lg:w-[228px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the owner's SVG, drawn as it was sent */}
            <img
              src="/ticket/booking-in-3-moves.svg"
              alt=""
              aria-hidden="true"
              width={196}
              height={81}
              className="h-auto w-full"
            />
          </div>

          {/* The three moves, on a card of nearly the page's white. */}
          <div
            data-ticket-panel
            className="relative isolate overflow-hidden rounded-[1.25rem] bg-ticket-panel p-5 text-daet-ink sm:p-6 md:rounded-[1.5rem] lg:p-8"
          >
            <div aria-hidden="true" className="ticket-noise pointer-events-none absolute inset-0 opacity-[0.045]" />
            <ol className="relative space-y-6 lg:space-y-7">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  data-reveal
                  style={{ "--reveal-index": index } as CSSProperties}
                  className="grid grid-cols-[auto_1fr] gap-3"
                >
                  <LineIcon name={step.icon} className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-[1.0625rem] font-bold leading-snug">{step.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-daet-ink/75">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* The lettering carries the words for the eye; this carries them for a
          screen reader, and it is the band's heading. */}
      <h2 id="home-how" className="sr-only">
        Booking, in three moves
      </h2>
    </section>
  );
}
