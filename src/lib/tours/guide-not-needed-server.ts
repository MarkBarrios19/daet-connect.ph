import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingGuideNotNeededColumn } from "@/lib/tours/guide-not-needed";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type GuideNotNeeded = { at: string; note: string | null };

/**
 * The guest's "we don't need a guide" requests for these bookings.
 *
 * Asked as its own small read rather than as extra columns on a page's main
 * query: the migration that adds the columns is applied by hand (AGENTS.md), so
 * the code can reach a deployment before the database has them. If the column
 * is missing this returns an empty map — every booking then simply still
 * expects a guide — instead of failing the page that asked.
 */
export async function loadGuideNotNeeded(supabase: Supabase, bookingIds: string[]): Promise<Map<string, GuideNotNeeded>> {
  const ids = [...new Set(bookingIds)].filter(Boolean);
  const found = new Map<string, GuideNotNeeded>();
  if (ids.length === 0) return found;

  const { data, error } = await supabase
    .from("tours_bookings")
    .select("id, guide_not_needed_at, guide_not_needed_note")
    .in("id", ids)
    .not("guide_not_needed_at", "is", null);

  if (error) {
    if (isMissingGuideNotNeededColumn(error)) {
      console.warn("Guide-not-needed: migration 20261201_guide_not_needed.sql has not been applied yet.");
    } else {
      console.error("Guide-not-needed lookup error:", error.message);
    }
    return found;
  }

  for (const row of (data ?? []) as Array<{ id: string; guide_not_needed_at: string | null; guide_not_needed_note: string | null }>) {
    if (row.guide_not_needed_at) {
      found.set(row.id, { at: row.guide_not_needed_at, note: row.guide_not_needed_note ?? null });
    }
  }
  return found;
}

/** One booking's request, or null. */
export async function loadGuideNotNeededFor(supabase: Supabase, bookingId: string): Promise<GuideNotNeeded | null> {
  const flags = await loadGuideNotNeeded(supabase, [bookingId]);
  return flags.get(bookingId) ?? null;
}
