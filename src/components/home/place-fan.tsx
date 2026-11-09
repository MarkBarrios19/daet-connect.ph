"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button, ButtonLink } from "@/components/ui/button";
import { openAssistant } from "@/lib/ui-overlay";
import {
  DEFAULT_HERO_SIZE,
  fanGeometry,
  midVector,
  pointAboveHeadline,
  type FanInsets,
  type FanLayout,
} from "./fan-geometry";
import type { FanPlace } from "./fan-places";
import { PlaceDetail } from "./place-detail";
import { DRAG_AFTER, PAN_CENTRE, coverRoom, panBy, panStyle, type PanPosition } from "./photo-pan";
import { GestureHints } from "./gesture-hints";
import { flickStep } from "./flick";
import type { MapPoint } from "./place-map-panel";
import { useFanAnimation } from "./use-fan-animation";
import { useHeroFold } from "./use-hero-fold";
import { usePlaceHash } from "./use-place-hash";

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
  canBook = false,
  mapPlaces = [],
}: {
  places: FanPlace[];
  signedIn: boolean;
  /** Only verified tourist accounts may start a booking. */
  canBook?: boolean;
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
  /** Where the open photo is looking: object-position, as percentages. */
  const [pan, setPan] = useState<PanPosition>(PAN_CENTRE);
  const panRef = useRef<PanPosition>(PAN_CENTRE);
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    /** Where the pointer is now, for telling a flick from a slow look. */
    to: { x: number; y: number };
    /** When it went down, in ms, for the same reason. */
    at: number;
    start: PanPosition;
    room: { x: number; y: number };
    /** Whether this press has taken the pointer, which only a drag does. */
    captured: boolean;
  } | null>(null);
  /** When the place last closed, so a second tap of a double tap is not a re-open. */
  const closedAt = useRef(0);
  /** Set by a drag, so the release does not also count as a tap on the photo. */
  const dragged = useRef(false);
  const swallowClick = useRef(false);
  /** The hand has already shown itself for a photo the visitor dragged. */
  const hintTaught = useRef(false);
  const [hint, setHint] = useState(false);

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_HERO_SIZE.width,
    height: DEFAULT_HERO_SIZE.height,
  });
  // The server cannot know the device viewport. Keep the fan and the layout
  // that depends on it hidden until the browser has supplied real dimensions.
  const [heroMeasured, setHeroMeasured] = useState(false);
  const [layout, setLayout] = useState<FanLayout>("desktop");
  // Where the fan's point should be. Null until the headline has been measured,
  // which leaves the server's standing value in place.
  const [pointY, setPointY] = useState<number | null>(null);
  // What covers the hero's top and foot: the sticky header sits over it, and the
  // dashboard's tab bar over its bottom, so the two phone fans mirror each other
  // about what is left.
  const [insets, setInsets] = useState<FanInsets>({ top: 0, bottom: 0 });
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    let frame = 0;
    const tabBar = document.querySelector<HTMLElement>('nav[aria-label="Dashboard"]');
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

      // The sticky bar the hero starts under, and the tab bar fixed over its
      // foot: both take visible room, so the fans are centred on neither.
      const header = document.querySelector("header");
      const top = header?.getBoundingClientRect().height ?? 0;
      const bottom = tabBar && getComputedStyle(tabBar).display !== "none" ? tabBar.getBoundingClientRect().height : 0;
      setInsets((was) => (was.top === top && was.bottom === bottom ? was : { top, bottom }));

      setSize({ width, height });
      // A landscape phone keeps one fan of six; anything else under 768 is two.
      const landscapePhone = height < 500;
      setLayout(width >= 768 || landscapePhone ? "desktop" : "phone");
      setHeroMeasured(true);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(element);
    if (tabBar) observer?.observe(tabBar);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, []);

  const geometry = useMemo(
    () =>
      fanGeometry(size.width, size.height, layout, {
        ...(pointY === null ? {} : { vpY: pointY }),
        insets,
      }),
    [size.width, size.height, layout, pointY, insets],
  );

  /** The band between the phone's two fans, where the headline stands. */
  const bandCentre = geometry.fans.length === 2 ? (geometry.fans[0].vp[1] + geometry.fans[1].vp[1]) / 2 : null;

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

  // The hand that says the photo drags, until this visitor has dragged one.
  useEffect(() => {
    if (openIndex < 0) {
      setHint(false);
      return;
    }
    setHint(!hintTaught.current);
  }, [openIndex]);

  // Another place, or none at all: the photo starts looking at its middle again,
  // and no leftover press keeps it from being tapped.
  useEffect(() => {
    panRef.current = PAN_CENTRE;
    setPan(PAN_CENTRE);
    press.current = null;
    dragged.current = false;
    swallowClick.current = false;
  }, [openIndex]);

  // An open place is the hero's whole screen filled by one photo, so the scroll
  // fold steps out of the way: lifting the fan would uncover a band of the
  // hero's own ground along the bottom edge.
  useHeroFold(sectionRef, { paused: isOpen });

  const describe = useCallback((index: number) => `${places[index].name}, ${index + 1} of ${places.length}`, [places]);

  const {
    hover,
    openAt,
    close: closeAnimation,
    swapTo,
    parallax,
  } = useFanAnimation({
    root: sectionRef,
    geometry,
    // Focus follows the panel in and the wedge back out, so the next Tab, arrow
    // or Escape lands where the visitor is looking. `preventScroll` matters: the
    // card folds in from below the photo, so at the moment focus lands it is off
    // screen, and the browser would scroll the page to reach it — half a screen
    // down, with the sheet left floating in the middle of the next section.
    onOpened: () => headingRef.current?.focus({ preventScroll: true }),
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
    returnToHeroTop();
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

  /**
   * The open place is the hero, and the hero is the page's first screen. Opened
   * from a scrolled page — or from a deep link the browser restored a scroll
   * position for — the hero was left half out of view and the sheet floated in
   * the middle of the next section (image-79). Opening brings the page home.
   */
  const returnToHeroTop = useCallback(() => {
    if (typeof window === "undefined" || window.scrollY <= 0) return;
    // `auto` follows the document's global `scroll-behavior: smooth`, which
    // leaves the sheet floating partway down the page while the scroll animates.
    // Opening is a layout correction, not navigation: snap to the hero now.
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const open = useCallback(
    (index: number) => {
      lastOpen.current = index;
      driven.current = index;
      returnToHeroTop();
      openInUrl(places[index].slug);
      setAnnouncement(describe(index));
      hover(null);
      openAt(index);
    },
    [places, openInUrl, describe, hover, openAt, returnToHeroTop],
  );

  const close = useCallback(() => {
    driven.current = -1;
    closedAt.current = Date.now();
    closeInUrl();
    setAnnouncement("");
    // The card goes with the close, and the heading inside it had focus: hand it
    // back to the wedge the panel came from *now*, not when the animation ends. A
    // fold-back that is interrupted (a wheel, a step, a URL change) never reaches
    // its completion callback, and focus would be left on the body with the next
    // arrow key going nowhere. The wedge that was open is the one still on
    // screen, so it can take focus at any point of the animation.
    const index = lastOpen.current;
    if (index !== null) wedgeRefs.current[index]?.focus();
    // lastOpen stays put: the close animation reads it too, and repeating the
    // focus once the fan has settled costs nothing.
    closeAnimation();
  }, [closeInUrl, closeAnimation]);

  /**
   * A step hides the photo that had focus (its wedge slides out and goes), and a
   * hidden element cannot hold focus: the browser drops it on the body and the
   * next arrow key goes nowhere. When that is about to happen, focus moves to the
   * card's heading instead, where the keyboard still reaches the fan. A visitor
   * working the card's own buttons keeps their focus where it is.
   */
  const keepFocusAfterStep = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    const lost = !active || active === document.body || Boolean(active.closest("[data-wedge]"));
    if (lost) headingRef.current?.focus({ preventScroll: true });
  }, []);

  /** Next/previous, wrapping: the panel swipes rather than folding back. */
  const step = useCallback(
    (delta: number) => {
      if (openIndex < 0) return;
      const next = (openIndex + delta + places.length) % places.length;
      lastOpen.current = next;
      driven.current = next;
      openInUrl(places[next].slug);
      setAnnouncement(describe(next));
      swapTo(next, { from: openIndex, direction: delta });
      keepFocusAfterStep();
    },
    [openIndex, places, openInUrl, describe, swapTo, keepFocusAfterStep],
  );

  // A wheel over an open place is someone trying to leave the hero: close
  // first, then let the page scroll as it normally would.
  useEffect(() => {
    if (openIndex < 0) return;

    const onWheel = (event: WheelEvent) => {
      // The map over the open place zooms with the wheel, so a wheel over it is
      // not someone leaving the hero — it is someone looking at the place.
      if (event.target instanceof Element && event.target.closest("[data-place-map]")) return;
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
   * Dragging the open photo looks along it.
   *
   * The open place covers the screen with `object-fit: cover`, so the photo is
   * already cropped: dragging moves which part of it shows through, and the
   * frame can never come up short (photo-pan.ts holds the arithmetic). Only the
   * photo pans — pressing the card, the map or the header leaves them alone —
   * and a drag is not a tap, so letting go does not close the place.
   *
   * A slow drag looks; a quick, flat flick steps to the next or previous place
   * (flick.ts holds where the line falls). The ‹ › pair and the arrow keys step
   * too, and a desktop double-clicks the photo to go back to the fan.
   */
  const movePan = (next: PanPosition) => {
    panRef.current = next;
    setPan(next);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    press.current = null;
    dragged.current = false;
    swallowClick.current = false;
    if (openIndex < 0) return;

    const target = event.target as Element | null;
    const wedge = target?.closest("[data-wedge]") ?? null;
    if (!wedge || Number(wedge.getAttribute("data-wedge")) !== openIndex) return;

    const img = wedge.querySelector("img");
    if (!img) return;

    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      to: { x: event.clientX, y: event.clientY },
      at: Date.now(),
      start: panRef.current,
      room: coverRoom(
        { width: img.clientWidth, height: img.clientHeight },
        { width: img.naturalWidth, height: img.naturalHeight },
      ),
      captured: false,
    };
    // The pointer is deliberately *not* captured here. A captured pointer is
    // retargeted to this section, and the click and double-click that follow are
    // retargeted with it: the photo's own button never hears them, so a phone's
    // tap and a desktop's double-click — the two ways back to the fan — both
    // went nowhere. The capture is taken in onPointerMove, once the hand has
    // actually moved and there is a drag worth following.
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const press_ = press.current;
    if (!press_ || press_.id !== event.pointerId) return;

    press_.to = { x: event.clientX, y: event.clientY };
    const dx = event.clientX - press_.x;
    const dy = event.clientY - press_.y;
    if (!dragged.current && Math.hypot(dx, dy) > DRAG_AFTER) {
      dragged.current = true;
      // Now there is a drag to follow, and the hand may take it off the photo or
      // out of the window: capture keeps the pan under it. The click that ends
      // this press is swallowed in onPointerUp, so the retarget costs nothing.
      if (!press_.captured) {
        press_.captured = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      // The visitor has found the gesture: the hand has done its job.
      hintTaught.current = true;
      setHint(false);
    }
    if (dragged.current) movePan(panBy(press_.start, { dx, dy }, press_.room));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const press_ = press.current;
    press.current = null;
    if (!press_) return;

    if (press_.captured) event.currentTarget.releasePointerCapture?.(press_.id);
    if (!dragged.current) return;

    // A drag that ends over the photo is not a tap: it must not close the place.
    swallowClick.current = true;

    // A quick, flat drag is a flick: it steps to the next or previous place.
    // Anything slower was the visitor looking along the photo, which has already
    // happened, and the place they were looking at stays put.
    const flicked = flickStep({
      dx: press_.to.x - press_.x,
      dy: press_.to.y - press_.y,
      ms: Date.now() - press_.at,
    });
    if (flicked !== 0) {
      hintTaught.current = true;
      setHint(false);
      step(flicked);
    }
  };

  const onPointerCancel = () => {
    press.current = null;
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
    return {
      x: Number((ux * offset).toFixed(2)),
      y: Number((uy * offset).toFixed(2)),
    };
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
    // under it: the hero starts at the top of the page and fills the current
    // viewport. Its dynamic height keeps the open photo and its bottom sheet
    // aligned with the fixed phone tab bar when browser chrome changes size.
    //
    // No `overscroll-contain` on it: the hero is the whole first screen, so
    // containing the wheel there left the page unscrollable from the top. The
    // place panel keeps its own, which is where it is needed.
    <section
      ref={sectionRef}
      aria-labelledby="home-title"
      data-fan-ready={heroMeasured ? "true" : "false"}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      // A finger on the open photo pans it sideways. Down and up belongs to the
      // page, or the visitor is stuck on a full screen of photo: no scroll, no
      // pull to refresh, and no way out but a tap they have to guess at.
      style={
        {
          // Use the measured bar height everywhere inside the hero, rather than
          // an assumed 3.5rem: both the detail sheet and open-photo clip stop at
          // the actual top edge of this device's fixed navigation.
          "--tab-bar-h": `${insets.bottom}px`,
          touchAction: sheet && isOpen ? "pan-y" : undefined,
        } as React.CSSProperties
      }
      // The hero is the page's own ground in both themes (owner's note on
      // image-59: one background, not a lighter band above a darker page), and
      // its words are the theme's ink, so they match the headings below it.
      className="relative -mt-[var(--header-h)] hero-viewport max-h-[1080px] min-h-[520px] w-full overflow-hidden bg-canvas"
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
              onClick={() => {
                if (swallowClick.current) {
                  swallowClick.current = false;
                  return;
                }
                if (openIndex !== index) {
                  // A tap that lands the instant the fan closed is the tail of a
                  // double-click, not a wish to open the place straight back up.
                  if (Date.now() - closedAt.current < 400) return;
                  open(index);
                  return;
                }
                // A phone has no double-click: there the photo itself is the way
                // back. A desktop asks for a double-click (below), so one click on
                // the open photo does nothing at all.
                if (sheet) close();
              }}
              onDoubleClick={() => {
                if (openIndex === index) close();
              }}
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
              className={`group absolute inset-0 m-0 block border-0 bg-canvas p-0 text-left ${
                openIndex >= 0 ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              }`}
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
                    // A finger on the photo pans it; the browser's own image drag
                    // would take the gesture instead.
                    draggable={false}
                    style={openIndex === index ? { objectPosition: panStyle(pan) } : undefined}
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
        style={
          onPhone && bandCentre !== null
            ? // Centred in the band the two fans leave, so the space above the
              // text matches the space below it.
              { top: bandCentre, transform: "translateY(-50%)" }
            : { bottom: "7%" }
        }
      >
        <h1
          id="home-title"
          // A tenth smaller than the display size it is set in (owner's note on
          // image-57); the utility multiplies its own clamp by this.
          style={{ "--display-scale": 0.9 } as React.CSSProperties}
          className={
            onPhone || tight ? "display-2 text-daet-ink" : "display-1 text-daet-ink"
          }
        >
          {/* The lead-in runs a step smaller than the statement under it, as in
              the mock (owner's note on image-2: "make this smaller"). */}
          <span className="block text-[0.85em]">Start in Daet.</span>
          <span className="block">Go anywhere in Camarines Norte.</span>
        </h1>

        {onPhone ? (
          // The band between the two fans is only about 150px tall: the
          // headline, one line of hint and one action fit; the long subline and
          // the second button do not. The action stands beside the hint rather
          // than under it, which is the difference between the band holding it
          // and the button pushing down into the bottom fan's photos.
          //
          // One button, not two: the audit found no call to action at all on a
          // phone's first screen, and browsing the tours is the one thing a
          // first-time visitor most needs. Behind an open place the row is
          // faded out, so it leaves the tab order as the desktop row does.
          <div
            className="pointer-events-auto mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
            inert={isOpen}
          >
            <p className="text-sm text-daet-ink/80 dark:text-white/80">Tap a place to see it</p>
            <ButtonLink
              href="/tours/browse"
              size="md"
              className="wayra [--wayra-fill:var(--color-blue-700)] [--wayra-ink:#fff]"
            >
              {canBook ? "Book Now" : "Explore tours"}
            </ButtonLink>
          </div>
        ) : (
          <>
            {!tight && (
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-daet-ink/80 sm:text-base">
                Beaches, islands and old-town walks, with operators and guides verified by the Daet Tourism Office.
              </p>
            )}
            {/* Behind an open place this row is invisible, so it must not be
                tabbable either — the heading above it stays readable. */}
            <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-3" inert={isOpen}>
              {/* Both carry the Wayra sweep (see globals.css): the solid one
                  fills a step deeper, the outlined one fills with ink and flips
                  its label to the page's own ground. */}
              <ButtonLink
                href="/tours/browse"
                size="xl"
                className="wayra [--wayra-fill:var(--color-blue-700)] [--wayra-ink:#fff]"
              >
                {canBook ? "Book Now" : "Explore tours"}
              </ButtonLink>
              {/* Both buttons sit on the hero's pale ground in light mode, so
                  both carry the theme-aware outline: `onBlue` is white on
                  white here (the label vanished). `onHeader` is ink in light
                  and white in dark, which is exactly this ground. */}
              {signedIn ? (
                <ButtonLink
                  href="/dashboard"
                  size="xl"
                  variant="onHeader"
                  className="wayra [--wayra-fill:var(--color-daet-ink)] [--wayra-ink:var(--color-canvas)]"
                >
                  My dashboard
                </ButtonLink>
              ) : (
                <Button
                  type="button"
                  size="xl"
                  variant="onHeader"
                  className="wayra [--wayra-fill:var(--color-daet-ink)] [--wayra-ink:var(--color-canvas)]"
                  onClick={() => openAssistant()}
                >
                  Ask the travel guide
                </Button>
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

      {isOpen && hint && <GestureHints phone={sheet} onDone={() => setHint(false)} />}

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

      {/* The way out, where a desktop's eye looks for it: the photo's top right.
          A round ✕, the size of a thumb, with the words kept for a screen reader.
          A phone keeps its folded bar and its tap, so nothing new crowds it there. */}
      {isOpen && !sheet && (
        <button
          type="button"
          onClick={close}
          aria-label="Back to the fan"
          className="group absolute right-3 top-[calc(var(--header-h)+0.5rem)] z-40 grid h-11 w-11 place-items-center rounded-full bg-surface/92 text-daet-ink ring-1 ring-daet-ink/10 backdrop-blur-md transition hover:bg-surface focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:right-4 sm:top-[calc(var(--header-h)+1rem)] dark:bg-slate-950/85 dark:text-white dark:ring-white/15 dark:hover:bg-slate-900"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}

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
