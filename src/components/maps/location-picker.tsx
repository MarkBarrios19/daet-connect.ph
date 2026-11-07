"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { DARK_TILE_FILTER, MAP_ATTRIBUTION, MAP_TILES, TILE_MAX_ZOOM } from "@/lib/maps/map-style";
import { insideBounds, PICKER_BOUNDS, roundCoord, type PlaceResult } from "@/lib/maps/picker";

const PIN =
  "grid h-8 w-8 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-br-none -rotate-45 border-2 border-surface bg-blue-600";

type Props = {
  latitude: number | null;
  longitude: number | null;
  /** Called when the pin moves; `placeName` only comes from a search result. */
  onChange: (latitude: number, longitude: number, placeName?: string) => void;
  className?: string;
  /** Only allow selecting a point on the map. */
  mapOnly?: boolean;
};

/**
 * Pick a spot without copying numbers: search a place, tap the map, drag the
 * pin, or use your location. Stays inside Camarines Norte.
 */
export function LocationPicker({ latitude, longitude, onChange, className = "h-64", mapOnly = false }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  onChangeRef.current = onChange;

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    void import("leaflet").then((L) => {
      if (cancelled || !holder.current) return;
      const start: [number, number] = latitude !== null && longitude !== null && insideBounds(latitude, longitude) ? [latitude, longitude] : [14.1122, 122.9553];
      const map = L.map(holder.current, {
        center: start,
        zoom: 15,
        maxZoom: TILE_MAX_ZOOM,
        maxBounds: [
          [PICKER_BOUNDS.south, PICKER_BOUNDS.west],
          [PICKER_BOUNDS.north, PICKER_BOUNDS.east],
        ],
        maxBoundsViscosity: 0.8,
        minZoom: 9,
      });
      const dark = document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
      L.tileLayer(MAP_TILES.light, { attribution: MAP_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM, className: dark ? "picker-dark-tiles" : "" }).addTo(map);
      const icon = L.divIcon({ className: "", html: `<span class="${PIN}"><span class="block h-2.5 w-2.5 rotate-45 rounded-full bg-surface"></span></span>`, iconSize: [0, 0] });
      const marker = L.marker(start, { icon, draggable: true, keyboard: true, alt: "Stop location. Drag to move." });
      if (!mapOnly || (latitude !== null && longitude !== null)) marker.addTo(map);
      const move = (lat: number, lng: number) => {
        if (!insideBounds(lat, lng)) {
          marker.setLatLng(markerRef.current?.getLatLng() ?? start);
          setMessage("That is outside Camarines Norte.");
          return;
        }
        setMessage(null);
        if (!map.hasLayer(marker)) marker.addTo(map);
        onChangeRef.current(roundCoord(lat), roundCoord(lng));
      };
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        move(p.lat, p.lng);
      });
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        move(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      markerRef.current = marker;
      // Leaflet needs a size nudge when it starts inside a dialog.
      window.setTimeout(() => map.invalidateSize(), 50);
      cleanup = () => {
        map.remove();
        mapRef.current = null;
        markerRef.current = null;
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the numbers when they are typed or a search result is picked.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || latitude === null || longitude === null || !insideBounds(latitude, longitude)) return;
    if (!map.hasLayer(marker)) marker.addTo(map);
    const current = marker.getLatLng();
    if (Math.abs(current.lat - latitude) < 1e-7 && Math.abs(current.lng - longitude) < 1e-7) return;
    marker.setLatLng([latitude, longitude]);
    if (!map.getBounds().contains([latitude, longitude])) map.setView([latitude, longitude], Math.max(map.getZoom(), 15));
  }, [latitude, longitude]);

  // Debounced place search.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/places/search?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        const body = (await response.json()) as { results?: PlaceResult[]; error?: string };
        setResults(body.results ?? []);
        setMessage(body.results?.length === 0 ? "No places found. Tap the map to place the pin." : (body.error ?? null));
      } catch {
        if (!controller.signal.aborted) setMessage("Search is unavailable. Tap the map to place the pin.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function choose(place: PlaceResult) {
    setResults([]);
    setQuery("");
    setMessage(null);
    onChangeRef.current(place.lat, place.lng, place.name);
    mapRef.current?.setView([place.lat, place.lng], 17);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage("This device can't share its location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!insideBounds(lat, lng)) {
          setMessage("Your location is outside Camarines Norte.");
          return;
        }
        setMessage(null);
        onChangeRef.current(roundCoord(lat), roundCoord(lng));
        mapRef.current?.setView([lat, lng], 17);
      },
      () => setMessage("Allow location access, or tap the map instead."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-2">
      {!mapOnly && <div className="relative">
        <label className="sr-only" htmlFor="place-search">Search for a place</label>
        <input
          id="place-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place, e.g. Bagasbas Beach"
          autoComplete="off"
          className="w-full rounded-2xl border border-daet-ink/20 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-daet-forest/30"
        />
        {results.length > 0 ? (
          <ul className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-56 overflow-y-auto rounded-2xl card-edge bg-surface">
            {results.map((place) => (
              <li key={`${place.lat},${place.lng},${place.name}`}>
                <button type="button" onClick={() => choose(place)} className="block min-h-11 w-full px-3 py-2 text-left hover:bg-canvas">
                  <span className="block font-bold text-daet-ink">{place.name}</span>
                  {place.detail ? <span className="block text-sm text-daet-ink/70">{place.detail}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>}
      <div className={`relative overflow-hidden rounded-2xl card-edge ${className}`}>
        <div ref={holder} className="absolute inset-0 z-0" role="application" aria-label="Map: tap to place the stop, or drag the pin" />
        <style>{`.picker-dark-tiles{filter:${DARK_TILE_FILTER}}`}</style>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-daet-ink/70" aria-live="polite">{searching ? "Searching…" : (message ?? "Tap the map or drag the pin to set the spot.")}</p>
        {!mapOnly && <button type="button" onClick={useMyLocation} className="min-h-11 rounded-full px-3 font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40">
          Use my location
        </button>}
      </div>
    </div>
  );
}
