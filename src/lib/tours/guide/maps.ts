import type { LatLng } from "@/lib/maps/geo";

/**
 * Google Maps links (Maps URLs, api=1), no key needed. Directions leave out
 * the origin on purpose: Google Maps then starts from the phone's own
 * location. A place without a confirmed pin is searched by name instead.
 * https://developers.google.com/maps/documentation/urls/guide
 */

export type MapsTarget = { point?: LatLng | null; name: string; area?: string | null };
export type MapsMode = "driving" | "walking" | "transit";

const MAX_URL = 2048;

/** What Google Maps should look for: the pin if there is one, else "name, area, Camarines Norte". */
export function mapsQuery(target: MapsTarget): string {
  if (target.point) return `${target.point.lat.toFixed(6)},${target.point.lng.toFixed(6)}`;
  const area = target.area?.trim() || "Daet";
  const parts = [target.name.trim(), area];
  if (!/camarines norte/i.test(area)) parts.push("Camarines Norte");
  return parts.filter(Boolean).join(", ");
}

const clip = (url: string) => (url.length > MAX_URL ? url.slice(0, MAX_URL) : url);

export function mapsDirectionsUrl(target: MapsTarget, mode: MapsMode = "driving"): string {
  const params = new URLSearchParams({ api: "1", destination: mapsQuery(target), travelmode: mode });
  return clip(`https://www.google.com/maps/dir/?${params.toString()}`);
}

export function mapsPlaceUrl(target: MapsTarget): string {
  const params = new URLSearchParams({ api: "1", query: mapsQuery(target) });
  return clip(`https://www.google.com/maps/search/?${params.toString()}`);
}

/** What a place page needs to hand Google Maps the right place. */
export type PlaceMapsTarget = {
  /** The place's own name, as the Tourism Office keeps it. */
  name: string;
  /** The town it is in: Daet, Vinzons, Mercedes… Never assumed to be Daet. */
  municipality?: string | null;
  point?: LatLng | null;
  /** True only when the Tourism Office has confirmed the pin itself. */
  pinConfirmed?: boolean;
};

/**
 * A place's own name, without the aside the office keeps beside it.
 *
 * "Tinaga Island (Calaguas)" is one island with a cross-reference in brackets;
 * Google indexes the name, not the aside, and asking for the whole string is
 * how a search ends up falling back to the whole province.
 */
export function plainPlaceName(name: string): string {
  const bare = name.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return bare || name.trim();
}

/**
 * "Open in Google Maps" for a place — at *that* place, never at a neighbour's.
 *
 * A pin only goes to Google as coordinates when the Tourism Office has
 * confirmed it (owner's note, image-93: the button has to land where the place
 * is). The rest are approximations taken from public sources and can sit a
 * kilometre out; Google Maps drops its pin exactly where it is told, so an
 * unconfirmed pin would send the visitor to the wrong spot. Those are searched
 * for by name in their own town instead, which lands on Google's record of the
 * place itself.
 */
export function placeMapsUrl(place: PlaceMapsTarget): string {
  return mapsPlaceUrl({
    point: place.pinConfirmed ? (place.point ?? null) : null,
    name: plainPlaceName(place.name),
    area: place.municipality?.trim() || null,
  });
}
