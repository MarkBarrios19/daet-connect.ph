"use client";

import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import {
  fanWidths,
  fanWedgePoints,
  lerpPoints,
  midVector,
  restWidths,
  toClipPath,
  widthsWithFocus,
  type FanGeometry,
  type Point,
} from "./fan-geometry";

/** Timings from the mock-up's Motion spec board. */
const HOVER = 0.35;
const CHIP = 0.2;
const OPEN = 0.45;
const SWAP = 0.3;
const PARALLAX = 0.6;
const REDUCED_FADE = 0.15;

/** How far the other wedges slide outward as one opens, in px. */
const SLIDE = 60;

type Timeline = ReturnType<typeof gsap.timeline>;

/** The numbers the fan's motion moves. Shapes are computed from them. */
type Live = {
  /** One angular width per wedge, in degrees. */
  widths: number[];
  /** How far each wedge has grown towards the whole hero, 0 to 1. */
  open: number[];
};

/**
 * All of the fan's motion, in one place.
 *
 * GSAP only ever tweens numbers here: the widths above, and how far each wedge
 * has opened. `render()` turns those numbers into nine-point polygons and
 * writes the `clip-path` itself. That is deliberate — GSAP's CSS plugin reads
 * the numbers inside a `clip-path` string as CSS lengths and blends anything
 * past ±100% into the wrong place, which tears the fan apart mid-hover.
 *
 * Only `clip-path`, transforms, opacity and `filter: brightness()` are
 * animated, never layout, so every frame stays on the compositor. The
 * reduced-motion branch drops the shape morphs entirely and cross-fades
 * instead, and nothing here explains a change by motion alone: the counter,
 * the focus move and the live region carry the meaning.
 */
