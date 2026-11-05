import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTRACTION_COLUMNS, toAttraction } from "@/lib/tours/attractions";
import { matchPackages, type PackageCandidate } from "@/lib/tours/itinerary/suggest";
import type { PlannerAttraction } from "@/lib/tours/itinerary/types";
import { fromPrice } from "@/lib/tours/trip-board";

/**
 * Data the planner reads: active attractions with a map position, and
 * published packages whose stops pass near the planned places. Shared by the
 * /tours/plan server actions and the assistant's plan_trip tool, so both
 * plan from the same rows.
 */

export async function loadAttractions(supabase: SupabaseClient): Promise<PlannerAttraction[]> {
  const { data, error } = await supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("is_active", true);
  if (error) throw new Error("Attractions could not be loaded.");
  return (data ?? [])
    .map((row) => toAttraction(row as Record<string, unknown>))
    .filter((a) => a.latitude !== null && a.longitude !== null)
    .map((a) => ({ id: a.id, name: a.name, category: a.category, lat: a.latitude!, lng: a.longitude!, hours: a.opening_hours, dwellMinutes: a.dwell_minutes, fee: a.entrance_fee }));
}

/** A package the plan passes near, with what the Bookable card shows. Prices come from the database only. */
export type BookablePackage = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  matched: string[];
  price: { amount: number; perPerson: boolean } | null;
  operatorName: string | null;
  /** The operator is accredited by the Tourism Office. */
  verified: boolean;
  notIncluded: string[];
};

type PackageRow = {
  id: string;
  title: string;
  cover_image_url: string | null;
  tours_package_stops: Array<{ location_name: string; latitude: unknown; longitude: unknown }> | null;
  tours_package_price_variants: Array<{ price_per_pax: number | null; flat_price: number | null; is_default?: boolean | null }> | null;
  tours_package_inclusions: Array<{ item_text: string; is_included: boolean }> | null;
  tours_operators: { business_name: string; accreditation_status: string | null } | Array<{ business_name: string; accreditation_status: string | null }> | null;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

export async function loadPackageCandidates(supabase: SupabaseClient): Promise<Array<PackageCandidate & Omit<BookablePackage, "matched" | "coverImageUrl" | "title" | "id">>> {
  const { data } = await supabase
    .from("tours_packages")
    .select(
      "id, title, cover_image_url, tours_package_stops ( location_name, latitude, longitude ), tours_package_price_variants ( price_per_pax, flat_price, is_default ), tours_package_inclusions ( item_text, is_included ), tours_operators ( business_name, accreditation_status )",
    )
    .eq("status", "published")
    .limit(200);
  return ((data ?? []) as unknown as PackageRow[]).map((pkg) => {
    const operator = one(pkg.tours_operators);
    return {
      id: pkg.id,
      title: pkg.title,
      coverImageUrl: pkg.cover_image_url,
      stops: (pkg.tours_package_stops ?? [])
        .map((s) => ({ name: s.location_name, lat: Number(s.latitude), lng: Number(s.longitude) }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.lat !== 0),
      price: fromPrice(pkg.tours_package_price_variants),
      operatorName: operator?.business_name ?? null,
      verified: operator?.accreditation_status === "approved",
      notIncluded: (pkg.tours_package_inclusions ?? []).filter((i) => !i.is_included).map((i) => i.item_text).slice(0, 5),
    };
  });
}

/** Packages near the planned places, best match first, with their Bookable details. */
export async function bookablePackages(supabase: SupabaseClient, places: Array<{ name: string; lat: number; lng: number }>, limit = 3): Promise<BookablePackage[]> {
  if (!places.length) return [];
  const candidates = await loadPackageCandidates(supabase);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return matchPackages(places, candidates, limit).map((match) => {
    const extra = byId.get(match.id)!;
    return { ...match, price: extra.price, operatorName: extra.operatorName, verified: extra.verified, notIncluded: extra.notIncluded };
  });
}
