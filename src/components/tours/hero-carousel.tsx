"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { PhotoViewer } from "@/components/tours/photo-viewer";
import type { HeroPhoto } from "@/lib/tours/hero-photos";
import { indicatorDots } from "@/lib/tours/photo-indicator";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Card geometry, relative to the card's width (--cw): the centre card is 16:10.3, the side cards a little taller. */
const GAP = 16;
const SWIPE_PX = 40;
// Progressive blur: the photos get blurrier the closer they are to the edge of the screen. Each layer
// blurs what is under it and fades out toward the middle, over a shorter distance the stronger it is, so
// the steps add up to one smooth ramp with no seam. The centre photo sits in the clear space between the
// two ramps. BLUR is [blur px, how far toward the middle it reaches, as a share of the space beside the photo].
const BLUR: Array<[number, number]> = [
  [1.2, 1],
  [2.5, 0.84],
  [4.5, 0.68],
  [7, 0.52],
  [10, 0.36],
];
// The same space is also faded into the page colour at the very edge, so a photo never ends in a hard cut.
const FADE_SHARE = 0.3;
const SPLIT_PX = 10;

function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const rel = (k: number, c: number, n: number) => {
  let d = (((k - c) % n) + n) % n;
  if (d > Math.floor(n / 2)) d -= n;
  return d;
};

/**
 * Red and blue copies of a side photo, slipping apart toward the edge of the screen and closing up
 * across the photo. The mask starts at the screen edge (--off is how much of the photo hangs past it),
 * so the split shows at the outer edge of the two upcoming photos and never on the centre one.
 */
