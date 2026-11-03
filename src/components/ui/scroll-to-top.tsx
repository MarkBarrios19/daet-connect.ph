"use client";

import { useEffect, useState } from "react";

/**
 * Back to the top, at the foot of the page.
 *
 * The site's pages run long — the home page alone is a hero, the places, the
 * ticket, the map, the FAQ — so a visitor who has read to the end of one walks
 * back through all of it. This is the one-tap way back: a 44px button centred at
 * the bottom, and it only exists once there is something behind them to go back
 * over, which is a viewport's worth of reading.
 *
 * It keeps the header's own quiet paper — the surface token at 92% with an
 * inset hairline — so it reads as part of the page rather than as another
 * floating chat button, and it sits at `z-30`: under the header, under the
 * dashboard's tab bar, over the page.
 *
 * The arrow is the page's blue on light paper and white on the dark one (owner's
 * note, image-80): the brand's own blue rather than the ink, so the one moving
 * thing on the page is the one thing that is action-coloured.
 *
 * `raised` lifts it clear of that tab bar, which a signed-in visitor has at the
 * foot of a phone's screen (role-tab-bar.tsx); AssistantWidget does the same
 * thing with its own pill.
 *
 * The page scrolls smoothly unless the visitor has asked for less motion, and
 * then it jumps: `scroll-behavior: auto !important` in globals.css cannot
 * override a programmatic `behavior: "smooth"`, so the check is here.
 */
export function ScrollToTop({ raised = false }: { raised?: boolean }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight);
    // A reload keeps the scroll position: ask once, so the button is there
    // before the visitor touches anything.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!shown) return null;

  const toTop = () => {
    // Older browsers have no `matchMedia`; they get the smooth scroll.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      className={`fixed left-1/2 z-30 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full bg-surface/92 text-blue-700 ring-1 ring-daet-ink/10 backdrop-blur-md transition hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:bg-muted-strong print:hidden dark:bg-slate-950/85 dark:text-white dark:ring-white/15 dark:hover:bg-slate-900 dark:active:bg-white/20 ${
        raised
          ? "bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-6"
          : "bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-6"
      }`}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
