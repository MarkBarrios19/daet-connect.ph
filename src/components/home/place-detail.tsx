"use client";

import React, { useEffect, useRef, useState } from "react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { placeMapsUrl } from "@/lib/tours/guide/maps";
import type { FanPlace } from "./fan-places";
import { PlaceMapPanel, type MapPoint } from "./place-map-panel";

/**
 * What opens over the fan: the place's name, where it sits in the six, what it
 * is, and the two things a visitor can do next.
 *
 * Laid out as in the owner's sketch (image-30): two cards side by side over the
 * photo. On the left the map card — "Viewing <place>", the place's photo and
 * line over the map, and "Show all" — and beside it the place's own card, with
 * the Fun fact card under it. The card folds: expanded it carries the words and
 * the two ways on, collapsed it is a slim bar with the position, the name and a
 * chevron, so the photo is nearly clear. The ‹ › pair lives in the card's own
 * header, and the map beside it follows them.
 *
 * On a phone the card is a sheet at the foot of the screen — the photo above it,
 * whole, and the buttons under a thumb — with a grab handle and only its top
 * corners rounded. The photo can be dragged to look along it, the map card and
 * the Fun fact card are desktop only, and the sheet opens folded to a peek.
 *
 * There is no ✕: Escape closes the place, and so does tapping the photo again.
 * The card follows the page's theme — a white glass card in light mode, the
 * dark one in dark mode — and its edges ring, rather than a shadow, keep it
 * apart from whatever photo is behind it.
 */
