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
 * On a phone the halves stack and the lettering drops between them, which is
 * the one place it can go once there is no gap beside it; the perforation goes
 * with the seam it belongs to.
 *
 * The measured design is in the reference: cream ticket, a photograph inset
 * from its edges, and a card of nearly the page's own white on the right. In
 * dark mode the ticket turns the theme's card tone and the panel a step off it,
 * so the band sits in the dark theme instead of glaring out of it.
 */
export function BookingSteps() {
  return (
    <section aria-labelledby="home-how" data-ticket className="relative mt-20 sm:mt-32">
      {/* The ticket itself: the owner's cream, bitten at its four corners and in
          the middle of its top and bottom edges by `ticket-shape`, which masks
          circles of a fixed radius so they stay circles at any width. The grain
          is the owner's noise at a tenth — the reference's own speckle was too
          loud on a cream this big (their note on image-64), so it is down by
          seventy per cent. */}
      <div data-ticket-shape aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="ticket-shape absolute inset-0 bg-ticket-frame">
          <div className="ticket-noise absolute inset-0 opacity-[0.06]" />
        </div>
        {/* The perforation, where the ticket is torn — under the lettering and
            running into the bites in the top and bottom edges. Dropped on a
            phone, where the halves are stacked and there is no seam to tear
            along. */}
        <span
          data-ticket-perf
          aria-hidden="true"
          className="absolute inset-y-6 left-1/2 hidden w-0 -translate-x-1/2 border-l-[3px] border-dashed border-white/70 md:block"
        />
      </div>

      <div className="relative px-5 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-10">
        <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-stretch md:gap-10 lg:gap-14">
          {/* The photograph, inset from the ticket's edge, filling the left
              half. In dark mode it is seated in the theme rather than blazing
              out of it: a fifth of the page's own ground, over it. */}
          <div
            data-ticket-photo
            className="relative isolate aspect-[4/3] overflow-hidden rounded-[1.25rem] md:aspect-auto md:min-h-[300px]"
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

          {/* The owner's lettering. On a phone it is a row between the two
              halves; from md up it is lifted out of the grid and centred on the
              band, so it clears the words on the card beside it (their note on
              image-64). */}
          <div
            data-ticket-art
            className="relative z-10 mx-auto w-[168px] sm:w-[184px] md:absolute md:left-1/2 md:top-1/2 md:mx-0 md:w-[196px] md:-translate-x-1/2 md:-translate-y-1/2 lg:w-[212px]"
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
            className="relative isolate overflow-hidden rounded-[1.25rem] bg-ticket-panel p-5 text-daet-ink sm:p-6 lg:p-8"
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
