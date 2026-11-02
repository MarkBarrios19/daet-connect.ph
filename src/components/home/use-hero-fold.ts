"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

/**
 * The fold: as the hero scrolls out, the fan lifts a little.
 *
 * The headline used to fade out over the first 60% of that, "so the page's first
 * heading arrives underneath it" — but the hero scrolls out of the way by
 * itself, so there was nothing for the fade to protect, and the owner reported
 * the opposite of a fold: after opening a place, stepping twice, leaving it and
 * scrolling, the hero's words and its buttons kept vanishing under the pointer.
 * The words are simply left alone now; the fan still lifts.
 *
 * The section itself never moves. Scaling it, as this used to, shrank the hero
 * into a boxed card with white margins beside and below it — and because
 * `getBoundingClientRect()` reports a transformed box, it could also make the
 * fan rebuild its shapes at the wrong size mid-scroll. Only the two layers
 * inside it scrub: the wedges' group and the headline.
 *
 * Desktop only, and never under `prefers-reduced-motion` — on a phone the hero
 * is the whole screen and the fan is the thing being tapped, so moving it while
 * a thumb is on the glass would be a nuisance. It is scrubbed rather than
 * pinned: a pinned hero that misbehaves takes the whole page with it.
 *
 * Image height changes move every trigger below them, so the triggers are
 * refreshed once the page has finished loading.
 *
 * `paused` is for an open place. That view is the hero's whole screen filled by
 * one photo, and lifting the fan by 8% uncovers a band of the hero's own ground
 * along the bottom edge — which reads as the photo not being full screen. So
 * opening a place takes the fold away entirely, and closing it puts the fold
 * back where the scroll position says it should be.
 */
export function useHeroFold(root: RefObject<HTMLElement | null>, { paused = false }: { paused?: boolean } = {}) {
  const refreshQueued = useRef(false);
  const { contextSafe } = useGSAP(
    () => {
      if (paused) return;

      const media = gsap.matchMedia();

      media.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const section = root.current;
        if (!section) return;

        const fan = section.querySelector("[role='group']");
        const tweens: ReturnType<typeof gsap.to>[] = [];

        if (fan) {
          tweens.push(
            gsap.to(fan, {
              yPercent: -8,
              ease: "none",
              scrollTrigger: {
                trigger: section,
                start: "top top",
                end: "bottom top",
                scrub: true,
              },
            }),
          );
        }

        return () => {
          tweens.forEach((tween) => {
            tween.scrollTrigger?.kill();
            tween.kill();
          });
        };
      });

      return () => media.revert();
    },
    // revertOnUpdate: without it the previous context — and the scroll trigger
    // inside it — is left alive, which is exactly the fold that has to stop.
    { scope: root, dependencies: [paused], revertOnUpdate: true },
  );

  // Photos land after the first paint and change the height of everything below.
  const refresh = contextSafe(() => {
    if (refreshQueued.current) return;
    refreshQueued.current = true;
    requestAnimationFrame(() => {
      refreshQueued.current = false;
      ScrollTrigger.refresh();
    });
  });

  useEffect(() => {
    refresh();
    window.addEventListener("load", refresh);
    return () => window.removeEventListener("load", refresh);
  }, [refresh]);
}
