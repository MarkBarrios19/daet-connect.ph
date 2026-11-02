"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker, Polyline } from "leaflet";
import { MARKER_CLASSES, type FreeMapLine, type FreeMapMarker } from "@/components/maps/map-types";
import { SketchMap } from "@/components/maps/sketch-map";
import type { LatLng } from "@/lib/maps/geo";
import {
  DARK_TILE_FILTER,
  MAP_ATTRIBUTION,
  MAP_LOAD_TIMEOUT_MS,
  MAP_TILES,
  TILE_FAILURES_BEFORE_SKETCH,
  TILE_MAX_ZOOM,
} from "@/lib/maps/map-style";

type Leaflet = typeof import("leaflet");

/** Dark when the page is dark: an explicit choice, else the device setting (src/lib/theme.ts). */
function pageIsDark(): boolean {
  const choice = document.documentElement.getAttribute("data-theme");
  if (choice) return choice === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Stops on a labelled map (the itinerary): dark dots, and a white pin for the picked one. */
const STOP_DOT =
  "grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-slate-900 text-xs font-extrabold text-white";
const STOP_PIN =
  "grid h-8 w-8 place-items-center rounded-full border-2 border-slate-900 bg-white text-sm font-extrabold text-slate-900";
const LABEL_HALO =
  "text-slate-900 [text-shadow:0_0_2px_#fff,0_0_4px_#fff,0_0_6px_#fff] dark:text-slate-100 dark:[text-shadow:0_0_2px_#0f172a,0_0_4px_#0f172a]";

function markerElement(
  m: FreeMapMarker,
  active: boolean,
  labels: boolean,
  onClick?: (id: string) => void,
): HTMLElement {
  // With a click handler the marker is a button that picks the stop; otherwise a link or a picture.
  const el = document.createElement(onClick ? "button" : m.href ? "a" : "div");
  if (onClick) {
    (el as HTMLButtonElement).type = "button";
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(m.id);
    });
    if (active) el.setAttribute("aria-current", "true");
  } else if (m.href) (el as HTMLAnchorElement).href = m.href;
  el.title = m.title;
  // aria-label needs a role on a plain element; links and buttons already have one.
  if (!m.href && !onClick) el.setAttribute("role", "img");
  el.setAttribute("aria-label", m.title);

  if (!(labels && m.kind === "stop")) {
    el.className = MARKER_CLASSES[active && m.kind === "stop" ? "stopActive" : m.kind];
    el.textContent = m.label;
    return el;
  }
  // Labelled stop: the badge (a pin with a stem and a dot when picked), then its name and kind beside it.
  // The accessible name holds every visible word in order (number, name, kind), so "click 2" or
  // "click Bagasbas Beach" works by voice (WCAG 2.5.3, axe label-content-name-mismatch).
  el.setAttribute("aria-label", `Stop ${m.label}: ${m.title}${m.subtitle ? `, ${m.subtitle}` : ""}`);
  el.className = "relative flex flex-col items-center";
  const badge = document.createElement("span");
  badge.className = active ? STOP_PIN : STOP_DOT;
  badge.textContent = m.label;
  el.append(badge, document.createTextNode(" "));
  if (active) {
    const stem = document.createElement("span");
    stem.className = "h-1.5 w-0.5 bg-slate-900";
    const dot = document.createElement("span");
    dot.className = "h-2 w-2 rounded-full border border-white bg-slate-900";
    el.append(stem, dot);
  }
  const label = document.createElement("span");
  label.setAttribute("aria-hidden", "true");
  label.className = `pointer-events-none absolute left-full top-0 ml-1.5 flex w-max max-w-[10rem] flex-col text-left leading-tight ${LABEL_HALO}`;
  // The whole name is in the page and CSS shortens it, so the visible words match the accessible name.
  const name = document.createElement("span");
  name.className = "block max-w-[9rem] truncate text-xs font-bold";
  name.textContent = m.title;
  label.append(name);
  if (m.subtitle) {
    const sub = document.createElement("span");
    sub.className = "text-[11px] font-medium opacity-75";
    sub.textContent = ` ${m.subtitle}`;
    label.append(sub);
  }
  el.append(label);
  return el;
}

const signature = (m: FreeMapMarker, active: boolean, clickable: boolean, labels: boolean) =>
  `${m.kind}|${m.label}|${m.title}|${m.subtitle ?? ""}|${m.href ?? ""}|${active}|${clickable}|${labels}`;

/** The camera after a flight lands: a slow push in, like a drone settling. */
const DRIFT_ZOOM = 0.6;
const DRIFT_MS = 5000;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const pointsOf = (markers: FreeMapMarker[], lines: FreeMapLine[]): LatLng[] => [
  ...markers,
  ...lines.flatMap((line) => line.path),
];

function fit(map: LeafletMap, points: LatLng[], animate = false) {
  if (points.length === 0) return;
  const still = animate && !reducedMotion();
  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 15, { animate: still });
    return;
  }
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  map.fitBounds(
    [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ],
    { padding: [56, 56], maxZoom: 16, animate: still },
  );
}

