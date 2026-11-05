"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { aiCallerKey, allowAiCall } from "@/lib/ai/limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ATTRACTION_COLUMNS, toAttraction } from "@/lib/tours/attractions";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { parsePreferences, planToRows, type PlannerInput } from "@/lib/tours/itinerary/form";
import { applyChangeRequest, ASSISTANT_MAX_LENGTH, parseTripRequest, prefsToInput } from "@/lib/tours/itinerary/assistant";
import { changePlanWithLlm, isLlmEnabled, parseTripWithLlm, refineWithLlm } from "@/lib/tours/itinerary/llm";
import { generatePlan, withTotals } from "@/lib/tours/itinerary/schedule";
import { matchPackages, type PackageMatch } from "@/lib/tours/itinerary/suggest";
import { planTotals, type Plan, type PlannerAttraction, type Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan, type PlanIssue } from "@/lib/tours/itinerary/validate";

async function loadAttractions(): Promise<PlannerAttraction[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("is_active", true);
  if (error) throw new Error("Attractions could not be loaded.");
  return (data ?? [])
    .map((row) => toAttraction(row as Record<string, unknown>))
    .filter((a) => a.latitude !== null && a.longitude !== null)
    .map((a) => ({ id: a.id, name: a.name, category: a.category, lat: a.latitude!, lng: a.longitude!, hours: a.opening_hours, dwellMinutes: a.dwell_minutes, fee: a.entrance_fee }));
}

export type GenerateResult =
  | { ok: true; prefs: Preferences; plan: Plan; attractions: PlannerAttraction[]; source: "rules" | "llm"; summary: string | null; tips: Record<string, string>; llmAvailable: boolean }
  | { ok: false; errors: Record<string, string>; message?: string };

export async function generateItinerary(input: PlannerInput, useAi: boolean): Promise<GenerateResult> {
  const parsed = parsePreferences(input, toManilaDateKey(new Date()));
  if (!parsed.ok) return { ok: false, errors: parsed.errors, message: "Please check the highlighted fields." };

  let attractions: PlannerAttraction[];
  try {
    attractions = await loadAttractions();
  } catch {
    return { ok: false, errors: {}, message: "Attractions could not be loaded. Please try again." };
  }
  if (attractions.length === 0) return { ok: false, errors: {}, message: "No attractions with a map location are listed yet." };

  const draft = generatePlan(attractions, parsed.prefs);
  const refined = useAi ? await refineWithLlm(draft, attractions, parsed.prefs) : null;
  return {
    ok: true,
    prefs: parsed.prefs,
    plan: refined?.plan ?? draft,
    attractions,
    source: refined ? "llm" : "rules",
    summary: refined?.summary ?? null,
    tips: refined?.tips ?? {},
    llmAvailable: isLlmEnabled(),
  };
}

export type SaveResult = { ok: true; id: string } | { ok: false; message: string; issues?: PlanIssue[] };

/** Saves after re-validating the (possibly edited) plan against the live dataset. */
export async function saveItinerary(input: { title: string; preferences: PlannerInput; plan: Plan; tips: Record<string, string>; summary: string | null; source: "rules" | "llm" }): Promise<SaveResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in to save your plan." };

  const title = String(input.title ?? "").trim();
  if (title.length < 2 || title.length > 120) return { ok: false, message: "Give your plan a name (2 to 120 characters)." };
  // Same rules as planning (a trip that has already started can't be saved).
  const parsed = parsePreferences(input.preferences, toManilaDateKey(new Date()));
  if (!parsed.ok) return { ok: false, message: "The trip details are no longer valid. Please plan again." };

  const attractions = await loadAttractions().catch(() => null);
  if (!attractions) return { ok: false, message: "Attractions could not be loaded. Please try again." };
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const plan = withTotals(Array.isArray(input.plan?.days) ? input.plan.days : []);
  const check = validatePlan({ ...plan, totals: planTotals(plan.days) }, byId, parsed.prefs);
  if (!check.ok) return { ok: false, message: "The plan has problems. Fix them before saving.", issues: check.issues };

  const tips = Object.fromEntries(Object.entries(input.tips ?? {}).filter(([id, tip]) => byId.has(id) && typeof tip === "string").map(([id, tip]) => [id, tip.slice(0, 240)]));
  const { data: itinerary, error } = await supabase
    .from("tours_itineraries")
    .insert({
      tourist_id: user.id,
      title,
      start_date: parsed.prefs.startDate,
      end_date: plan.days[plan.days.length - 1]?.date ?? parsed.prefs.startDate,
      preferences: parsed.prefs,
      summary: typeof input.summary === "string" ? input.summary.slice(0, 600) : null,
      plan_source: input.source === "llm" ? "llm" : "rules",
      ai_prompt_used: input.source === "llm" ? "Gemini refinement of the rule-based draft (curated attractions only)" : null,
    })
    .select("id")
    .single();
  if (error || !itinerary) {
    console.error("Save itinerary error:", error);
    return { ok: false, message: "The plan could not be saved. Please try again." };
  }

  const rows = planToRows(plan, byId, tips).map((row) => ({ ...row, itinerary_id: itinerary.id }));
  if (rows.length) {
    const { error: itemsError } = await supabase.from("tours_itinerary_items").insert(rows);
    if (itemsError) {
      console.error("Save itinerary items error:", itemsError);
      await supabase.from("tours_itineraries").delete().eq("id", itinerary.id);
      return { ok: false, message: "The plan could not be saved. Please try again." };
    }
  }
  revalidatePath("/tours/my-itineraries");
  return { ok: true, id: itinerary.id };
}

