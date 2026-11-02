"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { LineIcon } from "@/components/ui/icons";

/**
 * What the open photo does, said plainly while the visitor is looking at it.
 *
 * Four cues, one at a time: drag to look along the photo, flick left or right to
 * step to the next place, fold the card with its caret, and — the way back to
 * the fan — a tap on a phone or a double-click on a desktop. Each fades in,
 * holds, and makes way for the next; the whole set is gone in about seven
 * seconds, and the fan takes it away the moment the visitor does any of it.
 *
 * It takes no pointer events, so a gesture that starts on top of a cue reaches
 * the photo underneath. With reduced motion nothing moves: the four cues stand
 * together, readable for five seconds, then fade — the words are the message,
 * not the movement.
 */
export function GestureHints({ phone, onDone }: { phone: boolean; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const pills = useRef<Array<HTMLDivElement | null>>([]);
  const hand = useRef<SVGSVGElement>(null);
  const sweep = useRef<HTMLSpanElement>(null);
  const finished = useRef(onDone);
  finished.current = onDone;

  const cues = [
    { id: "look", caption: "Drag to look around", glyph: "hand" },
    { id: "step", caption: "Flick left or right to step", glyph: "swap" },
    { id: "fold", caption: "Fold the card with its caret", glyph: "caret" },
    {
      id: "back",
      caption: phone ? "Tap the photo to go back" : "Double-click the photo to go back",
      glyph: "back",
    },
  ] as const;

  useGSAP(() => {
    if (!root.current) return;
    const list = pills.current.filter((element): element is HTMLDivElement => Boolean(element));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeline = gsap.timeline({ onComplete: () => finished.current() });

    if (reduced) {
      gsap.set(list, { autoAlpha: 1 });
      timeline.to({}, { duration: 5 }).to(root.current, { autoAlpha: 0, duration: 0.5 });
      return;
    }

    gsap.set(list, { autoAlpha: 0, y: 10 });

    list.forEach((pill, index) => {
      timeline.to(pill, {
        autoAlpha: 1,
        y: 0,
        duration: 0.3,
        ease: "power2.out",
      });

      if (index === 0 && hand.current) {
        // The hand leads, one lazy lap each way, and settles.
        timeline
          .to(hand.current, { x: 16, rotate: 6, duration: 0.4, ease: "power2.inOut" }, "<")
          .to(hand.current, {
            x: -16,
            rotate: -6,
            duration: 0.55,
            ease: "power2.inOut",
          })
          .to(hand.current, {
            x: 0,
            rotate: 0,
            duration: 0.4,
            ease: "power2.inOut",
          });
      }

      if (index === 1 && sweep.current) {
        // The chevrons sweep the way a flick goes, then the other way.
        timeline.fromTo(
          sweep.current,
          { x: 10 },
          {
            x: -10,
            duration: 0.45,
            yoyo: true,
            repeat: 1,
            ease: "power2.inOut",
          },
          "<",
        );
      }

      timeline.to(pill, { autoAlpha: 0, duration: 0.25 }, "+=0.75");
    });
  });

  return (
    <div
      ref={root}
      data-gesture-hints
      className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-4"
    >
      <div className="mx-auto flex w-fit max-w-full flex-col items-center gap-2">
        {cues.map((cue, index) => (
          <div
            key={cue.id}
            ref={(element) => {
              pills.current[index] = element;
            }}
            data-gesture-cue={cue.id}
            className="flex max-w-full items-center gap-2 rounded-full bg-slate-950/75 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center">
              {cue.glyph === "hand" && (
                // An open hand, on the same 24px grid and 1.5px stroke as the
                // rest of the site's line icons.
                <svg
                  ref={hand}
                  viewBox="0 0 24 24"
                  data-gesture-hand
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9.25 11.5V6.75a1.5 1.5 0 0 1 3 0v4.25" />
                  <path d="M12.25 11V5.25a1.5 1.5 0 0 1 3 0V11" />
                  <path d="M15.25 11V7.25a1.5 1.5 0 0 1 3 0v7" />
                  <path d="M9.25 11.5V9.75a1.5 1.5 0 0 0-3 0v4.5c0 3.6 2.9 6.5 6.5 6.5h1.5a5.75 5.75 0 0 0 5.75-5.75" />
                </svg>
              )}

              {cue.glyph === "swap" && (
                <span ref={sweep} data-gesture-sweep className="block">
                  <LineIcon name="swap" className="h-5 w-5" />
                </span>
              )}

              {cue.glyph === "caret" && (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              )}

              {cue.glyph === "back" && <LineIcon name="return" className="h-5 w-5" />}
            </span>

            <span>{cue.caption}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
