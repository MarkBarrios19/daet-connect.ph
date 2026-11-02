"use client";

import { useEffect, useState } from "react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapMarker } from "@/components/maps/map-types";

/** A place the hero's map can pin: the coordinates come from the places table. */
export type MapPoint = { slug: string; name: string; lat: number; lng: number };

/**
 * The small map under the card while a place is open.
 *
 * The ‹ › pair in the card steps through the fan, and this map follows: it
 * flies to whichever place is showing, and "Show all" pulls back to all six.
 * Clicking a pin opens that place too.
 *
 * Desktop puts it in the page's column at the bottom left, as in the mock; a
 * phone has no room beside the photo, so it takes the bottom of the screen
 * under the collapsed bar.
 */
export function PlaceMapPanel({
  place,
  places,
  phone,
  onPick,
}: {
  place: { slug: string; name: string };
  places: MapPoint[];
  phone: boolean;
  onPick: (slug: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  // Stepping to another place is a fresh focus, even if the last one was "Show all".
  useEffect(() => setShowAll(false), [place.slug]);

  if (places.length === 0) return null;

  const markers: FreeMapMarker[] = places.map((point) => ({
    id: point.slug,
    lat: point.lat,
    lng: point.lng,
    kind: "place",
    label: "",
    title: point.name,
  }));
  const pinned = places.some((point) => point.slug === place.slug);

  return (
    <div className={phone ? "pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3" : "pointer-events-none absolute inset-x-0 bottom-0 z-20"}>
      <div className={phone ? "" : "mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 sm:pb-12 lg:px-8"}>
        <div
          data-place-map
          className="pointer-events-auto overflow-hidden rounded-2xl bg-surface/92 ring-1 ring-daet-ink/10 shadow-[var(--shadow-float)] backdrop-blur-md dark:bg-slate-950/80 dark:ring-white/15"
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" fill="currentColor" aria-hidden>
              <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
            </svg>
            <p className="min-w-0 flex-1 truncate text-sm text-daet-ink/75 dark:text-white/80">
              Viewing <span className="font-bold text-daet-ink dark:text-white">{place.name}</span>
            </p>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-700/30 transition hover:bg-blue-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-200 dark:ring-blue-300/40 dark:hover:bg-blue-500/15"
            >
              Show all
            </button>
          </div>

          <FreeMap
            markers={markers}
            title={`Map showing ${place.name} and the other places in the fan`}
            // A place with no coordinates yet still gets the map, framing the pins
            // there are rather than flying to nothing.
            focusId={showAll || !pinned ? null : place.slug}
            fitKey={showAll ? "all" : place.slug}
            animateFit
            onMarkerClick={onPick}
            className={phone ? "h-52" : "h-72"}
          />
        </div>
      </div>
    </div>
  );
}
