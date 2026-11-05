import type { SupabaseClient } from "@supabase/supabase-js";
import { bookablePackages, type BookablePackage } from "@/lib/tours/itinerary/data";
import type { SavedDay } from "@/lib/tours/itinerary/form";

/** A tour the plan passes near, with the plan day to book it for. */
export type DatedPackage = BookablePackage & { date: string | null };

/** The booking form for a tour, opened on a plan day and, when known, for the whole group. */
export function bookHref(packageId: string, date: string | null, pax?: number | null): string {
  const query = new URLSearchParams({ ...(date ? { date } : {}), ...(pax ? { pax: String(pax) } : {}) });
  const qs = query.toString();
  return `/tours/packages/${packageId}/book${qs ? `?${qs}` : ""}`;
}

/** The first day whose stops include a place the tour passes; else the first day. */
export function dayFor(matched: string[], days: Array<{ date: string | null; names: string[] }>): string | null {
  return (days.find((d) => d.names.some((n) => matched.includes(n))) ?? days[0])?.date ?? null;
}

/** Tours near a saved or shared plan's stops, each dated to the day it fits. */
export async function bookableForDays(supabase: SupabaseClient, days: SavedDay[]): Promise<DatedPackage[]> {
  const places = days.flatMap((d) => d.items.flatMap((i) => (i.kind === "visit" && i.lat !== null && i.lng !== null ? [{ name: i.name, lat: i.lat, lng: i.lng }] : [])));
  const packages = await bookablePackages(supabase, places).catch(() => []);
  const named = days.map((d) => ({ date: d.date, names: d.items.map((i) => i.name) }));
  return packages.map((p) => ({ ...p, date: dayFor(p.matched, named) }));
}
