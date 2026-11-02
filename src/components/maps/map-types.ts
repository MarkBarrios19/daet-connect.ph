import type { LatLng } from "@/lib/maps/geo";

/**
 * stop: numbered stop on a route · place: a pin · guide: the live guide ·
 * guest: a guest sharing live · town: a guest sharing the nearest town only ·
 * paused: a guest whose sharing paused (last known spot) · flare: "I'm separated".
 */
export type MapMarkerKind = "stop" | "place" | "guide" | "guest" | "town" | "paused" | "flare";

export type FreeMapMarker = LatLng & {
  id: string;
  kind: MapMarkerKind;
  /** Short text drawn in the marker: a number, initials, "You". */
  label: string;
  /** Read by screen readers and shown on hover. */
  title: string;
  href?: string;
  /** A second line under the name on a labelled map, e.g. "Heritage site". */
  subtitle?: string;
  /**
   * The place's own photo, drawn inside the pin.
   *
   * Only the place the map is showing carries one (place-map-panel), so the pin
   * the open place's card points at is the photo pin and the other places stay
   * plain dots.
   */
  photo?: { src: string; alt?: string };
};

export type FreeMapLine = { id: string; path: LatLng[]; dashed?: boolean };

/** The marker look on the tile map (HTML markers). The sketch draws the same shapes in SVG. */
export const MARKER_CLASSES: Record<MapMarkerKind | "stopActive", string> = {
  stop: "grid h-8 w-8 place-items-center rounded-full border-[3px] border-white bg-blue-600 text-sm font-extrabold text-white",
  place: "grid h-7 w-7 place-items-center rounded-full border-[3px] border-white bg-blue-600 text-xs font-extrabold text-white",
  guide: "grid h-10 w-10 place-items-center rounded-full border-[3px] border-white bg-blue-600 text-sm font-extrabold text-white ring-8 ring-blue-600/25",
  guest: "grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-slate-900 text-[11px] font-extrabold text-white dark:border-slate-900 dark:bg-slate-100 dark:text-slate-900",
  town: "grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-amber-500 bg-amber-400/30 text-[11px] font-extrabold text-slate-950 dark:text-amber-100",
  paused: "grid h-8 w-8 place-items-center rounded-full border-2 border-dashed border-slate-500 bg-surface text-[11px] font-extrabold text-daet-ink opacity-80",
  /** A stop the viewer has picked (FreeMap focusId): bigger, with an amber ring. */
  stopActive:
    "grid h-10 w-10 place-items-center rounded-full border-[3px] border-white bg-blue-700 text-base font-extrabold text-white ring-[6px] ring-amber-400/80",
  flare: "grid h-9 w-9 place-items-center rounded-full border-[3px] border-white bg-red-600 text-sm font-extrabold text-white ring-8 ring-red-600/30 motion-safe:animate-pulse",
};