export function useFanAnimation({
  root,
  geometry,
  onOpened,
  onClosed,
}: {
  root: RefObject<HTMLElement | null>;
  geometry: FanGeometry;
  onOpened?: () => void;
  onClosed?: () => void;
}) {
  const timeline = useRef<Timeline | null>(null);
  /**
   * The wedge that is showing, when one is.
   *
   * A step kills the open timeline and leaves nothing to reverse, so the close
   * needs to know on its own which photo it is folding away (see `foldBack`).
   */
  const opened = useRef<number | null>(null);
  /** Which swap is the latest one, so a finished fade cannot tidy up a newer one. */
  const swapToken = useRef(0);
  const reduced = useRef(false);
  const parallaxTweens = useRef(new Map<number, (value: number) => void>());

  // The callbacks below outlive a resize: GSAP keeps the `onUpdate` it was
  // handed, so they read the geometry through a ref rather than closing over it.
  const current = useRef(geometry);
  current.current = geometry;

  const live = useRef<Live>({
    widths: restWidths(geometry),
    open: geometry.wedges.map(() => 0),
  });

  const parts = useCallback(() => {
    const element = root.current;
    if (!element) {
      return {
        wedges: [] as HTMLElement[],
        photos: [] as HTMLElement[],
        nudges: [] as HTMLElement[],
        chips: [] as HTMLElement[],
      };
    }

    return {
      wedges: gsap.utils.toArray<HTMLElement>("[data-wedge]", element),
      photos: gsap.utils.toArray<HTMLElement>("[data-photo]", element),
      nudges: gsap.utils.toArray<HTMLElement>("[data-nudge]", element),
      chips: gsap.utils.toArray<HTMLElement>("[data-chip]", element),
    };
  }, [root]);

  /**
   * The offset a wedge's photo rests at, out along its own angle, kept on the
   * element as `data-nudge-x`/`-y` by the fan. The fan does not translate the
   * photo itself: this layer is the only owner, so the closed fan and the open
   * place can't end up disagreeing about where the photo is.
   */
  const restNudge = (element: HTMLElement) => ({
    x: Number(element.dataset.nudgeX ?? 0),
    y: Number(element.dataset.nudgeY ?? 0),
  });

  /**
   * Take the offset over from the server's inline transform, once per element.
   * It is only there for the first paint (and for a visitor without scripts).
   * The clear goes through GSAP so its cached idea of this element's transform
   * goes with it: otherwise a later write could be skipped as "unchanged" while
   * the element had no transform on it at all.
   */
  const takeOver = (element: HTMLElement) => {
    if (element.dataset.owned) return;
    element.dataset.owned = "1";
    gsap.set(element, { clearProps: "all" });
  };

  /**
   * Put a photo's offset on the element, and on the element's own style.
   *
   * `translate3d`, not `translate`, because that is the form GSAP reads back
   * when it starts a tween from here.
   */
  const setNudge = (element: HTMLElement, x: number, y: number) => {
    gsap.set(element, { x, y });
    element.style.transform = `translate3d(${x}px, ${y}px, 0px)`;
  };

  /**
   * Write every wedge's `clip-path` from the current numbers. The only place a
   * shape string is made, and the only thing an in-flight tween calls.
   */
  const render = useCallback(() => {
    const element = root.current;
    const geo = current.current;
    if (!element || !geo.width || !geo.height) return;

    const wedges = gsap.utils.toArray<HTMLElement>("[data-wedge]", element);
    if (wedges.length === 0) return;

    const state = live.current;
    // On phones, the fixed tab bar owns the bottom inset. Opening a wedge fills
    // only the photo area above it instead of drawing an image beneath the bar.
    const whole = geo.openPoints;

    geo.fans.forEach((fan, fanIndex) => {
      const widths = state.widths.slice(fan.from, fan.from + fan.count);
      const shapes = fanWedgePoints(
        geo,
        fanIndex,
        widths.length === fan.count ? widths : fanWidths(fan.count, fan.a1 - fan.a0, null),
      );

      shapes.forEach((shape, offset) => {
        const index = fan.from + offset;
        const wedge = wedges[index];
        if (!wedge) return;

        const opened = state.open[index] ?? 0;
        const points: Point[] = opened > 0 ? lerpPoints(shape, whole, opened) : shape;
        wedge.style.clipPath = toClipPath(points, geo.width, geo.height);
      });
    });
  }, [root]);

  /** Put everything back the way the server rendered it. */
  const reset = useCallback(() => {
    const { wedges, photos, nudges, chips } = parts();
    const geo = current.current;
    const state = live.current;

    // A swap may still be fading when the visitor closes: retire it first, so it
    // cannot put a photo back on screen after the fan has been put away.
    swapToken.current += 1;
    gsap.killTweensOf(parts().wedges);

    gsap.killTweensOf(state.widths);
    gsap.killTweensOf(state.open);

    state.widths = restWidths(geo);
    state.open = geo.wedges.map(() => 0);
    render();

    if (wedges.length === 0) return;

    wedges.forEach((element) => {
      gsap.set(element, { autoAlpha: 1, x: 0, y: 0, zIndex: 0, filter: "brightness(1)" });
    });
    photos.forEach((element) => gsap.set(element, { x: 0, y: 0, xPercent: 0, scale: 1.15 }));
    nudges.forEach((element) => {
      takeOver(element);
      const rest = restNudge(element);
      setNudge(element, rest.x, rest.y);
    });

    // One owner for the name tags (GSAP, not CSS): a phone shows all of them,
    // a desktop shows none until a pointer or focus arrives.
    chips.forEach((element) => {
      gsap.set(element, { y: 0, autoAlpha: geo.layout === "phone" ? 1 : 0 });
    });

    // Opacity, not autoAlpha: the headline must stay in the accessibility tree
    // even while it is faded out behind an open place. Its buttons are taken out
    // of the tab order by the component instead.
    const headline = root.current?.querySelector("[data-headline]");
    if (headline) gsap.set(headline, { opacity: 1 });
  }, [parts, render, root]);

  // The geometry changes when the hero is re-measured: rebuild the shapes from
  // whatever the motion was in the middle of, rather than snapping it back.
  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { desktop: "(min-width: 768px)", phone: "(max-width: 767px)", reduce: "(prefers-reduced-motion: reduce)" },
        (context) => {
          reduced.current = Boolean(context.conditions?.reduce);
          reset();
        },
      );
    },
    { scope: root, dependencies: [geometry] },
  );

  /**
   * Hovering one wedge widens it and dims the others; null restores the fan.
   *
   * Only ever while the fan is closed: `openAt` owns the open photo's scale, and
   * a hover that lands afterwards zoomed the full-screen photo up to 1.15 while
   * the visitor was looking at it.
   */
  const hover = contextSafe((index: number | null) => {
    const { wedges, photos, chips } = parts();
    if (wedges.length === 0) return;

    const geo = current.current;

    if (reduced.current) {
      // No width, no scale, no drift: the name simply appears, and the dimming
      // is instant rather than eased.
      gsap.to(wedges, {
        filter: index === null ? "brightness(1)" : (i: number) => (i === index ? "brightness(1)" : "brightness(0.78)"),
        duration: REDUCED_FADE,
        ease: "none",
        overwrite: "auto",
      });
      chips.forEach((element, i) => gsap.set(element, { autoAlpha: i === index ? 1 : 0 }));
      return;
    }

    gsap.to(live.current.widths, {
      endArray: widthsWithFocus(geo, index),
      duration: HOVER,
      ease: "power3.out",
      overwrite: true,
      onUpdate: render,
    });

    gsap.to(wedges, {
      filter: index === null ? "brightness(1)" : (i: number) => (i === index ? "brightness(1)" : "brightness(0.78)"),
      duration: HOVER,
      ease: "power3.out",
      overwrite: "auto",
    });

    photos.forEach((element, i) => {
      gsap.to(element, { scale: index === i ? 1.2 : 1.15, duration: HOVER, ease: "power3.out", overwrite: "auto" });
    });

    chips.forEach((element, i) => {
      gsap.to(element, {
        autoAlpha: index === i ? 1 : 0,
        y: index === i ? 0 : 6,
        duration: CHIP,
        ease: "power3.out",
        overwrite: "auto",
      });
    });
  });

  /** Growing one wedge to fill the hero. `instant` is for a URL that names a place. */
  const openAt = contextSafe((index: number, { instant = false }: { instant?: boolean } = {}) => {
    const { wedges, photos, nudges, chips } = parts();
    if (wedges.length === 0) {
      onOpened?.();
      return;
    }

    timeline.current?.kill();
    timeline.current = null;
    opened.current = index;

    const state = live.current;
    const headline = root.current?.querySelector("[data-headline]");

    /** Stop the shapes where they are and put the requested wedge on top. */
    const settle = () => {
      gsap.killTweensOf(state.open);
      state.open = state.open.map((_, i) => (i === index ? 1 : 0));
      render();
      gsap.set(wedges, {
        autoAlpha: (i: number) => (i === index ? 1 : 0),
        x: 0,
        y: 0,
        zIndex: (i: number) => (i === index ? 5 : 0),
      });
      gsap.set(wedges[index], { filter: "brightness(1)" });
      gsap.set(photos[index], { x: 0, y: 0, xPercent: 0, scale: 1 });
      // Dead centre and covering: the photo fills the hero, with no empty
      // corner where it was still pushed out along its wedge.
      nudges.forEach((element, i) => {
        takeOver(element);
        const rest = restNudge(element);
        setNudge(element, i === index ? 0 : rest.x, i === index ? 0 : rest.y);
      });
      // The open place fills the hero, so no name tag belongs on top of it.
      chips.forEach((element) => gsap.set(element, { autoAlpha: 0, y: 6 }));
      if (headline) gsap.set(headline, { opacity: 0 });
    };

    if (instant || reduced.current) {
      settle();
      if (!instant) gsap.to(wedges, { autoAlpha: (i: number) => (i === index ? 1 : 0), duration: REDUCED_FADE });
      onOpened?.();
      return;
    }

    const slides = wedges.map((_, i) => {
      const [ux, uy] = midVector(current.current.wedges[i]?.mid ?? 270);
      return { x: ux * SLIDE, y: uy * SLIDE };
    });

    const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
    timeline.current = tl;

    // Visible, and square on the hero, before anything else. Opening a place
    // while another is already open — which is what a map pin does, and the only
    // way in that skips the panel's cross-fade — finds this wedge still hidden
    // (the previous place hid it) and still slid out along its angle. Left
    // alone it grew to full size while invisible: the card over an empty hero.
    tl.set(wedges[index], { zIndex: 5, autoAlpha: 1, x: 0, y: 0 });

    // Numbers, not shapes: the wedge grows out of its slice towards the box.
    const opening = { t: state.open[index] ?? 0 };
    tl.to(
      opening,
      {
        t: 1,
        duration: OPEN,
        onUpdate: () => {
          state.open[index] = opening.t;
          render();
        },
      },
      0,
    );

    tl.to(wedges[index], { filter: "brightness(1)", duration: OPEN }, 0);
    tl.to(photos[index], { x: 0, y: 0, scale: 1, duration: OPEN }, 0);
    if (nudges[index]) {
      takeOver(nudges[index]);
      tl.to(nudges[index], { x: 0, y: 0, duration: OPEN }, 0);
    }

    wedges.forEach((element, i) => {
      if (i === index) return;
      tl.to(element, { autoAlpha: 0, x: slides[i].x, y: slides[i].y, duration: OPEN }, 0);
    });

    if (headline) tl.to(headline, { opacity: 0, duration: 0.25, ease: "power2.out" }, 0);
    tl.eventCallback("onComplete", () => {
      // Settle it exactly, whatever touched these while the fold-in ran: the
      // open view is the hero filled edge to edge by this one photo.
      gsap.set(photos[index], { x: 0, y: 0, scale: 1 });
      if (nudges[index]) setNudge(nudges[index], 0, 0);
      onOpened?.();
    });
  });

  /**
   * Folding back after a step, where there is no open timeline left to reverse.
   *
   * A step (`swapTo`) kills the timeline that opened the place: the strip of two
   * photos is a different motion, and the open one has already played out. That
   * left the ✕ with nothing to reverse, so `close` fell straight through to
   * `reset` — the fan snapped back with no animation at all, every time a
   * visitor had stepped once. This builds the fold-back the open timeline would
   * have given, starting from the state the step settled on.
   */
  const foldBack = contextSafe((index: number) => {
    const { wedges, photos, nudges, chips } = parts();
    const geo = current.current;
    const state = live.current;
    const headline = root.current?.querySelector("[data-headline]");

    // The others were slid out along their own angle (openAt); coming back is
    // the same trip the other way.
    const slides = wedges.map((_, i) => {
      const [ux, uy] = midVector(geo.wedges[i]?.mid ?? 270);
      return { x: ux * SLIDE, y: uy * SLIDE };
    });

    const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
    timeline.current = tl;

    // Numbers, not shapes, exactly as it opened: the wedge shrinks back to its
    // own slice frame by frame.
    const closing = { t: state.open[index] ?? 1 };
    tl.to(
      closing,
      {
        t: 0,
        duration: OPEN,
        onUpdate: () => {
          state.open[index] = closing.t;
          render();
        },
      },
      0,
    );

    tl.to(wedges[index], { filter: "brightness(1)", duration: OPEN }, 0);
    // Back to the resting zoom the fan's own photos carry.
    tl.to(photos[index], { x: 0, y: 0, xPercent: 0, scale: 1.15, duration: OPEN }, 0);

    if (nudges[index]) {
      takeOver(nudges[index]);
      const rest = restNudge(nudges[index]);
      tl.to(nudges[index], { x: rest.x, y: rest.y, duration: OPEN }, 0);
    }

    wedges.forEach((element, i) => {
      if (i === index) return;
      tl.to(element, { autoAlpha: 1, x: 0, y: 0, duration: OPEN }, 0);
    });

    chips.forEach((element) => {
      tl.to(element, { y: 0, autoAlpha: geo.layout === "phone" ? 1 : 0, duration: 0.2 }, 0);
    });

    if (headline) tl.to(headline, { opacity: 1, duration: 0.25, ease: "power2.out" }, 0);

    tl.eventCallback("onComplete", () => {
      timeline.current = null;
      opened.current = null;
      reset();
      onClosed?.();
    });
  });

  /** Folding back. Reversing the open timeline gives the mock-up's close. */
  const close = contextSafe(() => {
    const tl = timeline.current;
    if (tl) {
      tl.eventCallback("onReverseComplete", () => {
        timeline.current = null;
        opened.current = null;
        reset();
        onClosed?.();
      });
      tl.reverse();
      return;
    }

    // No timeline: either nothing is open, or a step took it. A step's close is
    // a fold-back of its own — a visitor who stepped and then pressed ✕ asked
    // for the same animation as everyone else.
    const index = opened.current;
    if (index === null || reduced.current) {
      reset();
      onClosed?.();
      return;
    }

    foldBack(index);
  });

  /**
   * Next or previous while open: the two photos travel as one strip, no folding
   * back first.
   *
   * The incoming photo swipes in from the right for the next place and from the
   * right for the previous one, and the photo it replaces leaves the other way.
   * Both are a hero wide and their edges meet exactly at every frame, so the hero
   * is covered end to end the whole way — no fade, no flash, nothing of the page's
   * own ground between them. Timing and easing are the same as the cross-fade they
   * replace, so the card's swap still feels like one move.
   */
  const swapTo = contextSafe((index: number, { from, direction = 1 }: { from?: number; direction?: number } = {}) => {
    const { wedges, photos, nudges } = parts();
    if (wedges.length === 0) return;

    timeline.current?.kill();
    timeline.current = null;
    opened.current = index;

    const leaving = from !== undefined && from !== index ? from : null;

    const state = live.current;
    gsap.killTweensOf(state.open);
    // Both photos keep the hero's own shape while they travel. Left to the fan's
    // shapes, the wedge that is leaving falls back to its sliver the moment the
    // new one goes on top, and the fan shows through where its photo was.
    state.open = state.open.map((_, i) => (i === index || i === leaving ? 1 : 0));
    render();

    // Every other photo goes now: an older one left mid-slide would otherwise
    // show the wedge's own ground through the part of its clip its photo has
    // already left.
    wedges.forEach((element, i) => {
      if (i === index || i === leaving) return;
      gsap.set(element, { autoAlpha: 0 });
      gsap.set(element, { clearProps: "backgroundColor" });
    });

    // Square on the hero first. While this place was one of the others it was
    // slid out along its own angle, and opening it where it stood left the photo
    // up to 60px off the hero — a strip of the page down one side (and one behind
    // the header), which is exactly the gap the owner photographed.
    gsap.set(wedges[index], { zIndex: 6, filter: "brightness(1)", x: 0, y: 0, autoAlpha: 1 });
    nudges.forEach((element, i) => {
      takeOver(element);
      const rest = restNudge(element);
      setNudge(element, i === index ? 0 : rest.x, i === index ? 0 : rest.y);
    });

    /** Next slides in from the right (the way a finger swiping left pulls it); previous from the left. */
    const enter = direction >= 0 ? 100 : -100;
    const leave = -enter;

    const settle = () => {
      wedges.forEach((element, i) => {
        if (i === index) return;
        gsap.set(element, { autoAlpha: 0 });
        gsap.set(element, { clearProps: "backgroundColor" });
      });
      // Every photo back in its own frame, ready to be slid again.
      photos.forEach((element) => gsap.set(element, { xPercent: 0 }));
      gsap.set(wedges[index], { zIndex: 5 });
      gsap.set(wedges[index], { clearProps: "backgroundColor" });
    };

    // The server renders each photo with `transform: scale(1.15)` on it. GSAP
    // cannot read a one-argument `scale()` back, and a percentage translate mixed
    // into that cache comes out as NaN, so the inline transform goes first and the
    // photo is placed from scratch.
    gsap.set(photos[index], { clearProps: "transform" });
    if (leaving !== null) gsap.set(photos[leaving], { clearProps: "transform" });
    gsap.set(photos[index], { x: 0, y: 0, scale: 1, xPercent: enter });

    // Nothing to slide against, or a visitor who asked for less motion: the new
    // photo is simply there, whole, and the old one is gone.
    if (leaving === null || reduced.current) {
      gsap.set(photos[index], { xPercent: 0 });
      settle();
      return;
    }

    // The incoming wedge is the top layer, so its own ground has to get out of the
    // way: it would paint over the photo underneath while its photo is still off
    // to the side. The photo beneath keeps its ground, and covers the gap.
    gsap.set(wedges[index], { backgroundColor: "transparent" });

    const token = (swapToken.current += 1);
    gsap.to(photos[index], {
      xPercent: 0,
      duration: SWAP,
      ease: "power2.inOut",
      overwrite: "auto",
      onComplete: () => {
        if (swapToken.current !== token) return;
        settle();
      },
    });
    gsap.to(photos[leaving], {
      xPercent: leave,
      duration: SWAP,
      ease: "power2.inOut",
      overwrite: "auto",
    });
  });

  /** A small nudge of the photo toward the pointer, ±1% of the hero width. */
  const parallax = contextSafe((index: number, offsetX: number) => {
    if (reduced.current) return;
    const { photos } = parts();
    if (!photos[index]) return;

    let tween = parallaxTweens.current.get(index);
    if (!tween) {
      tween = gsap.quickTo(photos[index], "x", { duration: PARALLAX, ease: "power2.out" });
      parallaxTweens.current.set(index, tween);
    }
    tween(offsetX);
  });

  return { hover, openAt, close, swapTo, parallax, reset };
}
