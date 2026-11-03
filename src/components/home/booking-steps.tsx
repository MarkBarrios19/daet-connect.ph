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
 * The ticket the section is printed on (owner's SVG, image-62).
 *
 * One shape: rounded corners, a semicircular bite out of the middle of the top
 * and bottom edges, and a dashed perforation at 56% of its width. Inlined
 * rather than linked by an `<img>` for one reason — the fill has to follow the
 * theme, and an image cannot take `currentColor`. It is `preserveAspectRatio=
 * "none"` so it stretches to whatever box the section gives it: the reference
 * is 1925×556 and the band is never exactly that ratio.
 *
 * The noise is the owner's too, from their other references: fractal
 * turbulence, merged into the shape as a quarter-strength darkening. Their
 * filter also displaces the outline by a few pixels, which is what makes the
 * edge look printed rather than cut; that is kept as well.
 */
function TicketShape() {
  return (
    <svg
      viewBox="0 0 1925 556"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 h-full w-full"
    >
      <g filter="url(#ticket-print)">
        <path
          d="M1038.72 2.76001C1038.69 3.42574 1038.68 4.0947 1038.68 4.76685C1038.68 32.4818 1057.69 54.9493 1081.14 54.9495C1104.58 54.9495 1123.59 32.4819 1123.59 4.76685C1123.59 4.09469 1123.58 3.42575 1123.55 2.76001H1874.25C1874.22 3.42574 1874.21 4.09469 1874.21 4.76685C1874.21 32.4818 1893.22 54.9494 1916.67 54.9495C1918.39 54.9495 1920.09 54.8262 1921.76 54.5901V504.943C1920.09 504.707 1918.39 504.585 1916.67 504.585C1893.79 504.585 1875.14 525.976 1874.25 552.76H1123.55C1122.66 525.976 1104.01 504.585 1081.14 504.585C1058.26 504.585 1039.61 525.976 1038.72 552.76H46.8772C45.9857 525.976 27.3371 504.585 4.45825 504.585C3.88951 504.585 3.32332 504.598 2.76001 504.624V54.9094C3.32334 54.9356 3.88949 54.9495 4.45825 54.9495C27.9059 54.9494 46.9143 32.4818 46.9143 4.76685C46.9143 4.09469 46.8994 3.42574 46.8772 2.76001H1038.72Z"
          fill="currentColor"
        />
        <path
          d="M1079.44 53.142L1079.44 59.0582M1079.44 502.777L1079.44 496.861M1079.44 70.8907L1079.44 82.7232M1079.44 94.5557L1079.44 106.388M1079.44 118.221L1079.44 130.053M1079.44 141.886L1079.44 153.718M1079.44 165.551L1079.44 177.383M1079.44 189.216L1079.44 201.048M1079.44 212.881L1079.44 224.713M1079.44 236.546L1079.44 248.378M1079.44 260.211L1079.44 272.043M1079.44 283.876L1079.44 295.708M1079.44 307.541L1079.44 319.373M1079.44 331.206L1079.44 343.038M1079.44 354.871L1079.44 366.703M1079.44 378.536L1079.44 390.368M1079.44 402.201L1079.44 414.033M1079.44 425.866L1079.44 437.698M1079.44 449.531L1079.44 461.363M1079.44 473.196L1079.44 485.028"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinejoin="round"
          className="opacity-45"
        />
      </g>
      <defs>
        <filter
          id="ticket-print"
          x="0"
          y="0"
          width="1925"
          height="556"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feTurbulence type="fractalNoise" baseFrequency="2 2" stitchTiles="stitch" numOctaves="3" seed="5646" result="noise" />
          <feColorMatrix in="noise" type="luminanceToAlpha" result="alphaNoise" />
          <feComponentTransfer in="alphaNoise" result="coloredNoise1">
            <feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" />
          </feComponentTransfer>
          <feComposite operator="in" in2="shape" in="coloredNoise1" result="noise1Clipped" />
          <feFlood floodColor="rgba(0, 0, 0, 0.25)" result="color1Flood" />
          <feComposite operator="in" in2="noise1Clipped" in="color1Flood" result="color1" />
          <feMerge result="effect1_noise">
            <feMergeNode in="shape" />
            <feMergeNode in="color1" />
          </feMerge>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.999"
            numOctaves="3"
            seed="3967"
            result="undulation"
          />
          <feDisplacementMap
            in="effect1_noise"
            in2="undulation"
            scale="5.52"
            xChannelSelector="R"
            yChannelSelector="G"
            result="displacedImage"
          />
          <feMerge result="effect2_texture">
            <feMergeNode in="displacedImage" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

/**
 * How booking works, printed on a ticket (the owner's design, image-62).
 *
 * The band is one ticket: the owner's shape behind everything, the photograph
 * filling the left of it, the three moves on a light card on the right, and
 * their "Booking in 3 moves" lettering straddling the perforation between them.
 * The lettering is the owner's SVG, kept as a file rather than redrawn: it is
 * their artwork, noise and drop shadow included.
 *
 * On a phone the halves stack and the lettering drops between them, which is
 * the one place it can go once there is no gap beside it.
 *
 * The measured design is in the reference: cream ticket, a photograph inset
 * from its edges, and a card of nearly the page's own white on the right. In
 * dark mode the ticket turns the theme's card tone and the panel a step off it,
 * so the band sits in the dark theme instead of glaring out of it.
 */
export function BookingSteps() {
  return (
    // The ticket's proportions only read in landscape: its corner bites and the
    // perforation are drawn into the shape, and a stretched portrait copy turns
    // the bites into hairline slots. So below md the band is the same colour as
    // a plain rounded card, and the owner's shape takes over from md up.
    <section
      aria-labelledby="home-how"
      data-ticket
      className="relative mt-20 overflow-hidden rounded-[1.75rem] bg-ticket-frame sm:mt-32 md:overflow-visible md:rounded-none md:bg-transparent"
    >
      <div
        data-ticket-shape
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden text-ticket-frame md:block"
      >
        <TicketShape />
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
            <div aria-hidden="true" className="ticket-noise pointer-events-none absolute inset-0 opacity-20" />
          </div>

          {/* The owner's lettering. On a phone it is a row between the two
              halves; from md up it is lifted out of the grid and centred on the
              ticket's perforation, which falls in the gap between them. */}
          <div
            data-ticket-art
            className="relative z-10 mx-auto w-[168px] sm:w-[184px] md:absolute md:left-[56%] md:top-1/2 md:mx-0 md:w-[196px] md:-translate-x-1/2 md:-translate-y-1/2 lg:w-[212px]"
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
            <div aria-hidden="true" className="ticket-noise pointer-events-none absolute inset-0 opacity-15" />
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
