"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapLine, FreeMapMarker } from "@/components/maps/map-types";
import { LineIcon } from "@/components/ui/icons";
import { decodePolyline, formatDistance, formatDuration, type Leg } from "@/lib/maps/geo";
import type { StopDetail } from "@/lib/tours/stop-details";

/** Long descriptions open clamped, with "Read more". */
const LONG_TEXT = 220;

/**
 * A tour's stops as a timeline beside its map. Opening a stop shows its photo
 * and details and flies the map there with a popup; tapping a pin opens that
 * stop. One stop is open at a time. `legs[i]` is the trip between the i-th
 * and (i+1)-th stops that have a map pin.
 */
export function StopExplorer({ stops, legs, meetingPoint, title }: { stops: StopDetail[]; legs: Leg[]; meetingPoint: string; title: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const pinned = useMemo(() => stops.filter((s): s is StopDetail & { lat: number; lng: number } => s.lat !== null && s.lng !== null), [stops]);
  const pinIndex = useMemo(() => new Map(pinned.map((s, i) => [s.id, i])), [pinned]);
  const markers = useMemo<FreeMapMarker[]>(
    () =>
      pinned.map((s) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        kind: "stop",
        label: String(stops.indexOf(s) + 1),
        title: s.name,
        subtitle: s.subtitle ?? undefined,
      })),
    [pinned, stops],
  );
  const lines = useMemo<FreeMapLine[]>(
    () =>
      pinned.slice(1).map((dest, i) => {
        const encoded = legs[i]?.polyline;
        return { id: `leg${i}`, path: encoded ? decodePolyline(encoded) : [pinned[i], dest], dashed: !encoded };
      }),
    [pinned, legs],
  );

  const openIndex = openId ? stops.findIndex((s) => s.id === openId) : -1;
  const open = openIndex >= 0 ? stops[openIndex] : null;
  const focusId = open && pinIndex.has(open.id) ? open.id : null;

  const choose = (id: string | null, scroll = false) => {
    setOpenId(id);
    setExpandedText(null);
    if (id && scroll) rows.current.get(id)?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const step = (by: number) => {
    const from = openIndex < 0 ? (by > 0 ? -1 : 0) : openIndex;
    choose(stops[(from + by + stops.length) % stops.length].id, true);
  };
  const recenter = () => {
    choose(null);
    setFitKey((k) => k + 1);
  };

  const legAfter = (stop: StopDetail): Leg | null => {
    const i = pinIndex.get(stop.id);
    return i === undefined ? null : (legs[i] ?? null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-10">
      {pinned.length > 0 ? (
        <div className="sticky top-[var(--header-h)] z-20 -mx-4 bg-canvas px-4 pb-3 pt-2 sm:mx-0 sm:px-0 lg:top-[calc(var(--header-h)+1.5rem)] lg:order-2 lg:pt-0">
          <div className="relative">
            <FreeMap
              markers={markers}
              lines={lines}
              title={title}
              className="h-56 sm:h-72 lg:h-[min(70vh,40rem)]"
              fitKey={String(fitKey)}
              animateFit
              focusId={focusId}
              labels
              onMarkerClick={(id) => choose(id, true)}
            />
            <button
              type="button"
              onClick={recenter}
              className="absolute left-1/2 top-2 z-10 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-4 text-sm font-bold text-daet-ink shadow-[var(--shadow-float)] hover:bg-muted"
            >
              <LineIcon name="pin" className="h-4 w-4 text-blue-600 dark:text-blue-300" /> Recenter itinerary
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => step(-1)} aria-label="Previous stop" className="grid h-11 w-11 place-items-center rounded-full bg-daet-ink text-canvas hover:opacity-90">
              <LineIcon name="arrowRight" className="h-5 w-5 rotate-180" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next stop" className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-white hover:bg-blue-700">
              <LineIcon name="arrowRight" className="h-5 w-5" />
            </button>
            <p className="min-w-0 flex-1 text-sm font-semibold text-daet-ink/80" aria-live="polite">
              {open ? `Stop ${openIndex + 1} of ${stops.length}` : `${stops.length} stops`}
              {open ? <span className="sr-only">: {open.name}</span> : null}
              {open && !focusId ? " · no map pin for this stop" : ""}
            </p>
          </div>
        </div>
      ) : null}

      <ol className="lg:order-1">
        <li className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 pb-5">
          <span aria-hidden="true" className="absolute bottom-0 left-[1.0625rem] top-8 border-l-2 border-dotted border-daet-ink/30" />
          <span className="relative z-[1] grid h-8 place-items-center self-start rounded-full bg-amber-300 text-xs font-extrabold text-slate-950">Start</span>
          <p className="pt-1 text-daet-ink">
            <span className="font-bold">Meet at</span> {meetingPoint}
          </p>
        </li>
        {stops.map((stop, index) => {
          const isOpen = stop.id === openId;
          const leg = legAfter(stop);
          const last = index === stops.length - 1;
          const panelId = `stop-panel-${stop.id}`;
          const long = (stop.description?.length ?? 0) > LONG_TEXT;
          const textOpen = expandedText === stop.id;
          return (
            <li
              key={stop.id}
              ref={(node) => {
                if (node) rows.current.set(stop.id, node);
                else rows.current.delete(stop.id);
              }}
              className="relative grid scroll-mt-80 grid-cols-[2.25rem_minmax(0,1fr)] gap-3 pb-5 sm:scroll-mt-96 lg:scroll-mt-28"
            >
              {!last ? <span aria-hidden="true" className="absolute bottom-0 left-[1.0625rem] top-10 border-l-2 border-dotted border-daet-ink/30" /> : null}
              <span
                aria-hidden="true"
                className={`relative z-[1] grid h-9 w-9 place-items-center rounded-full font-extrabold transition-colors ${isOpen ? "bg-blue-600 text-white ring-4 ring-amber-300" : "bg-daet-ink text-canvas"}`}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => choose(isOpen ? null : stop.id)}
                    className="group block w-full rounded-xl py-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <span className="block text-lg font-bold text-daet-ink group-hover:underline">{stop.name}</span>
                    {leg ? (
                      <span className="block text-sm text-daet-ink/75">
                        {leg.estimated ? "About " : ""}
                        {formatDuration(leg.durationS)} ({formatDistance(leg.distanceM)}) to the next stop
                      </span>
                    ) : null}
                    {!isOpen ? (
                      <span className="mt-0.5 block text-sm font-bold text-blue-700 dark:text-blue-300">{stop.photo ? "See details & photo" : "See details"}</span>
                    ) : null}
                  </button>
                </h3>
                <div id={panelId} hidden={!isOpen} className="mt-3">
                  {isOpen ? (
                    <div className="motion-safe:animate-[stop-open_250ms_var(--ease-out)]">
                      {stop.photo ? (
                        // Attraction photos come from storage URLs as well as /photos; a plain img serves both.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={stop.photo.src} alt={stop.photo.alt} className="aspect-[16/9] w-full rounded-2xl bg-muted object-cover" />
                      ) : null}
                      {stop.description ? (
                        <p className={`mt-3 leading-relaxed text-daet-ink/90 ${long && !textOpen ? "line-clamp-4" : ""}`}>{stop.description}</p>
                      ) : (
                        <p className="mt-3 text-daet-ink/75">The operator hasn&apos;t added a description for this stop.</p>
                      )}
                      {long ? (
                        <button type="button" onClick={() => setExpandedText(textOpen ? null : stop.id)} className="mt-1 inline-flex min-h-11 items-center font-bold text-daet-ink underline">
                          {textOpen ? "Read less" : "Read more"}
                        </button>
                      ) : null}
                      {!pinIndex.has(stop.id) ? <p className="mt-2 text-sm text-daet-ink/75">No map pin for this stop.</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {stop.href ? (
                          <Link href={stop.href} className="inline-flex min-h-11 items-center gap-1 rounded-full px-5 font-bold text-daet-ink ring-1 ring-inset ring-daet-ink/40 hover:bg-muted">
                            More about {stop.name}
                          </Link>
                        ) : null}
                        <button type="button" onClick={() => choose(null)} className="inline-flex min-h-11 items-center px-2 font-semibold text-daet-ink/80 hover:underline">
                          See less
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
