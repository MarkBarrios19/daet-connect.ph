import type { TripContext } from "@/lib/tours/assistant/context";

export type TripAnswers = Pick<TripContext, "dates" | "travelers" | "origin">;

/** Dates, travellers and origin, kept for this tab only so the form isn't asked twice. */
export const TRIP_KEY = "daet-trip-context-v1";

export function loadTrip(): TripAnswers {
  try {
    const raw = window.sessionStorage.getItem(TRIP_KEY);
    const value = raw ? (JSON.parse(raw) as TripAnswers) : {};
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
export function saveTrip(trip: TripAnswers) {
  try {
    window.sessionStorage.setItem(TRIP_KEY, JSON.stringify(trip));
  } catch {
    // Not kept; the form just asks again next time.
  }
}
