"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { PhotoViewer } from "@/components/tours/photo-viewer";
import type { HeroPhoto } from "@/lib/tours/hero-photos";
import { indicatorDots } from "@/lib/tours/photo-indicator";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Card geometry, relative to the card's width (--cw): the centre card is 16:10.3, the side cards a little taller. */
const GAP = 16;
const SWIPE_PX = 40;
// Edge blur steps (outermost narrowest and blurriest) and the red/blue split on the outer edges.
const BLUR = [
  { width: "clamp(44px, 26cqw, 380px)", blur: 1.8 },
  { width: "clamp(32px, 18cqw, 260px)", blur: 4.5 },
  { width: "clamp(20px, 10cqw, 150px)", blur: 9 },
];
const SPLIT_PX = 7;
const EDGE_ZONE = 38;

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

/** Red and blue copies of a card, slipping apart toward its outer edge and fading out across the edge zone. */
function Aberration({ src, side, reduced, wraps }: { src: string; side: "left" | "right"; reduced: boolean; wraps: boolean }) {
  const dir = side === "left" ? -1 : 1;
  const mask = `linear-gradient(to ${side === "left" ? "right" : "left"}, #000 0%, transparent ${EDGE_ZONE}%)`;
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
  const { i, prev } = state;

  const go = (k: number) => setState((s) => ({ prev: s.i, i: (k + n) % n }));
  const dots = indicatorDots(i, n, wide ? 7 : 5);
  const motion = (props: string[]) => (reduced ? "none" : props.map((p) => `${p} 650ms ${EASE}`).join(", "));

  return (
    <div className="flex flex-col items-center gap-3">
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
        className="relative -mx-4 w-[calc(100%+2rem)] overflow-hidden [container-type:inline-size] sm:mx-0 sm:w-full"
        style={{ ["--cw" as string]: "min(560px, 78cqw)", height: "calc(var(--cw) * 0.7 + 40px)" }}
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
                top: here ? 20 : 12,
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

        {/* The photos fade and blur toward both edges. The centre card is untouched. */}
        {(["left", "right"] as const).map((side) =>
          BLUR.map((b) => (
            <div
              key={`${side}-${b.blur}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-[4]"
              style={{
                [side]: 0,
                // Never wider than the space beside the centre card, which stays sharp.
                width: `min(${b.width}, calc((100cqw - var(--cw)) / 2))`,
                backdropFilter: `blur(${b.blur}px)`,
                WebkitBackdropFilter: `blur(${b.blur}px)`,
                maskImage: `linear-gradient(to ${side}, #000, transparent)`,
                WebkitMaskImage: `linear-gradient(to ${side}, #000, transparent)`,
              }}
            />
          )),
        )}

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
          style={{ top: 20, width: "var(--cw)", marginLeft: "calc(var(--cw) / -2)", height: "calc(var(--cw) * 0.643)" }}
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
        className="relative -mt-8 h-[60px] w-[200px] flex-none sm:h-[72px] sm:w-[420px]"
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
