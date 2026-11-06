import type { TripContext } from "@/lib/tours/assistant/context";
import { toManilaDateKey } from "@/lib/tours/events-calendar";

export type TripAnswers = Pick<TripContext, "dates" | "travelers" | "origin">;

/**
 * Dates, travellers and origin, kept on this phone so the form isn't asked
 * again when the visitor comes back on the trip day (decision 34). It stays on
 * the device; dates that have passed are dropped.
 */
export const TRIP_KEY = "daet-trip-context-v1";

function read(store: Storage): TripAnswers | null {
  const raw = store.getItem(TRIP_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as TripAnswers;
  return value && typeof value === "object" ? value : null;
}

export function loadTrip(today: string = toManilaDateKey(new Date())): TripAnswers {
  try {
    // Older visits kept it for the tab only; carry that over once.
    let trip = read(window.localStorage);
    if (!trip) {
      trip = read(window.sessionStorage);
      if (trip) window.localStorage.setItem(TRIP_KEY, JSON.stringify(trip));
    }
    if (!trip) return {};
    if (trip.dates && trip.dates.end < today) {
      const { dates: _past, ...rest } = trip;
      window.localStorage.setItem(TRIP_KEY, JSON.stringify(rest));
      return rest;
    }
    return trip;
  } catch {
    return {};
  }
}

export function saveTrip(trip: TripAnswers) {
  try {
    window.localStorage.setItem(TRIP_KEY, JSON.stringify(trip));
  } catch {
    // Not kept; the form just asks again next time.
  }
}
