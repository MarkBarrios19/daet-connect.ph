"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as LeafletMap, Marker as LeafletMarker, Polyline } from "leaflet";
import { MARKER_CLASSES, type FreeMapLine, type FreeMapMarker } from "@/components/maps/map-types";
import { categoryShape } from "@/components/ui/icons";
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

  // A place with its photo in the pin: the marker the open place's card points
  // at. A circle with the site's blue drawn round it (so it reads on dark tiles,
  // where the old white ring vanished), and a blue tail that grows straight out
  // of the circle rather than floating under it — the owner's crop (image-44)
  // showed the two as separate shapes with the map's own label between them.
  if (m.photo) {
    el.className = "relative block h-12 w-12";
    const frame = document.createElement("span");
    frame.className =
      "block h-full w-full overflow-hidden rounded-full border-[3px] border-blue-600 bg-surface shadow-[0_4px_14px_rgba(15,23,42,0.45)] dark:border-blue-400 dark:bg-slate-900";
    const img = document.createElement("img");
    img.src = m.photo.src;
    img.alt = "";
    img.decoding = "async";
    img.className = "h-full w-full object-cover";
    // The point: a triangle whose top is tucked under the circle's lower arc, so
    // the two shapes are one pin at any size.
    const tail = document.createElement("span");
    tail.setAttribute("aria-hidden", "true");
    tail.className =
      "absolute left-1/2 top-[38px] h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[10px] border-x-transparent border-t-blue-600 dark:border-t-blue-400";
    frame.append(img);
    el.append(frame, tail);
    return el;
  }

  // A category pin (Desktop-Results board): a dark circle with the place's line
  // icon, the stop number as a white badge on its shoulder, and the name beside it.
  if (m.icon) {
    el.setAttribute("aria-label", m.label ? `Stop ${m.label}: ${m.title}${m.subtitle ? `, ${m.subtitle}` : ""}` : m.title);
    el.className = "relative block";
    const circle = document.createElement("span");
    circle.className = `relative grid h-[34px] w-[34px] place-items-center rounded-full border-[2.5px] border-white bg-slate-900 text-white shadow-[0_2px_6px_rgba(15,23,42,0.35)] ${active ? "ring-4 ring-blue-500/70" : ""}`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", categoryShape(m.icon));
    svg.append(path);
    circle.append(svg);
    el.append(circle);
    if (m.label) {
      const badge = document.createElement("span");
      badge.setAttribute("aria-hidden", "true");
      badge.className = "absolute -right-2 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-surface px-1 text-[11px] font-extrabold leading-none text-blue-700 dark:text-blue-300 shadow-[0_1px_3px_rgba(15,23,42,0.3)]";
      badge.textContent = m.label;
      el.append(badge);
    }
    if (labels) {
      const name = document.createElement("span");
      name.setAttribute("aria-hidden", "true");
      name.className = `pointer-events-none absolute left-full top-1/2 ml-2 block w-max max-w-[10rem] -translate-y-1/2 truncate text-[13px] font-bold ${LABEL_HALO}`;
      name.textContent = m.title;
      el.append(name);
    }
    return el;
  }

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
  `${m.kind}|${m.label}|${m.title}|${m.subtitle ?? ""}|${m.href ?? ""}|${m.photo?.src ?? ""}|${m.icon ?? ""}|${active}|${clickable}|${labels}`;

/** The round white buttons over the map (Desktop-Results board). */
const CONTROL = "pointer-events-auto inline-flex h-11 w-11 items-center justify-center bg-surface text-daet-ink shadow-[0_1px_4px_rgba(15,23,42,0.25)] hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-60";

function ControlIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

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
  focusOffsetY = 0,
  wheelZoom = true,
  onFocusPoint,
  chip,
  controls = "full",
  onCloseFull,
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
  /**
   * Pixels to sit the focused pin *below* the middle of the map.
   *
   * A card drawn over the map needs room above the pin it points at; on a short
   * card the middle of the map leaves none, and the card would have to cover the
   * pin instead of pointing at it.
   */
  focusOffsetY?: number;
  /**
   * Whether the wheel over the map zooms it. On for every map (the owner asked
   * for scroll to zoom everywhere); a map can still turn it off.
   */
  wheelZoom?: boolean;
  /** A short label in the top-left corner, e.g. "Day 2 route". */
  chip?: string;
  /**
   * The buttons over the map: "full" is expand and show-my-location as well as
   * zoom; "zoom" only zoom (a map with its own card over it); "none" nothing.
   */
  controls?: "full" | "zoom" | "none";
  /** Set on the full-screen copy of a map (Expand map): its button and Escape close it. */
  onCloseFull?: () => void;
  /**
   * Where the focused marker is right now, in the map's own pixels.
   *
   * A card drawn over the map has to sit above that pin with its tail on it, and
   * a map pans under its own steam — so the position is reported as it moves
   * (null when there is no pin to point at).
   */
  onFocusPoint?: (point: { x: number; y: number } | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const libRef = useRef<Leaflet | null>(null);
  const markerRefs = useRef(new Map<string, { marker: LeafletMarker; sig: string }>());
  const lineRefs = useRef(new Map<string, { line: Polyline; sig: string }>());
  const latest = useRef({ markers, lines });
  const clickRef = useRef(onMarkerClick);
  const focusPointRef = useRef(onFocusPoint);
  // Bumped whenever a drift should not start (or should stop): a new focus, the viewer moving the map.
  const driftToken = useRef(0);
  const firstFit = useRef(true);
  const [mode, setMode] = useState<"map" | "sketch">("map");
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The viewer's own dot joins the markers once they ask for it.
  const shown: FreeMapMarker[] = me ? [...markers, { id: "__me", kind: "me", lat: me.lat, lng: me.lng, label: "", title: "Your location" }] : markers;
  latest.current = { markers, lines };
  clickRef.current = onMarkerClick;
  focusPointRef.current = onFocusPoint;
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
      // Take the map down and let go of it in the same breath. `setMode` below
      // re-runs this effect, and its cleanup asks the *same* `map` to remove
      // itself a second time — which Leaflet refuses with "Map container is
      // being reused by another instance". That throw came out of a React
      // effect, reached error.tsx, and took the whole page down: a phone on a
      // flaky connection lost the home page because a tile host was away.
      map?.remove();
      map = null;
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
          // A frame later the map may already be gone — given up on, or the
          // component unmounted. Leaflet's `invalidateSize` throws on a removed
          // map, so nothing here runs once the effect has been torn down.
          if (cancelled || !map) return;
          map.invalidateSize();
          fit(map, pointsOf(latest.current.markers, latest.current.lines));
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
      // Null unless `giveUp` already took the map down: one removal per map,
      // whichever of the two paths gets there first.
      map?.remove();
      map = null;
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
    for (const m of shown) {
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
      // A picked, labelled stop is a pin, and so is a photo pin: its tip (the
      // bottom) sits on the spot rather than the middle of the marker.
      const pin = (labels && active && m.kind === "stop") || Boolean(m.photo);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shown` is markers plus `me`
  }, [markers, me, ready, focusId, clickable, labels]);

  // The wheel zooms where the map is something being worked in, and scrolls the
  // page everywhere else.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.scrollWheelZoom) return;
    if (wheelZoom) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [ready, wheelZoom]);

  // Where the focused pin is, for a card drawn over the map that has to point
  // at it. Reported on every pan and zoom: the map moves under its own steam.
  const focusTarget = focusId ? markers.find((marker) => marker.id === focusId) : undefined;
  const focusLat = focusTarget?.lat ?? null;
  const focusLng = focusTarget?.lng ?? null;

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (focusLat === null || focusLng === null) {
      focusPointRef.current?.(null);
      return;
    }
    // Keyed on the pin's own coordinates, not on the array it arrived in: the
    // page re-renders while a photo is dragged, and re-subscribing to the map on
    // every pointer move would be for nothing.
    const spot: [number, number] = [focusLat, focusLng];
    const report = () => {
      const point = map.latLngToContainerPoint(spot);
      focusPointRef.current?.({ x: point.x, y: point.y });
    };
    report();
    map.on("move zoom viewreset resize", report);
    return () => {
      map.off("move zoom viewreset resize", report);
    };
  }, [ready, focusLat, focusLng]);

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
          // A straight leg (no road known, or a boat) is the board's dotted line; a road is solid.
          line.dashed
            ? { color: "#2563eb", weight: 3, opacity: 1, dashArray: "2 8", lineCap: "round", lineJoin: "round" }
            : { color: "#2563eb", weight: 4, opacity: 0.85, lineCap: "round", lineJoin: "round" },
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
    /**
     * Where the camera has to be for the pin to sit where it is wanted.
     *
     * The zoom is a parameter: the slow push in after the flight changes it every
     * frame, and a pixel offset means a different piece of the world at another
     * zoom.
     */
    const camera = (zoom: number): [number, number] => {
      if (!focusOffsetY) return [m.lat, m.lng];
      const spot = map.project([m.lat, m.lng], zoom).subtract([0, focusOffsetY]);
      const ll = map.unproject(spot, zoom);
      return [ll.lat, ll.lng];
    };

    const center = camera(15.5);
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
        const zoom = from + DRIFT_ZOOM * easeOutCubic(t);
        map!.setView(camera(zoom), zoom, { animate: false });
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(raf);
      driftToken.current += 1;
    };
  }, [focusId, ready, focusOffsetY]);

  // Reframe when asked — but never over a focus. A focus is a camera move of its
  // own, and two of them at once fight: each takes the zoom somewhere new, each
  // pulls a fresh level of tiles, and the card flashes blank twice in a row.
  useEffect(() => {
    if (!ready || !mapRef.current || focusId) return;
    fit(mapRef.current, pointsOf(latest.current.markers, latest.current.lines), animateFit && !firstFit.current);
    firstFit.current = false;
  }, [fitKey, ready, animateFit, focusId]);

  // The full-screen copy: Escape closes it, and the page behind it doesn't scroll.
  const closeRef = useRef(onCloseFull);
  closeRef.current = onCloseFull;
  const isFull = Boolean(onCloseFull);
  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current?.();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isFull]);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setNotice("Your location isn't available on this device.");
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(here);
        const map = mapRef.current;
        if (map) map.setView([here.lat, here.lng], Math.max(map.getZoom(), 14), { animate: !reducedMotion() });
      },
      () => {
        setLocating(false);
        setNotice("Your location isn't available. Allow location for this site and try again.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  };

  if (markers.length === 0 && lines.length === 0) return null;
  if (mode === "sketch")
    return (
      <div className="relative">
        <SketchMap markers={markers} lines={lines} title={title} focusId={focusId} pins={labels} />
        {chip ? <span className="pointer-events-none absolute left-3 top-3 inline-flex min-h-8 items-center rounded-full bg-surface px-3 text-sm font-bold text-daet-ink shadow-[0_1px_4px_rgba(15,23,42,0.2)]">{chip}</span> : null}
      </div>
    );

  // The box the map fills. Positioned so the buttons can sit over it; a caller's
  // own `absolute inset-0` keeps its position (and its size comes from that).
  const positioned = /\b(absolute|fixed)\b/.test(className);
  const box = `${positioned ? "" : "relative "}${className}`;

  return (
    // `contents`: the figure draws no box of its own, so a height like `h-full`
    // on the map's box is measured against the caller's box, not a zero-height figure.
    <figure className="contents">
      {/* Expand map: a second copy of the map over the whole page, outside any
          sticky or clipped box this one sits in (those trap a fixed element under the page). */}
      {expanded && !isFull
        ? createPortal(
            <div className="fixed inset-0 z-[100] bg-slate-900/60 p-3 sm:p-8" onClick={(e) => e.target === e.currentTarget && setExpanded(false)}>
              <FreeMap
                markers={markers}
                lines={lines}
                title={`${title} (full screen)`}
                fitKey={fitKey}
                focusId={focusId}
                onMarkerClick={onMarkerClick}
                labels={labels}
                chip={chip}
                className="h-full"
                onCloseFull={() => setExpanded(false)}
              />
            </div>,
            document.body,
          )
        : null}
      <div className={box}>
        {/* The ground is the map's own land colour, not the page's near-white: it is
            what shows in the moment before a tile arrives. Inline, because Leaflet's
            own stylesheet paints `.leaflet-container` grey. */}
        {/* `isolate` is load-bearing: Leaflet gives its panes z-index 400–700, and
            without a stacking context here those panes win against the whole page —
            they painted over the chat dock's left edge. */}
        <div
          ref={container}
          role="region"
          aria-label={title}
          className="absolute inset-0 isolate overflow-hidden rounded-2xl"
          style={{ background: "var(--color-map-ground)" }}
        />
        {controls !== "none" ? (
          <div className="pointer-events-none absolute inset-0 z-10">
            {chip ? <span className="absolute left-3 top-3 inline-flex min-h-8 items-center rounded-full bg-surface px-3 text-sm font-bold text-daet-ink shadow-[0_1px_4px_rgba(15,23,42,0.2)]">{chip}</span> : null}
            {controls === "full" ? (
              <>
                <button
                  type="button"
                  aria-label={isFull ? "Close the full map" : "Expand map"}
                  onClick={() => (isFull ? onCloseFull?.() : setExpanded(true))}
                  // Full screen: the close button is an X at the top right, above the location button.
                  className={`${CONTROL} absolute rounded-full ${isFull ? "right-3 top-3" : `left-3 ${chip ? "top-14" : "top-3"}`}`}
                >
                  <ControlIcon d={isFull ? "M6 6l12 12M18 6L6 18" : "M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"} />
                </button>
                <button type="button" aria-label="Show my location" disabled={locating} onClick={locate} className={`${CONTROL} absolute right-3 ${isFull ? "top-16" : "top-3"} rounded-xl text-blue-600 dark:text-blue-300`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                </button>
              </>
            ) : null}
            <div className="absolute bottom-3 right-3 flex flex-col gap-2">
              <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} className={`${CONTROL} rounded-xl`}>
                <ControlIcon d="M12 5v14M5 12h14" />
              </button>
              <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} className={`${CONTROL} rounded-xl`}>
                <ControlIcon d="M5 12h14" />
              </button>
            </div>
            {notice ? (
              <p role="status" className="pointer-events-auto absolute inset-x-3 bottom-3 mr-14 rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-daet-ink shadow-[0_1px_4px_rgba(15,23,42,0.2)]">
                {notice}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="sr-only">
        {markers.map((m) => (
          <li key={m.id}>{m.title}</li>
        ))}
      </ul>
    </figure>
  );
}
