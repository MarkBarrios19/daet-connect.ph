/** Camarines Norte, roughly: the picker and the place search stay inside it. */
export const PICKER_BOUNDS = { south: 13.9, west: 122.45, north: 14.65, east: 123.2 } as const;

export function insideBounds(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= PICKER_BOUNDS.south &&
    lat <= PICKER_BOUNDS.north &&
    lng >= PICKER_BOUNDS.west &&
    lng <= PICKER_BOUNDS.east
  );
}

/** Six decimals is about 10 cm: plenty, and the form shows tidy numbers. */
export const roundCoord = (value: number) => Math.round(value * 1e6) / 1e6;

export type PlaceResult = { name: string; detail: string; lat: number; lng: number };

/** Turns Nominatim rows into short results inside the bounds; skips anything malformed. */
export function parsePlaces(rows: unknown): PlaceResult[] {
  if (!Array.isArray(rows)) return [];
  const out: PlaceResult[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!insideBounds(lat, lng)) continue;
    const display = typeof row.display_name === "string" ? row.display_name : "";
    const name = (typeof row.name === "string" && row.name) || display.split(",")[0]?.trim() || "";
    if (!name) continue;
    const detail = display.split(",").slice(1, 3).join(",").trim();
    out.push({ name: name.slice(0, 100), detail: detail.slice(0, 120), lat: roundCoord(lat), lng: roundCoord(lng) });
  }
  return out;
}
