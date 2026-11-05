"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { FreeMap } from "@/components/maps/free-map";
import { PHOTO_PIN_RISE, type FreeMapMarker } from "@/components/maps/map-types";

/**
 * Room between the card's edge and the pin it points at.
 *
 * The tail hangs half outside the card's edge, so this ends up as a hair of
 * daylight: the tail's point lands on the pin's top (or its tip, when the card
 * has to sit underneath), never floating in between.
 */
const GAP = 6;

/**
 * A place the hero's map can pin: the coordinates come from the places table,
 * with the town it sits in and whether the office has confirmed the pin — the
 * place's own "Open in Google Maps" needs both to land on the right place.
 */
export type MapPoint = {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  /** Daet, Vinzons, Mercedes… The town the place is actually in. */
  municipality?: string | null;
  /** True only for a pin the Tourism Office has confirmed. */
  verified?: boolean;
};

/** What the card over the map says about the place that is open. */
export type MapCardPlace = {
  slug: string;
  name: string;
  text: string;
  photo: { src: string; alt: string };
  /** Only drawn when there is a real one: the card never invents a score. */
  rating?: number;
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
  height,
  className = "",
}: {
  place: MapCardPlace;
  places: MapPoint[];
  onPick: (slug: string) => void;
  /** The card's height while the map is out, as a plain CSS length. */
  height?: string;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  // The card over the map follows the pin: tapping the pin it points at folds the
  // card away, and tapping it again brings it back (owner's note, image-81). The
  // card sits over the map the visitor is working in, so the pin under it has to
  // be able to put it out of the way.
  const [cardOpen, setCardOpen] = useState(true);
  // The map folds away to its header bar, so the photo behind it comes back
  // (owner's note on image-63, "make the maps collapsible"). It keeps the
  // visitor's choice while they step through the places.
  const [collapsed, setCollapsed] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLSpanElement>(null);

  // Stepping to another place is a fresh focus, even if the last one was "Show all".
  useEffect(() => {
    setShowAll(false);
    setCardOpen(true);
  }, [place.slug]);

  /**
   * A pin on the map.
   *
   * The pin the card points at is a switch: one tap folds the card away, the next
   * brings it back. Any other pin opens that place, which brings the card back
   * with it — the card belongs to whichever place is showing.
   */
  const pickPin = (slug: string) => {
    if (slug === place.slug) {
      setCardOpen((open) => !open);
      return;
    }
    setCardOpen(true);
    onPick(slug);
  };

  /**
   * Sit the card above the pin and point its tail at it (image-42).
   *
   * The map is written to, not re-rendered: a pan reports its pin's position on
   * every frame, and a React render per frame would fight the map for them. When
   * there is no pin to point at — "Show all" — the card keeps the corner and
   * loses its tail, which would otherwise point at nothing.
   *
   * The pin's point is its *bottom*: its photo stands `PHOTO_PIN_RISE` pixels
   * above the coordinates. Clearing only the tail's gap put the card straight
   * over the pin's photo — the owner's screenshot (image-43) is a card with the
   * pin hidden behind it, its tail pointing at the card's own paper. So the card
   * clears the pin's body, and when there is no room above it, it drops below
   * the pin with the tail turned the other way — never on top of it.
   */
  const trackPin = useCallback((point: { x: number; y: number } | null) => {
    const element = card.current;
    if (!element) return;
    const tip = tail.current;
    const box = element.parentElement;

    if (!point) {
      element.setAttribute("data-anchored", "false");
      element.style.left = "0.75rem";
      element.style.top = "0.75rem";
      element.style.transform = "none";
      if (tip) tip.style.display = "none";
      return;
    }

    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const mapWidth = box?.clientWidth ?? width;
    const mapHeight = box?.clientHeight ?? height;

    const x = Math.min(Math.max(point.x, width / 2 + 6), Math.max(width / 2 + 6, mapWidth - width / 2 - 6));
    const above = point.y - (height + GAP + PHOTO_PIN_RISE) >= 6;
    const y = above
      ? point.y - PHOTO_PIN_RISE - GAP - height
      : Math.min(point.y + GAP, Math.max(6, mapHeight - height - 6));

    element.setAttribute("data-anchored", "true");
    element.setAttribute("data-side", above ? "above" : "below");
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.transform = "translate(-50%, 0)";

    if (tip) {
      // The tail stays on the pin, which is not always the card's centre: the
      // card is clamped into the map, the tail is not.
      const tipX = Math.min(Math.max(point.x - (x - width / 2), 12), width - 12);
      tip.style.display = "";
      tip.style.left = `${tipX}px`;
      tip.setAttribute("data-side", above ? "above" : "below");
    }
  }, []);

  if (places.length === 0) return null;

  const markers: FreeMapMarker[] = places.map((point) => ({
    id: point.slug,
    lat: point.lat,
    lng: point.lng,
    kind: "place",
    label: "",
    title: point.name,
    // The pin the card points at carries the place's photo; the rest stay dots.
    photo: point.slug === place.slug ? place.photo : undefined,
  }));
  const pinned = places.some((point) => point.slug === place.slug);

  return (
    <div
      data-place-map
      // A folded card is a different box, not the same box shortened: the key
      // makes React build it fresh, so no height can be inherited by it.
      key={collapsed ? "folded" : "open"}
      data-collapsed={collapsed ? "true" : "false"}
      // The height is the caller's, and it is a plain length — not a variable —
      // because Chromium kept laying the card out at its expanded height after
      // the inline style went back to `auto` (caught in CI, three times over:
      // inline `auto`, one 44px child, and a 733px box).
      style={{ height: collapsed ? "auto" : height }}
      className={`pointer-events-auto flex flex-col self-start overflow-hidden rounded-2xl bg-surface/92 ring-1 ring-daet-ink/10 shadow-[var(--shadow-float)] backdrop-blur-md dark:bg-slate-950/80 dark:ring-white/15 ${className}`}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
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
        {/* "Show all" acts on a map, so it goes with it. */}
        {!collapsed && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-700/30 transition hover:bg-blue-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-200 dark:ring-blue-300/40 dark:hover:bg-blue-500/15"
          >
            Show all
          </button>
        )}

        {/* Fold it away, and the whole photo comes back. A 44px target like the
            place card's own, in a header bar that is only a little taller. */}
        <button
          type="button"
          onClick={() => setCollapsed((open) => !open)}
          aria-expanded={!collapsed}
          aria-controls="place-map-body"
          aria-label={collapsed ? "Show the map" : "Hide the map"}
          data-map-fold
          className="grid h-9 w-9 shrink-0 -my-1 place-items-center rounded-full text-daet-ink ring-1 ring-inset ring-daet-ink/15 transition hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:bg-muted-strong dark:text-white dark:ring-white/20 dark:hover:bg-white/10 dark:active:bg-white/20"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* The map takes whatever height the caller gives the card and no less
          than the 16rem it used to be: the owner asked for it to stand at about
          nine tenths of the viewport (image-61), so the header row is fixed and
          the map is the rest of the card.

          The map fills this box by being pinned to it, not by a height: the map
          is wrapped in a <figure> of its own, so `h-full` or `flex-1` would size
          it against that figure's auto height and come out zero tall — which is
          exactly what CI caught, twice, before the wheel-zoom test lost its map.
          Pinned to the positioned wrapper, its box is the wrapper's box. */}
      {!collapsed && (
        <div id="place-map-body" data-map-body className="relative min-h-[16rem] flex-1">
          <FreeMap
            markers={markers}
            title={`Map showing ${place.name} and the other places in the fan`}
            // A place with no coordinates yet still gets the map, framing the pins
            // there are rather than flying to nothing.
            focusId={showAll || !pinned ? null : place.slug}
            fitKey={showAll ? "all" : place.slug}
            animateFit
            onMarkerClick={pickPin}
            onFocusPoint={trackPin}
            // Room above the pin for the card *and* the pin's own photo, and the
            // wheel zooms: this map is what the visitor is working in.
            focusOffsetY={76}
            wheelZoom
            controls="zoom"
            className="absolute inset-0"
          />

          {/* The place itself, over the map: its photo, its name, the line about
              it. Nothing in here takes the pointer, so the map still drags.
              The z-index is not decoration: Leaflet paints its own panes at 200 to
              800 inside the map, and a plain absolute sibling sits under every one
              of them — which is how it went missing. */}
          <div
            ref={card}
            data-map-place
            data-anchored="false"
            // Kept in the page while it is folded away, rather than unmounted:
            // its position over the pin is measured from its own box, and a card
            // built again would have to be measured and placed a second time —
            // on a map that may not have moved since.
            data-open={cardOpen ? "true" : "false"}
            aria-hidden="true"
            className={`pointer-events-none absolute z-[800] w-52 origin-bottom transition-[opacity,scale] duration-200 ease-out ${
              cardOpen ? "" : "scale-90 opacity-0"
            }`}
            style={{ left: "0.75rem", top: "0.75rem" }}
          >
            {/* The tail: a rotated square on the card's own ground, so the card
                reads as a bubble over the pin rather than a box that happens to be
                near it. */}
            <span
              ref={tail}
              data-map-place-tail
              data-side="above"
              aria-hidden="true"
              style={{ display: "none" }}
              className="absolute h-2.5 w-2.5 rotate-45 rounded-[2px] bg-surface/95 dark:bg-slate-950/92 data-[side=above]:-bottom-[5px] data-[side=above]:-ml-[5px] data-[side=below]:-top-[5px] data-[side=below]:-ml-[5px]"
            />
            <div className="overflow-hidden rounded-xl bg-surface/95 ring-1 ring-daet-ink/10 shadow-[var(--shadow-float)] backdrop-blur dark:bg-slate-950/92 dark:ring-white/15">
              <Image
                src={place.photo.src}
                alt=""
                width={320}
                height={180}
                sizes="208px"
                className="h-16 w-full object-cover"
              />
              <div className="px-2.5 py-2">
                <p className="flex items-baseline gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-extrabold leading-tight text-daet-ink dark:text-white">
                    {place.name}
                  </span>
                  {typeof place.rating === "number" && (
                    <span className="shrink-0 text-[0.7rem] font-bold leading-tight text-amber-600 dark:text-amber-300">
                      <span aria-hidden="true">★</span> {place.rating.toFixed(1)}
                    </span>
                  )}
                </p>
                <p className="mt-1 line-clamp-2 text-[0.7rem] leading-snug text-daet-ink/75 dark:text-white/75">
                  {place.text}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
