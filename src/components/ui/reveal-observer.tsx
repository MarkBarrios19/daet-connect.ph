"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Anything still waiting to be revealed. */
const WAITING = "[data-reveal]:not([data-revealed])";

/**
 * The one-time section reveal.
 *
 * Sections marked `data-reveal` used to be animated by a scroll-linked CSS
 * animation (`animation-timeline: view()`), which ties opacity to how far the
 * element is into the viewport: whatever was part-way in stayed part-way
 * transparent, which read as a half-faded ghost and failed contrast. This marks
 * an element once, when it first arrives, and then stops watching it — so a
 * section is either on its way in or done, never parked in between.
 *
 * Without JavaScript nothing is hidden in the first place: the rules in
 * globals.css only apply under `html.js`.
 *
 * That gate is also why a section that is never watched is invisible for good.
 * The scan below used to run once, when this mounted, so anything that arrived
 * later — a streamed section, or one a child mounts when it scrolls into view —
 * was never observed and never shown. The owner photographed the result: the
 * hero, then a screen of bare canvas under it with no text anywhere. So the
 * page is now watched for new sections as well, and anything that has reached
 * the fold is shown whether or not the observer ever reported it.
 */
export function RevealObserver() {
  // Pages are client-navigated too, and a new page's sections are new elements.
  const pathname = usePathname();

  useEffect(() => {
    let waiting = Array.from(document.querySelectorAll<HTMLElement>(WAITING));
    if (waiting.length === 0 && typeof MutationObserver === "undefined") return;

    const reveal = (element: Element) => element.setAttribute("data-revealed", "");

    if (typeof IntersectionObserver === "undefined") {
      waiting.forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          reveal(entry.target);
          observer.unobserve(entry.target);
          forget(entry.target);
        });
      },
      // A little inside the bottom edge, so a section is already moving by the
      // time its first line is comfortably in view.
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    );

    /** A revealed section is done with: stop watching it and stop counting it. */
    const forget = (element: Element) => {
      waiting = waiting.filter((candidate) => candidate !== element);
    };

    const watch = (element: Element) => {
      if (element.hasAttribute("data-revealed")) return;
      observer.observe(element);
    };

    waiting.forEach(watch);

    // A section added after the scan above — streamed in, or mounted by a child
    // that only renders once it is in view — has to be picked up here, or the
    // gate above hides it for the life of the page.
    const additions =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver((records) => {
            records.forEach((record) => {
              record.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                if (node.matches("[data-reveal]") && !node.hasAttribute("data-revealed")) {
                  waiting.push(node as HTMLElement);
                  watch(node);
                }
                node.querySelectorAll<HTMLElement>(WAITING).forEach((element) => {
                  waiting.push(element);
                  watch(element);
                });
              });
            });
          });
    additions?.observe(document.body, { childList: true, subtree: true });

    // Whatever has reached the fold shows itself, watched or not. A section that
    // slipped through — the observer was not pointed at it, or the scroll landed
    // before the callback did — cannot be left as a blank stretch of the page.
    const sweep = () => {
      if (waiting.length === 0) return;
      const fold = window.innerHeight * 0.9;
      waiting.slice().forEach((element) => {
        if (element.getBoundingClientRect().top >= fold) return;
        reveal(element);
        observer.unobserve(element);
        forget(element);
      });
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sweep();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      additions?.disconnect();
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
