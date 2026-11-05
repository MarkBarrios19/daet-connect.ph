"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HeroPhoto } from "@/lib/tours/hero-photos";

const STEPS = [1, 2, 3, 4];
const MAX_ZOOM = 4;

const next = (scale: number) => STEPS.find((v) => v > scale) ?? MAX_ZOOM;
const prev = (scale: number) => [...STEPS].reverse().find((v) => v < scale) ?? 1;
const clampPan = (v: number, scale: number, size: number) => {
  const max = ((scale - 1) * size) / 2;
  return Math.max(-max, Math.min(max, v));
};

const roundBtn =
  "inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-400 bg-surface text-daet-ink transition hover:bg-muted disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400";

function Glyph({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * The full-size photo in a modal. Click or tap zooms in at that point; the
 * buttons and + / - keys zoom in steps up to 4x; drag (mouse or finger) pans
 * while zoomed. Left and right arrows change photo when not zoomed. Built on
 * the native dialog, so it traps focus and closes on Escape.
 */
export function PhotoViewer({ photos, index, title, onChange, onClose }: { photos: HeroPhoto[]; index: number; title: string; onChange: (index: number) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0, dragging: false });
  const photo = photos[index];

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    }
    // No cleanup that closes it: the dialog leaves the page when this unmounts, and a close here would
    // fire onClose again (and, under Strict Mode's second run, shut a dialog that was just opened).
  }, []);

  const size = () => {
    const r = stage.current?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1 };
  };
  const change = useCallback(
    (to: number) => {
      setView({ scale: 1, tx: 0, ty: 0, dragging: false });
      onChange((to + photos.length) % photos.length);
    },
    [onChange, photos.length],
  );
  // Zoom about a point (an offset from the picture's centre), keeping that point still.
  const zoomTo = (target: number, cx = 0, cy = 0) =>
    setView((v) => {
      const z = Math.max(1, Math.min(MAX_ZOOM, target));
      if (z === 1) return { scale: 1, tx: 0, ty: 0, dragging: false };
      const { w, h } = size();
      const r = z / v.scale;
      return { ...v, scale: z, tx: clampPan(cx - r * (cx - v.tx), z, w), ty: clampPan(cy - r * (cy - v.ty), z, h) };
    });
  const panBy = (dx: number, dy: number) =>
    setView((v) => {
      const { w, h } = size();
      return { ...v, tx: clampPan(v.tx + dx, v.scale, w), ty: clampPan(v.ty + dy, v.scale, h) };
    });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") zoomTo(next(view.scale));
    else if (e.key === "-") zoomTo(prev(view.scale));
    else if (view.scale > 1 && e.key === "ArrowLeft") panBy(80, 0);
    else if (view.scale > 1 && e.key === "ArrowRight") panBy(-80, 0);
    else if (view.scale > 1 && e.key === "ArrowUp") panBy(0, 80);
    else if (view.scale > 1 && e.key === "ArrowDown") panBy(0, -80);
    else if (e.key === "ArrowLeft") change(index - 1);
    else if (e.key === "ArrowRight") change(index + 1);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    g.moved = true;
    if (view.scale > 1) {
      const { w, h } = size();
      setView({ ...view, tx: clampPan(g.tx + dx, view.scale, w), ty: clampPan(g.ty + dy, view.scale, h), dragging: true });
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    drag.current = null;
    if (!g) return;
    if (g.moved) {
      setView((v) => ({ ...v, dragging: false }));
      return;
    }
    // A tap or click without a drag: zoom in at that point, or back out.
    if (view.scale > 1) zoomTo(1);
    else {
      const r = e.currentTarget.getBoundingClientRect();
      zoomTo(2, e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    }
  };

  const closeViewer = () => {
    const el = dialog.current;
    if (el && typeof el.close === "function") el.close();
    else onClose();
  };

  const cursor = view.scale > 1 ? (view.dragging ? "grabbing" : "grab") : "zoom-in";

  return (
    <dialog
      ref={dialog}
      aria-label={`Photo viewer: ${title}`}
      onClose={onClose}
      onKeyDown={onKeyDown}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-slate-950 p-0 text-white backdrop:bg-slate-950"
    >
      <div className="relative flex h-full flex-col">
        <div
          ref={stage}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setView((v) => ({ ...v, dragging: false }));
          }}
          style={{ cursor, touchAction: "none" }}
          className="relative min-h-0 flex-1 select-none overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.src}
            alt={photo.alt}
            draggable={false}
            className="pointer-events-none h-full w-full object-contain"
            style={{
              transformOrigin: "50% 50%",
              transform: `translate(${Math.round(view.tx)}px, ${Math.round(view.ty)}px) scale(${view.scale})`,
              transition: view.dragging ? "none" : "transform 260ms cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          />
        </div>
        <p className="flex items-center justify-between gap-4 bg-slate-900/90 px-5 py-3 text-base">
          <span className="min-w-0 truncate">{photo.alt}</span>
          <span className="shrink-0 font-bold">
            {index + 1} / {photos.length} · {Math.round(view.scale * 100)}%
          </span>
        </p>

        <div className="absolute right-4 top-4 flex gap-2 sm:right-8 sm:top-8">
          <button type="button" className={roundBtn} aria-label="Zoom out" disabled={view.scale <= 1} onClick={() => zoomTo(prev(view.scale))}>
            <Glyph d="M21 21l-4.3-4.3M8 11h6M11 4a7 7 0 100 14 7 7 0 000-14z" />
          </button>
          <button type="button" className={roundBtn} aria-label="Zoom in" disabled={view.scale >= MAX_ZOOM} onClick={() => zoomTo(next(view.scale))}>
            <Glyph d="M21 21l-4.3-4.3M11 8v6M8 11h6M11 4a7 7 0 100 14 7 7 0 000-14z" />
          </button>
          <button type="button" className={roundBtn} aria-label="Close photo viewer" autoFocus onClick={closeViewer}>
            <Glyph d="M6 6l12 12M18 6L6 18" />
          </button>
        </div>
        {photos.length > 1 ? (
          <>
            <button type="button" className={`${roundBtn} absolute left-3 top-1/2 -translate-y-1/2 sm:left-12`} aria-label="Previous photo" onClick={() => change(index - 1)}>
              <Glyph d="M15 19l-7-7 7-7" />
            </button>
            <button type="button" className={`${roundBtn} absolute right-3 top-1/2 -translate-y-1/2 sm:right-12`} aria-label="Next photo" onClick={() => change(index + 1)}>
              <Glyph d="M9 5l7 7-7 7" />
            </button>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
