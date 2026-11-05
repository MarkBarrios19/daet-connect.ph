"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestPlanChange } from "./actions";
import type { PlanStop } from "@/lib/tours/assistant/plan-tool";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { bookablePackages, loadAttractions, type BookablePackage } from "@/lib/tours/itinerary/data";
import { planAttractionIds, removeStop, swapStop } from "@/lib/tours/itinerary/edit";
import { parsePreferences, type PlannerInput } from "@/lib/tours/itinerary/form";
import { generatePlan, withTotals } from "@/lib/tours/itinerary/schedule";
import type { Plan, PlannerAttraction } from "@/lib/tours/itinerary/types";

/**
 * Plan panel actions (Regenerate, Swap, Remove). Everything is rebuilt from the
 * live attraction list and the trip input; the browser's plan is only used for
 * which stops it has, and every result is a plan the rule engine produced.
 */

export type PanelResult = { ok: true; plan: Plan; stops: PlanStop[]; packages: BookablePackage[] } | { ok: false; message: string };

async function load(input: PlannerInput) {
  const prefs = parsePreferences(input, toManilaDateKey(new Date()));
  if (!prefs.ok) return { ok: false as const, message: "The trip details are no longer valid. Please plan again." };
  const supabase = await createSupabaseServerClient();
  const attractions = await loadAttractions(supabase).catch(() => null);
  if (!attractions?.length) return { ok: false as const, message: "Places could not be loaded. Please try again." };
  return { ok: true as const, prefs: prefs.prefs, attractions, supabase };
}

async function finish(plan: Plan, attractions: PlannerAttraction[], supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<PanelResult> {
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const stops = planAttractionIds(plan).flatMap((id) => {
    const a = byId.get(id);
    return a ? [{ id, name: a.name, category: a.category, lat: a.lat, lng: a.lng, fee: a.fee, photoUrl: a.photoUrl ?? null, tip: a.tip ?? null }] : [];
  });
  const packages = await bookablePackages(supabase, stops).catch(() => []);
  return { ok: true, plan, stops, packages };
}

/** The browser's plan, re-checked: only the days and stop ids are trusted. */
const cleanPlan = (plan: Plan | null | undefined) => withTotals(Array.isArray(plan?.days) ? plan.days.slice(0, 5) : []);

export async function regeneratePlan(input: PlannerInput, current: Plan): Promise<PanelResult> {
  const loaded = await load(input);
  if (!loaded.ok) return loaded;
  const exclude = new Set(planAttractionIds(cleanPlan(current)));
  let plan = generatePlan(loaded.attractions, loaded.prefs, { exclude });
  // Too few other places: mix the old ones back in rather than show empty days.
  if (plan.totals.visits === 0) plan = generatePlan(loaded.attractions, loaded.prefs);
  return finish(plan, loaded.attractions, loaded.supabase);
}

export async function swapPlanStop(input: PlannerInput, current: Plan, day: number, attractionId: string): Promise<PanelResult> {
  const loaded = await load(input);
  if (!loaded.ok) return loaded;
  const plan = swapStop(cleanPlan(current), Number(day), String(attractionId), loaded.attractions, loaded.prefs);
  if (!plan) return { ok: false, message: "No other place fits that time. Try removing it instead." };
  return finish(plan, loaded.attractions, loaded.supabase);
}

export async function removePlanStop(input: PlannerInput, current: Plan, day: number, attractionId: string): Promise<PanelResult> {
  const loaded = await load(input);
  if (!loaded.ok) return loaded;
  return finish(removeStop(cleanPlan(current), Number(day), String(attractionId), loaded.attractions, loaded.prefs), loaded.attractions, loaded.supabase);
}

/** "Make it more relaxed", "Add more food stops": the planner's own change rules, then fresh stops and tours. */
export async function changePlan(input: PlannerInput, current: Plan, text: string): Promise<PanelResult & { reply?: string; input?: PlannerInput }> {
  const changed = await requestPlanChange(String(text ?? ""), cleanPlan(current), input, {});
  if (!changed.ok) return { ok: false, message: changed.message };
  const loaded = await load(changed.input);
  if (!loaded.ok) return loaded;
  const result = await finish(changed.plan, loaded.attractions, loaded.supabase);
  return result.ok ? { ...result, reply: changed.reply, input: changed.input } : result;
}
