"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { openAssistant } from "@/lib/ui-overlay";
import {
  DEFAULT_HERO_SIZE,
  fanGeometry,
  midVector,
  pointAboveHeadline,
  type FanLayout,
} from "./fan-geometry";
import type { FanPlace } from "./fan-places";
import { PlaceDetail } from "./place-detail";
import type { MapPoint } from "./place-map-panel";
import { useFanAnimation } from "./use-fan-animation";
import { useHeroFold } from "./use-hero-fold";
import { usePlaceHash } from "./use-place-hash";

/** A horizontal drag longer than this, on a phone, moves to the next place. */
const SWIPE_AFTER = 40;

/**
 * The place fan: six photos of Daet cut into wedges that radiate from a point
 * near the bottom of the hero, with the headline standing in the dark under
 * that point.
 *
 * Each wedge is a real button with a real `clip-path`; the URL hash is the
 * source of truth for which one is open (`#place-bagasbas-beach`), so Back
 * closes and a shared link opens straight onto a place. Motion lives in
 * use-fan-animation; the panel in PlaceDetail.
 */
export function PlaceFan({
  places,
  signedIn,
  mapPlaces = [],
}: {
  places: FanPlace[];
  signedIn: boolean;
  /** The places the open card's map can pin, with the coordinates from the places table. */
  mapPlaces?: MapPoint[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const wedgeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastOpen = useRef<number | null>(null);
  // The index this component has already animated open, so a hash it set
  // itself is not opened a second time by the effect below.
  const driven = useRef<number | null>(null);
  const firstPaint = useRef(true);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_HERO_SIZE.width,
    height: DEFAULT_HERO_SIZE.height,
  });
  const [layout, setLayout] = useState<FanLayout>("desktop");
  // Where the fan's point should be. Null until the headline has been measured,
  // which leaves the server's standing value in place.
  const [pointY, setPointY] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    // `clientWidth`/`clientHeight`, not `getBoundingClientRect()`: the page fold
    // slides and, before this, scaled the section, and a transformed box
    // measures smaller than the element the shapes are written for.
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;

      // The fan's point goes just above the headline, so the headline stands in
      // the dark below the fan instead of on a photo. Clamped, so a very short
      // screen can't push the point past the middle of the hero.
      const headlineTop = headlineRef.current?.offsetTop ?? 0;
      setPointY(Math.round(pointAboveHeadline(headlineTop, height)));

      setSize({ width, height });
      // A landscape phone keeps one fan of six; anything else under 768 is two.
      const landscapePhone = height < 500;
      setLayout(width >= 768 || landscapePhone ? "desktop" : "phone");
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const geometry = useMemo(
    () =>
      fanGeometry(size.width, size.height, layout, pointY === null ? {} : { vpY: pointY }),
    [size.width, size.height, layout, pointY],
  );

  const slugs = useMemo(() => places.map((place) => place.slug), [places]);
  const { openSlug, open: openInUrl, close: closeInUrl } = usePlaceHash(slugs);

  const openIndex = openSlug ? places.findIndex((place) => place.slug === openSlug) : -1;
  const openPlace = openIndex >= 0 ? places[openIndex] : null;

  const onPhone = layout === "phone";
  // 520–640px of hero has no room for the subline as well as the buttons.
  const tight = !onPhone && size.height < 640;
  // A landscape phone keeps the desktop fan but has no chips and wants its
  // place full screen, so it borrows the phone's sheet.
  const shortHero = size.height < 500;
  const sheet = onPhone || shortHero;
  const isOpen = openIndex >= 0;

  // An open place is the hero's whole screen filled by one photo, so the scroll
  // fold steps out of the way: lifting the fan would uncover a band of the
  // hero's own ground along the bottom edge.
  useHeroFold(sectionRef, { paused: isOpen });

  const describe = useCallback(
    (index: number) => `${places[index].name}, ${index + 1} of ${places.length}`,
    [places],
  );

  const { hover, openAt, close: closeAnimation, swapTo, parallax } = useFanAnimation({
    root: sectionRef,
    geometry,
    // Focus follows the panel in and the wedge back out, so the next Tab, arrow
    // or Escape lands where the visitor is looking.
    onOpened: () => headingRef.current?.focus(),
    onClosed: () => {
      const index = lastOpen.current;
      lastOpen.current = null;
      if (index !== null) wedgeRefs.current[index]?.focus();
    },
  });

  // The URL is the truth: a link on first load, Back and Forward, and a pin on
  // the map further down the page all arrive here. The first one opens
  // instantly, with no fold-in; the rest fold in like a click would.
  useEffect(() => {
    if (openIndex < 0) {
      driven.current = -1;
      return;
    }
    if (driven.current === openIndex) return;

    driven.current = openIndex;
    lastOpen.current = openIndex;
    setAnnouncement(describe(openIndex));
    openAt(openIndex, { instant: firstPaint.current });
  }, [openIndex, openAt, describe]);

  useEffect(() => {
    firstPaint.current = false;
  }, []);

  // Re-measuring (a rotation, a resize) rebuilds the shapes, so an open place
  // has to be put back on top of them.
  useEffect(() => {
    if (openIndex >= 0) openAt(openIndex, { instant: true });
    // Deliberately keyed on the geometry alone: openAt is re-created every render.
  }, [geometry]);

  const open = useCallback(
    (index: number) => {
      lastOpen.current = index;
      driven.current = index;
      openInUrl(places[index].slug);
      setAnnouncement(describe(index));
      hover(null);
      openAt(index);
    },
    [places, openInUrl, describe, hover, openAt],
  );

  const close = useCallback(() => {
    driven.current = -1;
    closeInUrl();
    setAnnouncement("");
    // lastOpen stays put: the fan's close animation reads it to put focus back
    // on the wedge the panel came from.
    closeAnimation();
  }, [closeInUrl, closeAnimation]);

  /** Next/previous, wrapping: the panel cross-fades rather than folding back. */
  const step = useCallback(
    (delta: number) => {
      if (openIndex < 0) return;
      const next = (openIndex + delta + places.length) % places.length;
      lastOpen.current = next;
      driven.current = next;
      openInUrl(places[next].slug);
      setAnnouncement(describe(next));
      swapTo(next);
    },
    [openIndex, places, openInUrl, describe, swapTo],
  );

  // A wheel over an open place is someone trying to leave the hero: close
  // first, then let the page scroll as it normally would.
  useEffect(() => {
    if (openIndex < 0) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) close();
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [openIndex, close]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && openIndex >= 0) {
      event.stopPropagation();
      close();
      return;
    }

    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const delta = event.key === "ArrowRight" ? 1 : -1;

    if (openIndex >= 0) {
      event.preventDefault();
      step(delta);
      return;
    }

    // Closed: the arrows walk the fan and take focus with them.
    const current = wedgeRefs.current.findIndex((element) => element === document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = (current + delta + places.length) % places.length;
    wedgeRefs.current[next]?.focus();
  };

  /**
   * On a phone the open view covers the screen, so a sideways flick moves to
   * the next place. Mostly-vertical drags belong to the sheet, not to this.
   */
  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    swipeFrom.current = onPhone && openIndex >= 0 ? { x: event.clientX, y: event.clientY } : null;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from) return;

    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) < SWIPE_AFTER || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    step(dx < 0 ? 1 : -1);
  };

  /**
   * Rest offset for a wedge's photo: out along its mid angle, then scaled up.
   *
   * Numbers, and also written onto the element as `data-nudge-x`/`-y`, because
   * the motion layer has to be able to put the photo *back* here: an open place
   * fills the hero, and a photo still pushed out along its old wedge leaves the
   * corner of the screen empty.
   */
  const photoNudge = (index: number) => {
    const [ux, uy] = midVector(geometry.wedges[index].mid);
    const offset = 0.18 * Math.min(size.width, size.height);
    return { x: Number((ux * offset).toFixed(2)), y: Number((uy * offset).toFixed(2)) };
  };

  /** Chip position: a short way out from the apex, along the same mid angle. */
  const chipPosition = (index: number) => {
    const wedge = geometry.wedges[index];
    const [ux, uy] = midVector(wedge.mid);
    // The mock-up puts the phone tags 150px out from the point.
    const reach = onPhone ? 150 : 0.3 * Math.min(size.width, size.height);
    return {
      left: `${(wedge.vp[0] + ux * reach).toFixed(1)}px`,
      top: `${(wedge.vp[1] + uy * reach).toFixed(1)}px`,
    };
  };

  return (
    // The header is a scrim pinned over the top of the page, so the photos run up
    // under it: the hero starts at the top of the page and ends at the fold.
    //
    // No `overscroll-contain` on it: the hero is the whole first screen, so
    // containing the wheel there left the page unscrollable from the top. The
    // place panel keeps its own, which is where it is needed.
    <section
      ref={sectionRef}
      aria-labelledby="home-title"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      style={sheet && isOpen ? { touchAction: "none" } : undefined}
      className="relative -mt-[var(--header-h)] h-[100svh] max-h-[1080px] min-h-[520px] w-full overflow-hidden bg-canvas dark:bg-slate-900"
    >
      <div role="group" aria-label="Places in Daet" className="absolute inset-0 z-0">
        {places.map((place, index) => {
          const nudge = photoNudge(index);
          return (
          <button
            key={place.slug}
            ref={(element) => {
              wedgeRefs.current[index] = element;
            }}
            type="button"
            data-wedge={index}
            aria-label={`${place.name}: ${openIndex === index ? "close" : "open"} photo and details`}
            aria-expanded={openIndex === index}
            aria-controls="place-detail"
            style={{ clipPath: geometry.wedges[index].rest }}
            onClick={() => (openIndex === index ? close() : open(index))}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse" && !onPhone && openIndex < 0) hover(index);
            }}
            onPointerLeave={(event) => {
              // Not while a place is open: that hover would resize the
              // full-screen photo under the visitor (it zoomed to 1.15).
              if (event.pointerType === "mouse" && !onPhone && openIndex < 0) hover(null);
            }}
            // A keyboard visitor gets the same name a mouse visitor does. Only
            // for `:focus-visible`, so a click that happens to focus a wedge
            // doesn't pin a tag on after the pointer has gone.
            onFocus={(event) => {
              if (onPhone || openIndex >= 0 || !focusVisible(event.currentTarget)) return;
              hover(index);
            }}
            onBlur={() => {
              if (onPhone || openIndex >= 0) return;
              hover(null);
            }}
            onPointerMove={(event) => {
              if (event.pointerType !== "mouse" || onPhone || openIndex >= 0) return;
              const box = sectionRef.current?.getBoundingClientRect();
              if (!box) return;
              parallax(index, ((event.clientX - box.left) / box.width - 0.5) * 0.02 * box.width);
            }}
            className="group absolute inset-0 m-0 block cursor-pointer border-0 bg-canvas p-0 text-left dark:bg-slate-900"
          >
            {/* Two layers: the outer one is GSAP's (scale, and the parallax
                nudge), the inner one holds the still radial offset that keeps
                each photo looking down its own wedge. */}
            <span data-photo={index} className="absolute inset-0 block" style={{ transform: "scale(1.15)" }}>
              {/* The photo's rest offset, out along its own wedge. The motion
                  layer owns this one: it reads the two numbers off the element
                  and puts the photo back to nought while its place is open, so
                  the open view is full-bleed instead of leaving the corner its
                  wedge pointed at empty. One owner, so nothing has to cancel
                  anything else out. */}
              {/* The inline transform is for the server's first paint (and for a
                  visitor without scripts) only: from hydration the motion layer
                  owns it, and can take it back to nought. */}
              <span
                data-nudge
                data-nudge-x={nudge.x}
                data-nudge-y={nudge.y}
                className="absolute inset-0 block"
                style={{ transform: `translate(${nudge.x}px, ${nudge.y}px)` }}
              >
                <Image
                  src={place.photo.src}
                  alt={place.photo.alt}
                  fill
                  priority={index < 2}
                  sizes="100vw"
                  className="object-cover"
                />
              </span>
            </span>

            {/* The chip is the wedge's label: clip-path eats outlines, so focus
                shows here instead. Always on for phones, on hover/focus for a
                mouse, and not at all on a landscape phone. */}
            {/* GSAP owns this tag's visibility and nothing else does: the CSS
                hover/focus classes used to fight its inline style, which left
                the last name stuck on screen after the pointer left. */}
            {!shortHero && (
              <span
                data-chip={index}
                aria-hidden="true"
                style={{
                  ...chipPosition(index),
                  ...(onPhone ? {} : { opacity: 0, visibility: "hidden" as const }),
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950/80 px-3 py-1.5 text-sm font-semibold text-white group-focus-visible:ring-2 group-focus-visible:ring-blue-300"
              >
                {onPhone ? place.shortName : place.name}
              </span>
            )}
          </button>
          );
        })}
      </div>

      {/* Headline: below the apex on a desktop fan, in the band between the two
          phone fans. Pointer events pass through to the wedges except on the
          buttons themselves. */}
      <div
        ref={headlineRef}
        data-headline
        className={`pointer-events-none absolute inset-x-0 z-10 px-4 text-center ${isOpen ? "opacity-0" : ""}`}
        style={onPhone ? { top: "49%" } : { bottom: "7%" }}
      >
        <h1
          id="home-title"
          className={
            onPhone || tight
              ? "display-2 text-daet-ink dark:text-white"
              : "display-1 text-daet-ink dark:text-white"
          }
        >
          {/* The lead-in runs a step smaller than the statement under it, as in
              the mock (owner's note on image-2: "make this smaller"). */}
          <span className="block text-[0.85em]">Start in Daet.</span>
          <span className="block">Go anywhere in Camarines Norte.</span>
        </h1>

        {onPhone ? (
          // The band between the two fans is only about 150px tall: the
          // headline and the hint fit, the long subline and the buttons do not.
          <p className="mt-2 text-sm text-daet-ink/80 dark:text-white/80">Tap a place to see it</p>
        ) : (
          <>
            {!tight && (
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-daet-ink/80 dark:text-white/90 sm:text-base">
                Beaches, islands and old-town walks, with operators and guides verified by the Daet Tourism
                Office.
              </p>
            )}
            {/* Behind an open place this row is invisible, so it must not be
                tabbable either — the heading above it stays readable. */}
            <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-3" inert={isOpen}>
              <ButtonLink href="/tours/browse" size="lg">
                Find a tour
              </ButtonLink>
              {signedIn ? (
                <ButtonLink href="/dashboard" size="lg" variant="onBlue">
                  My dashboard
                </ButtonLink>
              ) : (
                <button
                  type="button"
                  onClick={() => openAssistant()}
                  className="inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-bold text-daet-ink ring-1 ring-inset ring-daet-ink/30 transition hover:bg-muted active:bg-muted-strong dark:text-white dark:ring-white/60 dark:hover:bg-white/10 dark:active:bg-white/20"
                >
                  Ask the travel guide
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Without JavaScript the wedges are inert, so leave a plain list of the
          same six places where the headline sits. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html: `<div style="position:absolute;left:0;right:0;bottom:0;z-index:30;background:rgba(15,23,42,.95);padding:1rem;text-align:center;color:#fff;font-size:.875rem"><p style="margin:0 0 .5rem;font-weight:700">Places in Daet</p><ul style="display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1rem;margin:0;padding:0;list-style:none">${places
            .map(
              (place) =>
                `<li><a style="color:#bfdbfe;text-decoration:underline" href="${escapeHtml(place.href)}">${escapeHtml(place.name)}</a></li>`,
            )
            .join("")}</ul></div>`,
        }}
      />

      {/* The panel's slot is always in the tree so aria-controls always resolves. */}
      <div id="place-detail" className="pointer-events-none absolute inset-0 z-20">
        {openPlace && (
          <PlaceDetail
            place={openPlace}
            index={openIndex}
            total={places.length}
            phone={sheet}
            headingRef={headingRef}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            places={mapPlaces}
            onPick={(slug) => {
              const index = places.findIndex((place) => place.slug === slug);
              if (index >= 0 && index !== openIndex) open(index);
            }}
          />
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/** Does this element match `:focus-visible`? Older jsdom builds don't say. */
function focusVisible(element: HTMLElement) {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** The no-JS list is built as a string, so its two dynamic fields are escaped. */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
