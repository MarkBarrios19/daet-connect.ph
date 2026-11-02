"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapMarker } from "@/components/maps/map-types";

/** A place the hero's map can pin: the coordinates come from the places table. */
export type MapPoint = { slug: string; name: string; lat: number; lng: number };

/** What the card over the map says about the place that is open. */
export type MapCardPlace = {
  slug: string;
  name: string;
  text: string;
  photo: { src: string; alt: string };
};

/**
 * The map card beside the open place's own card, as sketched (image-30).
 *
 * It is the first card in the open view: "Viewing <place>" and "Show all" along
 * the top, the map under them, and a small card floating over the map with the
 * place's photo, its name and the line about it. The ‹ › pair in the card next
 * door steps through the fan and this map follows, flying to whichever place is
 * showing; "Show all" pulls back to every pin, and a pin opens that place.
 *
 * A phone does not get one: the photo is the whole screen there, and the owner
 * asked for the map at its foot to go.
 */
export function PlaceMapPanel({
  place,
  places,
  onPick,
  className = "",
}: {
  place: MapCardPlace;
  places: MapPoint[];
  onPick: (slug: string) => void;
  className?: string;
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
    <div
      data-place-map
      className={`pointer-events-auto overflow-hidden rounded-2xl bg-surface/92 ring-1 ring-daet-ink/10 shadow-[var(--shadow-float)] backdrop-blur-md dark:bg-slate-950/80 dark:ring-white/15 ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
        </svg>
        <p data-viewing className="min-w-0 flex-1 truncate text-sm text-daet-ink/75 dark:text-white/80">
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

      <div className="relative">
        <FreeMap
          markers={markers}
          title={`Map showing ${place.name} and the other places in the fan`}
          // A place with no coordinates yet still gets the map, framing the pins
          // there are rather than flying to nothing.
          focusId={showAll || !pinned ? null : place.slug}
          fitKey={showAll ? "all" : place.slug}
          animateFit
          onMarkerClick={onPick}
          className="h-64"
        />

        {/* The place itself, over the map: its photo, its name, the line about
            it. Nothing in here takes the pointer, so the map still drags.
            The z-index is not decoration: Leaflet paints its own panes at 200 to
            800 inside the map, and a plain absolute sibling sits under every one
            of them — which is how it went missing. */}
        <div
          data-map-place
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3 z-[800] w-40 rounded-xl bg-surface/95 p-2 ring-1 ring-daet-ink/10 backdrop-blur dark:bg-slate-950/92 dark:ring-white/15"
        >
          <Image
            src={place.photo.src}
            alt=""
            width={320}
            height={180}
            sizes="160px"
            className="h-16 w-full rounded-lg object-cover"
          />
          <p className="mt-1.5 text-xs font-extrabold leading-tight text-daet-ink dark:text-white">{place.name}</p>
          <p className="mt-0.5 line-clamp-3 text-[0.7rem] leading-snug text-daet-ink/75 dark:text-white/75">
            {place.text}
          </p>
        </div>
      </div>
    </div>
  );
}