function Aberration({ src, side, reduced, wraps }: { src: string; side: "left" | "right"; reduced: boolean; wraps: boolean }) {
  const dir = side === "left" ? -1 : 1;
  const start = "max(0px, var(--off))";
  const mask = `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 ${start}, transparent calc(${start} + var(--ca-zone)))`;
  const move = wraps || reduced ? "none" : `transform 650ms ${EASE}`;
  const layer = (color: string, shift: number) => (
    <div className="absolute inset-0 isolate mix-blend-screen" style={{ transform: `translateX(${shift}px)`, transition: move }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="block h-full w-full object-cover" />
      <div className="absolute inset-0 mix-blend-multiply" style={{ background: color }} />
    </div>
  );
  return (
    <div aria-hidden="true" className="absolute inset-0 isolate bg-black" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      {layer("#ff0000", dir * SPLIT_PX)}
      {layer("#00ff00", 0)}
      {layer("#0000ff", -dir * SPLIT_PX)}
    </div>
  );
}

/**
 * The trip's hero: a curved strip of photos with the current one in the
 * middle, its neighbours blurred and split at the outer edges, and a short
 * arc of dots below. Click the middle photo for the full-size viewer.
 */
export function HeroCarousel({ photos, title }: { photos: HeroPhoto[]; title: string }) {
  const n = photos.length;
  const [state, setState] = useState({ i: 0, prev: 0 });
  const [open, setOpen] = useState(false);
  const wide = useMedia("(min-width: 640px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const swipe = useRef<{ x: number; swiped: boolean } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // The strip runs the full width of the screen, past the page's own margins, so the blur and the fade
  // reach the real edge. It is measured, not 100vw, so a scrollbar never adds sideways scroll.
  const [span, setSpan] = useState<{ width: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current;
      if (el) setSpan({ width: document.documentElement.clientWidth, left: -el.getBoundingClientRect().left });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const { i, prev } = state;

  const go = (k: number) => setState((s) => ({ prev: s.i, i: (k + n) % n }));
  const dots = indicatorDots(i, n, wide ? 7 : 5);
  const motion = (props: string[]) => (reduced ? "none" : props.map((p) => `${p} 650ms ${EASE}`).join(", "));

  return (
    <div ref={wrap} className="flex flex-col items-center gap-3">
      <section
        aria-roledescription="carousel"
        aria-label={`Photos of ${title}`}
        onKeyDown={(e) => {
          if (open) return;
          if (e.key === "ArrowLeft") go(i - 1);
          else if (e.key === "ArrowRight") go(i + 1);
        }}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, swiped: false };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          if (s && Math.abs(e.clientX - s.x) > SWIPE_PX) {
            s.swiped = true;
            go(e.clientX < s.x ? i + 1 : i - 1);
          }
        }}
        className="relative flex-none self-start overflow-x-clip [container-type:inline-size]"
        style={{
          ["--cw" as string]: "min(560px, 78cqw)",
          // How much of a side photo hangs past the screen edge, and how far the colour split reaches in.
          ["--off" as string]: `calc((3 * var(--cw) + ${2 * GAP}px - 100cqw) / 2)`,
          ["--ca-zone" as string]: "min(34cqw, 360px)",
          // Room above and below for the tilted photos, whose near edge grows.
          height: "calc(var(--cw) * 0.72 + 48px)",
          width: span ? span.width : "100%",
          marginLeft: span ? span.left : 0,
        }}
      >
        {photos.map((photo, k) => {
          const d = rel(k, i, n);
          const wraps = Math.abs(d - rel(k, prev, n)) > 2;
          const here = d === 0;
          const near = Math.abs(d) <= 1;
          return (
            <figure
              key={k}
              aria-hidden={here ? undefined : true}
              className="absolute left-1/2 m-0 overflow-hidden rounded-2xl bg-black"
              style={{
                zIndex: here ? 2 : 1,
                width: "var(--cw)",
                marginLeft: "calc(var(--cw) / -2)",
                top: here ? 30 : 20,
                height: here ? "calc(var(--cw) * 0.643)" : "calc(var(--cw) * 0.678)",
                opacity: Math.abs(d) > 1 ? 0 : 1,
                transform: `translateX(calc(${d} * (var(--cw) + ${GAP}px))) perspective(1200px) rotateY(${d < 0 ? 18 : d > 0 ? -18 : 0}deg)`,
                transition: wraps ? "none" : motion(["transform", "top", "height", "opacity"]),
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.src} alt={here ? photo.alt : ""} loading={Math.abs(d) <= 2 ? "eager" : "lazy"} className="block h-full w-full object-cover" />
              {near && !here ? <Aberration src={photo.src} side={d < 0 ? "left" : "right"} reduced={reduced} wraps={wraps} /> : null}
            </figure>
          );
        })}

        {/* Progressive blur and a fade into the page colour, across the whole space beside the centre photo. */}
        {(["left", "right"] as const).map((side) => {
          const inward = side === "left" ? "right" : "left";
          return (
            <div key={side} aria-hidden="true">
              {BLUR.map(([blur, reach]) => (
                <div
                  key={blur}
                  className="pointer-events-none absolute inset-y-0 z-[4]"
                  style={{
                    [side]: 0,
                    width: `calc((100cqw - var(--cw)) / 2 * ${reach})`,
                    backdropFilter: `blur(${blur}px)`,
                    WebkitBackdropFilter: `blur(${blur}px)`,
                    maskImage: `linear-gradient(to ${inward}, #000 0%, transparent 100%)`,
                    WebkitMaskImage: `linear-gradient(to ${inward}, #000 0%, transparent 100%)`,
                  }}
                />
              ))}
              <div
                className="pointer-events-none absolute inset-y-0 z-[5]"
                style={{
                  [side]: 0,
                  width: `calc((100cqw - var(--cw)) / 2 * ${FADE_SHARE})`,
                  background: `linear-gradient(to ${inward}, var(--color-canvas) 0%, transparent 100%)`,
                }}
              />
            </div>
          );
        })}

        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => {
            if (!swipe.current?.swiped) go(i - 1);
          }}
          className="absolute inset-y-4 left-0 z-[3] w-[calc((100%-var(--cw))/2)] cursor-pointer"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => {
            if (!swipe.current?.swiped) go(i + 1);
          }}
          className="absolute inset-y-4 right-0 z-[3] w-[calc((100%-var(--cw))/2)] cursor-pointer"
        />
        <button
          ref={opener}
          type="button"
          aria-label={`Expand photo: ${photos[i].alt}`}
          aria-haspopup="dialog"
          onClick={() => {
            if (!swipe.current?.swiped) setOpen(true);
          }}
          className="absolute left-1/2 z-[3] cursor-zoom-in rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          style={{ top: 30, width: "var(--cw)", marginLeft: "calc(var(--cw) / -2)", height: "calc(var(--cw) * 0.643)" }}
        >
          <span aria-hidden="true" className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/80 text-white sm:right-3 sm:top-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </span>
        </button>
      </section>

      <div
        role="group"
        aria-label="Choose a photo"
        className="relative -mt-10 h-[60px] w-[200px] flex-none sm:h-[72px] sm:w-[420px]"
      >
        <svg viewBox="0 0 420 72" preserveAspectRatio="none" fill="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
          <path d="M0 46 Q210 10 420 46" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-slate-200 dark:stroke-slate-700" />
        </svg>
        {dots.map((dot) => (
          <button
            key={dot.k}
            type="button"
            onClick={() => go(dot.k)}
            aria-label={`Show photo ${dot.k + 1} of ${n}: ${photos[dot.k].alt}`}
            aria-current={dot.here ? "true" : undefined}
            aria-hidden={dot.inside ? undefined : true}
            tabIndex={dot.inside ? 0 : -1}
            className="absolute flex h-11 w-11 items-center justify-center p-0"
            style={{
              left: `calc(${dot.x * 100}% - 22px)`,
              top: `calc(${dot.y * 100}% - 22px)`,
              pointerEvents: dot.inside ? "auto" : "none",
              transition: reduced ? "none" : `left 450ms ${EASE}, top 450ms ${EASE}`,
            }}
          >
            <span
              className={`block rounded-full ${dot.here ? "bg-slate-900 dark:bg-slate-200" : "bg-slate-400 dark:bg-slate-600"}`}
              style={{
                width: !dot.inside ? 0 : dot.here ? 14 : dot.edge ? 5 : 8,
                height: !dot.inside ? 0 : dot.here ? 14 : dot.edge ? 5 : 8,
                opacity: dot.inside ? 1 : 0,
                transition: reduced ? "none" : `width 300ms ${EASE}, height 300ms ${EASE}, background-color 300ms ${EASE}, opacity 300ms ${EASE}`,
              }}
            />
          </button>
        ))}
        {/* The ring rides the current dot. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-[2] h-5 w-5 rounded-full border-2 border-blue-600 dark:border-blue-300"
          style={{
            left: `calc(${(dots[i]?.x ?? 0) * 100}% - 10px)`,
            top: `calc(${(dots[i]?.y ?? 0) * 100}% - 10px)`,
            transition: reduced ? "none" : `left 450ms ${EASE}, top 450ms ${EASE}`,
          }}
        />
      </div>

      <div className="flex w-full items-center justify-between px-4 sm:w-auto sm:justify-center sm:gap-4 sm:px-0">
        <button type="button" onClick={() => go(i - 1)} aria-label="Previous photo" className="inline-flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-slate-500 text-daet-ink">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span aria-live="polite" className="min-w-14 text-center text-sm font-bold text-daet-ink">
          {i + 1} / {n}
        </span>
        <button type="button" onClick={() => go(i + 1)} aria-label="Next photo" className="inline-flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-slate-500 text-daet-ink">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {open ? (
        <PhotoViewer
          photos={photos}
          index={i}
          title={title}
          onChange={go}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
