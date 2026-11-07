export type CreateStop = {
  locationName: string;
  description: string;
  latitude: number;
  longitude: number;
};

export type Attraction = {
  id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function validCoordinates(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

/** Treat all submitted form data as untrusted, including the hidden JSON. */
export function parseStops(value: FormDataEntryValue | null): CreateStop[] | null {
  if (typeof value !== "string") return null;
  try {
    const items: unknown = JSON.parse(value);
    if (!Array.isArray(items) || items.length === 0) return null;
    const stops: CreateStop[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") return null;
      const stop = item as Record<string, unknown>;
      if (typeof stop.locationName !== "string" || !stop.locationName.trim() ||
          typeof stop.description !== "string" || !validCoordinates(stop.latitude, stop.longitude)) return null;
      stops.push({ locationName: stop.locationName.trim(), description: stop.description.trim(), latitude: stop.latitude as number, longitude: stop.longitude as number });
    }
    return stops;
  } catch {
    return null;
  }
}
