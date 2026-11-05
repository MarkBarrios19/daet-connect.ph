"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestPlanChange } from "./actions";
import { gettingThereFrom, type ItineraryResult, type PlanStop } from "@/lib/tours/assistant/plan-tool";
import { prefsToInput } from "@/lib/tours/itinerary/assistant";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { bookablePackages, loadAttractions, type BookablePackage } from "@/lib/tours/itinerary/data";
import { dayOrders, ordersFromRows, planAttractionIds, removeStop, reorderDays, stopChoices, swapStop, type StopChoice } from "@/lib/tours/itinerary/edit";
import { parsePreferences, type PlannerInput } from "@/lib/tours/itinerary/form";
import { generatePlan, withTotals } from "@/lib/tours/itinerary/schedule";
import { PACES, addDays, type Plan, type PlannerAttraction, type Preferences } from "@/lib/tours/itinerary/types";

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

/** The traveller's own order of stops (drag to reorder, or move to another day), re-timed and re-checked. */
export async function reorderPlan(input: PlannerInput, current: Plan, days: string[][]): Promise<PanelResult> {
  const loaded = await load(input);
  if (!loaded.ok) return loaded;
  const clean = Array.isArray(days) ? days.slice(0, 5).map((d) => (Array.isArray(d) ? d.slice(0, 12).map(String) : [])) : [];
  const result = reorderDays(cleanPlan(current), clean, loaded.attractions, loaded.prefs);
  if (!result.ok) return result;
  return finish(result.plan, loaded.attractions, loaded.supabase);
}

/** "Add a stop": the place goes at the end of the day, then the day is re-timed. */
export async function addPlanStop(input: PlannerInput, current: Plan, day: number, attractionId: string): Promise<PanelResult> {
  const plan = cleanPlan(current);
  const orders = dayOrders(plan);
  const d = Number(day);
  if (!Number.isInteger(d) || d < 0 || d >= orders.length) return { ok: false, message: "That day isn't in your plan." };
  orders[d] = [...orders[d], String(attractionId)];
  return reorderPlan(input, plan, orders);
}

/** Up to 8 listed places not yet in the plan that suit the day. */
export async function planStopChoices(input: PlannerInput, current: Plan, day: number): Promise<{ ok: true; choices: StopChoice[] } | { ok: false; message: string }> {
  const loaded = await load(input);
  if (!loaded.ok) return loaded;
  return { ok: true, choices: stopChoices(cleanPlan(current), Number(day), loaded.attractions, loaded.prefs) };
}

/** "What pace do you want?": the plan is drafted again at that pace (it changes how many stops fit a day). */
export async function changePace(input: PlannerInput, pace: string): Promise<PanelResult & { input?: PlannerInput }> {
  if (!PACES.includes(pace as (typeof PACES)[number])) return { ok: false, message: "Pick relaxed, balanced or packed." };
  const next = { ...input, pace };
  const loaded = await load(next);
  if (!loaded.ok) return loaded;
  const result = await finish(generatePlan(loaded.attractions, loaded.prefs), loaded.attractions, loaded.supabase);
  return result.ok ? { ...result, input: next } : result;
}

/**
 * "Change with the assistant" on a saved trip: the saved places, in their saved
 * order, re-timed by the engine and handed to the planner. Owner only.
 */
export async function openSavedInPlanner(id: string): Promise<{ ok: true; itinerary: ItineraryResult } | { ok: false; message: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in to change your trip." };
  const { data } = await supabase
    .from("tours_itineraries")
    .select("start_date, preferences, tours_itinerary_items ( day_number, item_order, item_kind, attraction_id )")
    .eq("id", String(id))
    .eq("tourist_id", user.id)
    .maybeSingle();
  if (!data) return { ok: false, message: "That trip wasn't found." };
  const saved = (data.preferences ?? {}) as Preferences & { travelers?: ItineraryResult["travelers"]; origin?: string };
  if (!saved.startDate || !saved.days) return { ok: false, message: "This trip was saved before the planner could change it. Plan it again in the chat." };
  const input = prefsToInput(saved);
  const loaded = await load(input);
  if (!loaded.ok) return { ok: false, message: "This trip's dates have passed. Plan it again with new dates." };
  const base = withTotals(Array.from({ length: input.days }, (_, i) => ({ date: addDays(input.startDate, i), blocks: [] })));
  const result = reorderDays(base, ordersFromRows(data.tours_itinerary_items ?? [], input.days), loaded.attractions, loaded.prefs);
  if (!result.ok) return { ok: false, message: result.message };
  const done = await finish(result.plan, loaded.attractions, loaded.supabase);
  if (!done.ok) return done;
  const travelers = saved.travelers ?? { adults: Math.max(1, saved.groupSize || 1), children: [] };
  return {
    ok: true,
    itinerary: { plan: done.plan, input, stops: done.stops, packages: done.packages, travelers, gettingThere: await gettingThereFrom({ supabase }, saved.origin), generatedAt: new Date().toISOString() },
  };
}
