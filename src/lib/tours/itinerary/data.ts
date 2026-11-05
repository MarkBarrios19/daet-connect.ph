import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTRACTION_COLUMNS, toAttraction } from "@/lib/tours/attractions";
import { matchPackages, type PackageCandidate } from "@/lib/tours/itinerary/suggest";
import type { PlannerAttraction } from "@/lib/tours/itinerary/types";
import { fromPrice } from "@/lib/tours/trip-board";
import { durationText } from "@/lib/tours/duration";

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
    .map((a) => ({ id: a.id, name: a.name, category: a.category, lat: a.latitude!, lng: a.longitude!, hours: a.opening_hours, dwellMinutes: a.dwell_minutes, fee: a.entrance_fee, photoUrl: a.photo_url ?? null, tip: firstSentence(a.description) }));
}

/** The first sentence of a listing's description, at most 140 characters, for a stop card. */
export function firstSentence(text: string | null | undefined): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const sentence = /^.+?[.!?](?=\s|$)/.exec(clean)?.[0] ?? clean;
  if (sentence.length <= 140) return sentence;
  const cut = sentence.slice(0, 139);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : 139)}…`;
}

/** A package the plan passes near, with what the Bookable card shows. Prices come from the database only. */
export type BookablePackage = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  matched: string[];
  price: { amount: number; perPerson: boolean } | null;
  operatorName: string | null;
  /** For "Call operator"; null when the operator listed none. */
  operatorPhone?: string | null;
  /** "11 hours", "1 day"; null when not listed. */
  duration?: string | null;
  /** The operator is accredited by the Tourism Office. */
  verified: boolean;
  notIncluded: string[];
};

type PackageRow = {
  id: string;
  title: string;
  cover_image_url: string | null;
  duration_value?: number | null;
  duration_type?: string | null;
  tours_package_stops: Array<{ location_name: string; latitude: unknown; longitude: unknown }> | null;
  tours_package_price_variants: Array<{ price_per_pax: number | null; flat_price: number | null; is_default?: boolean | null }> | null;
  tours_package_inclusions: Array<{ item_text: string; is_included: boolean }> | null;
  tours_operators: OperatorRow | OperatorRow[] | null;
};

type OperatorRow = { business_name: string; accreditation_status: string | null; contact_phone?: string | null };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

export async function loadPackageCandidates(supabase: SupabaseClient): Promise<Array<PackageCandidate & Omit<BookablePackage, "matched" | "coverImageUrl" | "title" | "id">>> {
  const { data } = await supabase
    .from("tours_packages")
    .select(
      "id, title, cover_image_url, duration_value, duration_type, tours_package_stops ( location_name, latitude, longitude ), tours_package_price_variants ( price_per_pax, flat_price, is_default ), tours_package_inclusions ( item_text, is_included ), tours_operators ( business_name, accreditation_status, contact_phone )",
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
      operatorPhone: operator?.contact_phone?.trim() || null,
      duration: durationText(pkg.duration_value ?? null, pkg.duration_type ?? null),
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
    return { ...match, price: extra.price, operatorName: extra.operatorName, operatorPhone: extra.operatorPhone, duration: extra.duration, verified: extra.verified, notIncluded: extra.notIncluded };
  });
}