/**
 * Map on the standard OpenStreetMap tiles, drawn with Leaflet. Markers move in
 * place when their positions change. Follows the light/dark theme; dark mode
 * turns the same tiles down (there is no dark OSM raster). If no tile arrives —
 * no network, or the provider is away — it draws the sketch map instead.
 *
 * `fitKey`: the map frames all markers and lines on load and again whenever
 * this value changes; otherwise it stays where the viewer left it.
 *
 * `focusId`: fly to that marker (pulling back, gliding over, diving in, then a
 * slow drift closer) and mark it active. `labels` names stop markers on the
 * map. `onMarkerClick` makes markers buttons. `animateFit` eases reframes after
 * the first one.
 */
export function FreeMap({
  markers,
  lines = [],
  title,
  fitKey = "",
  className = "h-72 sm:h-96",
  focusId = null,
  onMarkerClick,
  labels = false,
  animateFit = false,
}: {
  markers: FreeMapMarker[];
  lines?: FreeMapLine[];
  title: string;
  fitKey?: string;
  className?: string;
  focusId?: string | null;
  onMarkerClick?: (id: string) => void;
  labels?: boolean;
  animateFit?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const libRef = useRef<Leaflet | null>(null);
  const markerRefs = useRef(new Map<string, { marker: LeafletMarker; sig: string }>());
  const lineRefs = useRef(new Map<string, { line: Polyline; sig: string }>());
  const latest = useRef({ markers, lines });
  const clickRef = useRef(onMarkerClick);
  // Bumped whenever a drift should not start (or should stop): a new focus, the viewer moving the map.
  const driftToken = useRef(0);
  const firstFit = useRef(true);
  const [mode, setMode] = useState<"map" | "sketch">("map");
  const [ready, setReady] = useState(false);
  latest.current = { markers, lines };
  clickRef.current = onMarkerClick;
  const clickable = Boolean(onMarkerClick);

  // Create the map once.
  useEffect(() => {
    if (mode !== "map" || !container.current) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let timer = 0;
    let tiles = false;
    let failedTiles = 0;
    const markersMap = markerRefs.current;
    const linesMap = lineRefs.current;
    const giveUp = () => {
      if (cancelled) return;
      cancelled = true;
      window.clearTimeout(timer);
      map?.remove();
      mapRef.current = null;
      setReady(false);
      setMode("sketch");
    };

    import("leaflet")
      .then((lib) => {
        if (cancelled || !container.current) return;
        libRef.current = lib;

        /** Dark mode has no dark tiles to ask for, so the tiles themselves are turned down. */
        const paint = () => {
          const pane = map?.getPane("tilePane");
          if (pane) pane.style.filter = pageIsDark() ? DARK_TILE_FILTER : "";
        };

        try {
          map = lib.map(container.current, {
            center: [14.112, 122.955],
            zoom: 12,
            // A half-step of zoom, so a flight can land between tile levels.
            zoomSnap: 0.25,
            zoomDelta: 0.5,
            // The page scrolls past the map; the buttons and pinch still zoom it.
            scrollWheelZoom: false,
            zoomControl: false,
            attributionControl: true,
            // An arriving tile fades in from the map's own ground. On a small card
            // that fade is a pulse of blank paper every time the camera moves a
            // level — the flash the owner saw after Next. Tiles simply appear now.
            fadeAnimation: false,
          });
        } catch {
          giveUp();
          return;
        }
        mapRef.current = map;
        lib.control.zoom({ position: "topright" }).addTo(map);

        const tiles_ = lib
          .tileLayer(MAP_TILES.light, {
            maxZoom: TILE_MAX_ZOOM,
            attribution: MAP_ATTRIBUTION,
            crossOrigin: true,
            detectRetina: true,
            // Tiles are only swapped once a zoom animation has finished, and the
            // level already on screen is kept well past the edges: the new tiles
            // arrive behind the old ones instead of over a hole.
            updateWhenZooming: false,
            keepBuffer: 3,
          })
          .addTo(map);

        tiles_.on("tileload", () => {
          tiles = true;
          window.clearTimeout(timer);
        });
        tiles_.on("tileerror", () => {
          failedTiles += 1;
          if (!tiles && failedTiles >= TILE_FAILURES_BEFORE_SKETCH) giveUp();
        });
        timer = window.setTimeout(() => !tiles && giveUp(), MAP_LOAD_TIMEOUT_MS);

        // The viewer taking over the camera stops the drift.
        const stopDrift = () => {
          driftToken.current += 1;
        };
        map.on("dragstart", stopDrift);
        map.on("wheel", stopDrift);
        map.on("touchstart", stopDrift);

        paint();
        // The container may still be settling when it mounts (an overlay opening).
        requestAnimationFrame(() => {
          map?.invalidateSize();
          if (map) fit(map, pointsOf(latest.current.markers, latest.current.lines));
          setReady(true);
        });

        const onTheme = () => paint();
        const observer = new MutationObserver(onTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", onTheme);
        map.once("unload", () => {
          observer.disconnect();
          media.removeEventListener("change", onTheme);
        });
      })
      .catch(giveUp);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      markersMap.forEach(({ marker }) => marker.remove());
      markersMap.clear();
      linesMap.forEach(({ line }) => line.remove());
      linesMap.clear();
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [mode]);

  // Markers: add, move, restyle or remove.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const active = m.id === focusId;
      const sig = signature(m, active, clickable, labels);
      const existing = markerRefs.current.get(m.id);
      if (existing && existing.sig === sig) {
        existing.marker.setLatLng([m.lat, m.lng]);
        continue;
      }
      existing?.marker.remove();
      const element = markerElement(m, active, labels, clickable ? (id) => clickRef.current?.(id) : undefined);
      // A picked, labelled stop is a pin: its tip (the bottom) sits on the spot.
      const pin = labels && active && m.kind === "stop";
      // Shrink-wrapped, so a percentage shift is a shift by the marker's own size;
      // the icon box itself is 0×0, so Leaflet's own anchor maths is out of it.
      const anchor = document.createElement("div");
      anchor.className = pin
        ? "inline-block -translate-x-1/2 -translate-y-full"
        : "inline-block -translate-x-1/2 -translate-y-1/2";
      anchor.append(element);
      const marker = lib
        .marker([m.lat, m.lng], {
          icon: lib.divIcon({ html: anchor, className: "daet-marker", iconSize: [0, 0] }),
          keyboard: false,
          title: m.title,
          alt: m.title,
        })
        .addTo(map);
      markerRefs.current.set(m.id, { marker, sig });
    }
    for (const [id, { marker }] of markerRefs.current) {
      if (!seen.has(id)) {
        marker.remove();
        markerRefs.current.delete(id);
      }
    }
  }, [markers, ready, focusId, clickable, labels]);

  // Lines: the road legs, a dashed straight line where there is no road.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    const seen = new Set<string>();
    for (const line of lines) {
      seen.add(line.id);
      const sig = `${line.dashed ? "dash" : "solid"}|${line.path.map((p) => `${p.lat},${p.lng}`).join(";")}`;
      const existing = lineRefs.current.get(line.id);
      if (existing && existing.sig === sig) continue;
      existing?.line.remove();
      const drawn = lib
        .polyline(
          line.path.map((p) => [p.lat, p.lng] as [number, number]),
          {
            color: "#2563eb",
            weight: 4,
            opacity: 0.85,
            dashArray: line.dashed ? "8 8" : undefined,
            lineCap: "round",
            lineJoin: "round",
          },
        )
        .addTo(map);
      lineRefs.current.set(line.id, { line: drawn, sig });
    }
    for (const [id, { line }] of lineRefs.current) {
      if (!seen.has(id)) {
        line.remove();
        lineRefs.current.delete(id);
      }
    }
  }, [lines, ready]);

  // Focus: pull back, glide over and dive in to the picked marker, then drift slowly closer.
  useEffect(() => {
    const map = mapRef.current;
    const token = ++driftToken.current;
    if (!ready || !map || !focusId) return;
    const m = latest.current.markers.find((marker) => marker.id === focusId);
    if (!m) return;
    const center: [number, number] = [m.lat, m.lng];
    if (reducedMotion()) {
      map.setView(center, 15.5, { animate: false });
      return;
    }
    map.flyTo(center, 15.5, { duration: 1.1, easeLinearity: 0.25 });

    // Leaflet animates the flight itself; the slow push in after it is ours.
    let raf = 0;
    map.once("moveend", () => {
      if (driftToken.current !== token) return;
      const from = map!.getZoom();
      const startedAt = performance.now();
      const step = (now: number) => {
        if (driftToken.current !== token) return;
        const t = Math.min(1, (now - startedAt) / DRIFT_MS);
        map!.setView(center, from + DRIFT_ZOOM * easeOutCubic(t), { animate: false });
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(raf);
      driftToken.current += 1;
    };
  }, [focusId, ready]);

  // Reframe when asked — but never over a focus. A focus is a camera move of its
  // own, and two of them at once fight: each takes the zoom somewhere new, each
  // pulls a fresh level of tiles, and the card flashes blank twice in a row.
  useEffect(() => {
    if (!ready || !mapRef.current || focusId) return;
    fit(mapRef.current, pointsOf(latest.current.markers, latest.current.lines), animateFit && !firstFit.current);
    firstFit.current = false;
  }, [fitKey, ready, animateFit, focusId]);

  if (markers.length === 0 && lines.length === 0) return null;
  if (mode === "sketch")
    return <SketchMap markers={markers} lines={lines} title={title} focusId={focusId} pins={labels} />;

  return (
    <figure>
      {/* The ground is the map's own land colour, not the page's near-white: it is
          what shows in the moment before a tile arrives. Inline, because Leaflet's
          own stylesheet paints `.leaflet-container` grey. */}
      <div
        ref={container}
        role="region"
        aria-label={title}
        className={`w-full overflow-hidden rounded-2xl ${className}`}
        style={{ background: "var(--color-map-ground)" }}
      />
      <ul className="sr-only">
        {markers.map((m) => (
          <li key={m.id}>{m.title}</li>
        ))}
      </ul>
    </figure>
  );
}
