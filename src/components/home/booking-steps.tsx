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
 * How booking works: the page's one full-colour band, and now the owner's
 * postcard (image-52).
 *
 * A cream frame bitten along every edge, softened and grained like printed
 * paper; the photograph filling the left half with the heading on it; the three
 * moves on a flat cyan panel on the right. The frame's cream, the cyan and the
 * dark copy on it are the reference's palette (see the tokens in globals.css);
 * in dark mode the frame takes the page's off-white, because the owner's note
 * on image-50 was that a dark ridge disappeared into the dark ground.
 *
 * The frame is a decorative layer behind the content (`ticket-ridge` softens
 * it, `ticket-frame` masks the bites, `ticket-grain` is the paper), so nothing a
 * visitor reads is clipped and the panels' own colours stay put.
 */
export function BookingSteps() {
  return (
    <section
      aria-labelledby="home-how"
      data-ticket
      className="ticket-band relative mt-20 sm:mt-32"
    >
      <div aria-hidden="true" className="ticket-ridge pointer-events-none absolute inset-0">
        <div data-ticket-frame className="ticket-frame absolute inset-0 bg-ticket-frame">
          <div className="ticket-grain absolute inset-0" />
        </div>
      </div>

      <div className="relative grid md:grid-cols-2">
        {/* The photograph, filling the left half, with the heading on it. A
            scrim under the words keeps them readable over the trees. */}
        <div data-ticket-photo className="relative aspect-[4/3] md:aspect-auto md:min-h-[440px]">
          <Image
            src={PHOTOS.rizalMonumentPark.src}
            alt={PHOTOS.rizalMonumentPark.alt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(155deg,rgba(15,23,42,0.8),rgba(15,23,42,0.34)_42%,transparent_68%)]"
          />
          <h2
            id="home-how"
            data-reveal
            className="display-2 absolute left-5 top-8 max-w-md text-white sm:left-10 sm:top-12 lg:left-14"
          >
            Booking, in three moves
          </h2>
        </div>

        {/* The cyan panel: the three moves, unchanged, in a printed dark ink. */}
        <div
          data-ticket-panel
          className="bg-ticket-field px-5 py-10 text-ticket-ink sm:px-10 sm:py-14 lg:px-14"
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
                  <p className="mt-1 text-lg text-ticket-ink/85">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
