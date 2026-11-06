"use client";

import { useMemo } from "react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapLine, FreeMapMarker } from "@/components/maps/map-types";
import { decodePolyline, type LatLng } from "@/lib/maps/geo";

export type MapPoint = LatLng & {
  label: string;
  href?: string;
  /** The place's category, drawn as its icon in the pin. */
  icon?: string;
  /** The place's photo, drawn in an orange pin. */
  photo?: string;
};

/**
 * Markers (numbered when `connect`), each with the place's name, and the route between them, on the free
 * tile map. A leg uses its road polyline when there is one, else a dashed
 * straight line. Falls back to a sketch when tiles can't load.
 */
export function RouteMap({
  points,
  polylines = [],
  connect = false,
  className = "",
  title,
  chip,
  mapClassName,
}: {
  points: MapPoint[];
  polylines?: Array<string | null>;
  connect?: boolean;
  className?: string;
  title: string;
  /** A short label over the map's top-left corner, e.g. "Day 2 route". */
  chip?: string;
  /** The map's own height classes (default h-72 sm:h-96). */
  mapClassName?: string;
}) {
  const markers = useMemo<FreeMapMarker[]>(
    () => points.map((p, i) => ({ id: `p${i}`, lat: p.lat, lng: p.lng, kind: connect ? "stop" : "place", label: connect ? String(i + 1) : "", title: p.label, href: p.href, icon: p.icon, photo: p.photo ? { src: p.photo } : undefined })),
    [points, connect],
  );
  const lines = useMemo<FreeMapLine[]>(
    () =>
      connect
        ? points.slice(1).map((dest, i) => {
            const encoded = polylines[i];
            return { id: `leg${i}`, path: encoded ? decodePolyline(encoded) : [points[i], dest], dashed: !encoded };
          })
        : [],
    [points, polylines, connect],
  );
  if (points.length === 0) return null;
  return (
    <div className={className}>
      <FreeMap markers={markers} lines={lines} title={title} chip={chip} labels {...(mapClassName ? { className: mapClassName } : {})} />
    </div>
  );
}