/** Published packages whose stops pass near the planned places. */
export async function suggestPackages(places: Array<{ name: string; lat: number; lng: number }>): Promise<PackageMatch[]> {
  const clean = (Array.isArray(places) ? places : [])
    .filter((p) => p && typeof p.name === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .slice(0, 40);
  if (clean.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tours_packages")
    .select("id, title, cover_image_url, tours_package_stops ( location_name, latitude, longitude )")
    .eq("status", "published")
    .limit(200);
  const packages = (data ?? []).map((pkg) => ({
    id: pkg.id,
    title: pkg.title,
    coverImageUrl: pkg.cover_image_url,
    stops: (pkg.tours_package_stops ?? [])
      .map((s: { location_name: string; latitude: unknown; longitude: unknown }) => ({ name: s.location_name, lat: Number(s.latitude), lng: Number(s.longitude) }))
      .filter((s: { lat: number; lng: number }) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.lat !== 0),
  }));
  return matchPackages(clean, packages);
}

// ------------------------------------------------------------------ trip assistant

/** Up to 20 AI requests per person (or connection) per 10 minutes; past that the rules answer. */
async function allowAi(): Promise<boolean> {
  if (!isLlmEnabled()) return false;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return allowAiCall("planner", aiCallerKey(user?.id, (await headers()).get("x-forwarded-for")));
}

const cleanText = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

export type InterpretResult = { ok: true; input: PlannerInput; understood: string[]; source: "llm" | "rules" } | { ok: false; message: string };

/** "Describe your trip": fills the form from plain words. */
export async function interpretTripRequest(text: string, current: PlannerInput): Promise<InterpretResult> {
  const request = cleanText(text);
  if (request.length < 3) return { ok: false, message: "Tell us a bit about your trip first." };
  if (request.length > ASSISTANT_MAX_LENGTH) return { ok: false, message: `Keep it under ${ASSISTANT_MAX_LENGTH} characters.` };
  const today = toManilaDateKey(new Date());
  const fromLlm = (await allowAi()) ? await parseTripWithLlm(request, today, current) : null;
  const result = fromLlm ?? parseTripRequest(request, today, current);
  if (result.understood.length === 0) {
    return { ok: false, message: 'I couldn\'t pick out trip details. Try something like "2 days next weekend for 4 people, beaches and food".' };
  }
  return { ok: true, input: result.input, understood: result.understood, source: fromLlm ? "llm" : "rules" };
}

export type ChangeResult =
  | { ok: true; plan: Plan; input: PlannerInput; prefs: Preferences; reply: string; changed: boolean; tips: Record<string, string>; source: "llm" | "rules" }
  | { ok: false; message: string };

/** "Ask the assistant": edits the plan. The result is re-validated against the live attraction list. */
export async function requestPlanChange(text: string, planInput: Plan, preferences: PlannerInput, tips: Record<string, string>): Promise<ChangeResult> {
  const request = cleanText(text);
  if (request.length < 2) return { ok: false, message: "Tell the assistant what to change." };
  if (request.length > ASSISTANT_MAX_LENGTH) return { ok: false, message: `Keep it under ${ASSISTANT_MAX_LENGTH} characters.` };
  const parsed = parsePreferences(preferences, toManilaDateKey(new Date()));
  if (!parsed.ok) return { ok: false, message: "The trip details are no longer valid. Please plan again." };

  let attractions: PlannerAttraction[];
  try {
    attractions = await loadAttractions();
  } catch {
    return { ok: false, message: "Attractions could not be loaded. Please try again." };
  }
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const plan = withTotals(Array.isArray(planInput?.days) ? planInput.days : []);
  if (plan.days.length !== parsed.prefs.days) return { ok: false, message: "This plan doesn't match the trip details. Please plan again." };

  const keepTips = (planned: Plan, extra: Record<string, string> = {}) => {
    const ids = new Set(planned.days.flatMap((d) => d.blocks.flatMap((b) => (b.kind === "visit" ? [b.attractionId] : []))));
    return Object.fromEntries(Object.entries({ ...(tips ?? {}), ...extra }).filter(([id, tip]) => ids.has(id) && typeof tip === "string").map(([id, tip]) => [id, tip.slice(0, 240)]));
  };

  const fromLlm = (await allowAi()) ? await changePlanWithLlm(request, plan, attractions, parsed.prefs) : null;
  if (fromLlm && validatePlan(fromLlm.refined.plan, byId, fromLlm.prefs).ok) {
    return { ok: true, plan: fromLlm.refined.plan, prefs: fromLlm.prefs, input: prefsToInput(fromLlm.prefs), reply: fromLlm.reply, changed: true, tips: keepTips(fromLlm.refined.plan, fromLlm.refined.tips), source: "llm" };
  }
  const result = applyChangeRequest(request, plan, attractions, parsed.prefs);
  return { ok: true, plan: result.plan, prefs: result.prefs, input: prefsToInput(result.prefs), reply: result.reply, changed: result.changed, tips: keepTips(result.plan), source: "rules" };
}