export function PlaceDetail({
  place,
  index,
  total,
  phone,
  headingRef,
  onPrev,
  onNext,
  places = [],
  onPick,
}: {
  place: FanPlace;
  index: number;
  total: number;
  phone: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onPrev: () => void;
  onNext: () => void;
  /** Every place the map can pin, with the coordinates the places table gave. */
  places?: MapPoint[];
  onPick: (slug: string) => void;
}) {
  // A phone opens the bar, not the whole card: the photo is the point, and the
  // words are one tap away. A desktop has room for both.
  const [collapsed, setCollapsed] = useState(phone);

  // A window dragged from a phone's width to a desktop's keeps its React state, so
  // the card has to follow the layout: folded on a phone, open on a desktop. It
  // still folds and unfolds by hand in between.
  useEffect(() => {
    setCollapsed(phone);
  }, [phone]);

  // A new place folds the sheet back to its peek on a phone: a step is someone
  // asking to see the next photo, and an open sheet covers half of it.
  useEffect(() => {
    if (phone) setCollapsed(true);
  }, [phone, place.slug]);
  const position = index + 1;

  /**
   * "Open in Google Maps", not a jump down the page (owner's note, image-92).
   *
   * The old link scrolled to the map section, which is now a phone's section
   * only — and the visitor who wants directions wants them in the maps app they
   * already have. It has to open the place that is in front of them (owner's
   * note, image-93): the row for this slug carries its own town and whether the
   * office has confirmed its pin, so Bagasbas goes to Bagasbas, and Apuao and
   * Calaguas are searched for in Mercedes and Vinzons rather than in Daet.
   */
  const point = places.find((candidate) => candidate.slug === place.slug);
  const googleMapsHref = placeMapsUrl({
    name: point?.name ?? place.name,
    municipality: point?.municipality ?? place.town,
    point: point ? { lat: point.lat, lng: point.lng } : null,
    pinConfirmed: point?.verified ?? false,
  });

  /** A 44px circle in the card's header: ink in light, white in dark. */
  const step =
    "grid h-11 w-11 place-items-center rounded-full text-daet-ink ring-1 ring-inset ring-daet-ink/15 transition hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:bg-muted-strong dark:text-white dark:ring-white/20 dark:hover:bg-white/10 dark:active:bg-white/20";

  const pin = (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
    </svg>
  );

  const card = (
    <section
      data-detail
      aria-labelledby="place-detail-title"
      className={`pointer-events-auto w-full bg-surface/92 text-daet-ink shadow-[var(--shadow-float)] ring-1 ring-daet-ink/10 backdrop-blur-md dark:bg-slate-950/82 dark:text-white dark:ring-white/15 ${
        phone
          ? // A sheet, not a floating card: it is docked to the foot of the
            // photo, as wide as the screen, with only its top corners rounded and
            // room for the phone's own safe area under it. It can grow taller
            // than the screen — the words are the point once it is open — so it
            // scrolls inside itself rather than off the top of the photo.
            "max-h-[calc(85svh-var(--tab-bar-h))] overflow-y-auto overscroll-contain rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5"
          : "max-w-[18rem] rounded-2xl p-4"
      }`}
    >
      {phone && (
        /* The sheet's grab handle: it says "this comes up" before the words do. */
        <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-full bg-daet-ink/20 dark:bg-white/30" />
      )}
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-daet-ink/70 dark:text-white/75">
          {pin}
          <span className="truncate">
            {position} of {total}
          </span>
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" onClick={onPrev} aria-label="Previous place" className={step}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button type="button" onClick={onNext} aria-label="Next place" className={step}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((open) => !open)}
            aria-expanded={!collapsed}
            aria-controls="place-detail-body"
            aria-label={collapsed ? "Show the place's details" : "Hide the place's details"}
            className={step}
          >
            <svg
              className={`h-5 w-5 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      <h2
        id="place-detail-title"
        ref={headingRef}
        tabIndex={-1}
        className={
          collapsed
            ? "mt-2 text-lg font-extrabold leading-tight tracking-tight outline-none"
            : "mt-2 text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-blue-700 outline-none dark:text-white"
        }
      >
        {place.name}
      </h2>

      <div id="place-detail-body" hidden={collapsed}>
        <p className="mt-2 text-sm leading-relaxed text-daet-ink/85 dark:text-white/90">{place.text}</p>

        {place.tag && (
          <p className="mt-3 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-500/20 dark:text-blue-100">
            {place.tag}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {/* A plain anchor to Google's own Maps URL, so it works with the script
              off and on a phone hands over to the Maps app. The place stays open
              behind it: nothing here touches the hash. */}
          <a
            href={googleMapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ size: "md" })}
          >
            Open in Google Maps
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <ButtonLink href={place.toursHref} variant="secondary" size="md">
            Trips near here
          </ButtonLink>
        </div>
      </div>
    </section>
  );

  return (
    <div
      data-detail-layer
      className={`pointer-events-none absolute inset-x-0 z-30 ${
        phone
          ? // A phone's card is a sheet at the foot of the photo (image-74), so
            // the photo is above it, whole, and the buttons are under a thumb.
            // It stops at the signed-in tab bar rather than running under it
            // (--tab-bar-h is zero when there is no bar).
            "bottom-[var(--tab-bar-h)]"
          : "top-[calc(var(--header-h)+0.5rem)] sm:top-[calc(var(--header-h)+1rem)]"
      }`}
    >
      <div
        data-detail-frame
        className={
          phone
            ? // Full width: the sheet's edges are the screen's, and its own
              // padding keeps the words off them.
              "w-full"
            : // Flush to the left of the photo, as the owner asked: the cards hug the
              // page's edge instead of sitting on its centred column and leaving a
              // field of empty photo between them and it.
              "w-full pl-3 sm:pl-4"
        }
      >
        {phone ? (
          card
        ) : (
          // The map card first, the place's own card beside it, with the photo
          // behind. There used to be a third card under the place's — a "Fun
          // fact" — and the owner asked for it to go: every place would have
          // shown the Tourism Office's placeholder until someone wrote one.
          <div className="flex items-start gap-3">
            {/* A tall card, not a band: the owner asked for the map at about
                nine tenths of the viewport (image-61), and for it to fold away
                again when they want the photo (image-63). So the height is
                handed over as a value the card applies while it is open — the
                card's top is the header plus the frame's own gap, so taking
                that off the height leaves its bottom edge on the 90% line. */}
            <PlaceMapPanel
              place={place}
              places={places}
              onPick={onPick}
              height="calc(90svh - var(--header-h) - 1rem)"
              className="w-[24rem] shrink-0"
            />
            <div className="w-[18rem] shrink-0">{card}</div>
          </div>
        )}
      </div>
    </div>
  );
}
