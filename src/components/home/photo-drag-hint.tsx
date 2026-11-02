"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

/**
 * The hand that says the open photo can be dragged.
 *
 * It fades in over the photo when a place opens, sways left and right twice —
 * the hand leads, and the two chevrons either side brighten in the direction it
 * is going — and then fades away on its own. It also goes the moment the
 * visitor actually drags the photo (the fan unmounts it), so it never sits over
 * a gesture it has already taught.
 *
 * It takes no pointer events: dragging through it works like dragging through
 * the photo. With reduced motion the hand is still shown, but still, and the
 * caption carries the message; there is nothing to sway.
 */
export function PhotoDragHint({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLSpanElement>(null);
  const left = useRef<SVGSVGElement>(null);
  const right = useRef<SVGSVGElement>(null);
  const finished = useRef(onDone);
  finished.current = onDone;

  useGSAP(() => {
    if (!root.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const still = 0.55;
    const timeline = gsap.timeline({ onComplete: () => finished.current() });

    timeline.fromTo(
      root.current,
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" },
    );
    gsap.set([left.current, right.current], { opacity: still });

    if (!reduced && hand.current) {
      for (let lap = 0; lap < 2; lap += 1) {
        timeline
          // Right: the hand leads, the chevron it travels towards lights up.
          .to(hand.current, { x: 26, rotate: 4, duration: 0.62, ease: "power2.inOut" })
          .to(right.current, { opacity: 1, duration: 0.3 }, "<")
          .to(left.current, { opacity: still, duration: 0.3 }, "<")
          // …and back the other way.
          .to(hand.current, { x: -26, rotate: -4, duration: 0.78, ease: "power2.inOut" })
          .to(left.current, { opacity: 1, duration: 0.3 }, "<")
          .to(right.current, { opacity: still, duration: 0.3 }, "<")
          // Settle, and breathe before the second lap.
          .to(hand.current, { x: 0, rotate: 0, duration: 0.52, ease: "power2.inOut" })
          .to([left.current, right.current], { opacity: still, duration: 0.3 }, "<")
          .to({}, { duration: 0.25 });
      }
      timeline.to({}, { duration: 0.3 });
    } else {
      // Something to read, rather than a hand waving at nothing.
      timeline.to({}, { duration: 3.4 });
    }

    timeline.to(root.current, { autoAlpha: 0, duration: 0.5, ease: "power2.in" });
  });

  return (
    <div
      ref={root}
      data-drag-hint
      className="pointer-events-none absolute inset-x-0 top-[50%] z-20 flex flex-col items-center gap-3"
    >
      <span className="flex items-center gap-1.5">
        <svg ref={left} viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>

        <span
          ref={hand}
          data-drag-hand
          className="grid h-16 w-16 place-items-center rounded-full bg-slate-950/70 text-white ring-1 ring-white/25 backdrop-blur-md"
        >
          {/* An open hand, drawn on the same 24px grid and 1.5px stroke as the
              rest of the site's line icons. */}
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9.25 11.5V6.75a1.5 1.5 0 0 1 3 0v4.25" />
            <path d="M12.25 11V5.25a1.5 1.5 0 0 1 3 0V11" />
            <path d="M15.25 11V7.25a1.5 1.5 0 0 1 3 0v7" />
            <path d="M9.25 11.5V9.75a1.5 1.5 0 0 0-3 0v4.5c0 3.6 2.9 6.5 6.5 6.5h1.5a5.75 5.75 0 0 0 5.75-5.75" />
          </svg>
        </span>

        <svg ref={right} viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>

      <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
        Drag to look around
      </span>
    </div>
  );
}
