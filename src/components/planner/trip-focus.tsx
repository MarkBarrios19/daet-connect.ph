"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RouteMap, type MapPoint } from "@/components/maps/route-map";

type Focus = { focusId: string | null; focus: (id: string) => void };
const FocusContext = createContext<Focus | null>(null);

/** Shares "which stop is picked" between the day's stop cards and the trip map. */
export function TripFocusProvider({ children }: { children: ReactNode }) {
  const [focusId, setFocusId] = useState<string | null>(null);
  return <FocusContext.Provider value={{ focusId, focus: setFocusId }}>{children}</FocusContext.Provider>;
}

/**
 * A stop's card. Tapping it flies the map to the place (the map animates the
 * flight). Links and buttons inside keep doing their own thing.
 */
export function StopFocus({ id, children, className = "" }: { id: string | null; children: ReactNode; className?: string }) {
  const ctx = useContext(FocusContext);
  const active = Boolean(id && ctx?.focusId === id);
  return (
    <div
      data-active={active ? "true" : undefined}
      className={`${className} ${id && ctx ? "cursor-pointer" : ""} ${active ? "outline-2 outline-offset-0 outline-blue-600 outline" : ""}`.trim()}
      onClick={(event) => {
        if (!id || !ctx) return;
        if ((event.target as HTMLElement).closest("a,button")) return;
        ctx.focus(id);
      }}
    >
      {children}
    </div>
  );
}

/** The stop's photo or icon as a real button, so the map can also be reached by keyboard. */
export function ShowOnMap({ id, name, children }: { id: string | null; name: string; children: ReactNode }) {
  const ctx = useContext(FocusContext);
  if (!id || !ctx) return <>{children}</>;
  return (
    <button type="button" onClick={() => ctx.focus(id)} aria-label={`Show ${name} on the map`} className="shrink-0 rounded-xl">
      {children}
    </button>
  );
}

/** The trip map, following the picked stop. On a narrow screen, where the map sits below the days, it scrolls into view. */
export function TripMap({ points }: { points: MapPoint[] }) {
  const ctx = useContext(FocusContext);
  const box = useRef<HTMLDivElement>(null);
  const focusId = ctx?.focusId ?? null;
  useEffect(() => {
    const el = box.current;
    if (!focusId || !el) return;
    const rect = el.getBoundingClientRect();
    const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!visible) el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }, [focusId]);
  return (
    <div ref={box} className="overflow-hidden rounded-2xl">
      <RouteMap points={points} connect title="Map of the whole trip" focusId={focusId} onMarkerClick={ctx?.focus} />
    </div>
  );
}
