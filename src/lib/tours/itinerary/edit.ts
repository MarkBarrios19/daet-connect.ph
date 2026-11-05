import type { AttractionCategory } from "@/lib/tours/attractions";
import { tripDays, type TripContext } from "@/lib/tours/assistant/context";
import type { PlannerInput } from "@/lib/tours/itinerary/form";
import { filterAttractions } from "@/lib/tours/itinerary/filter";
import { scheduleOrder, withTotals } from "@/lib/tours/itinerary/schedule";
import { scoreAttraction } from "@/lib/tours/itinerary/score";
import { DAY_ORIGIN, travelMinutes, type Pace, type Plan, type PlannerAttraction, type Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";

/** Default daily entrance-fee budget per person when the traveller named none. */
export const DEFAULT_BUDGET_PER_DAY = 500;

/**
 * Planner form input from the assistant's trip context. Dates and the group
 * come from what the traveller filled in, never from the model; interests,
 * budget and pace are read from their words.
 */
export function contextToInput(
  trip: Pick<TripContext, "dates" | "travelers">,
  wants: { interests?: AttractionCategory[] | null; budgetPerDay?: number | null; pace?: Pace | null },
): PlannerInput | null {
  if (!trip.dates || !trip.travelers) return null;
  return {
    startDate: trip.dates.start,
    days: tripDays(trip.dates),
    budgetPerDay: wants.budgetPerDay ?? DEFAULT_BUDGET_PER_DAY,
    interests: wants.interests ?? [],
    pace: wants.pace ?? "normal",
    groupSize: trip.travelers.adults + trip.travelers.children.length,
    dayStart: "08:00",
    dayEnd: "18:00",
  };
}

const visitIdsOf = (plan: Plan, day: number) => plan.days[day]?.blocks.flatMap((b) => (b.kind === "visit" ? [b.attractionId] : [])) ?? [];

/**
 * Replaces one stop with the best-scoring place not already in the plan that
 * still fits the day (hours, budget, end of day). Null when nothing fits.
 */
export function swapStop(plan: Plan, day: number, attractionId: string, attractions: PlannerAttraction[], prefs: Preferences): Plan | null {
  const ids = visitIdsOf(plan, day);
  const at = ids.indexOf(attractionId);
  if (at < 0) return null;
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const used = new Set(plan.days.flatMap((_, d) => visitIdsOf(plan, d)));
  const previous = at > 0 ? byId.get(ids[at - 1]) : null;
  const categoriesToday = ids.filter((id) => id !== attractionId).flatMap((id) => (byId.get(id) ? [byId.get(id)!.category] : []));
  const ranked = filterAttractions(attractions, prefs)
    .filter((a) => !used.has(a.id))
    .map((a) => ({ a, score: scoreAttraction(a, prefs, { categoriesToday, travelMinutes: travelMinutes(previous ?? DAY_ORIGIN, a) }) }))
    .sort((x, y) => y.score - x.score || x.a.id.localeCompare(y.a.id));
  for (const { a } of ranked) {
    const order = ids.map((id, i) => (i === at ? a.id : id));
    const days = plan.days.map((d, i) => (i === day ? scheduleOrder(d.date, order, byId, prefs) : d));
    const next = withTotals(days);
    if (validatePlan(next, byId, prefs).ok) return next;
  }
  return null;
}

/** Removes one stop and re-times the day. */
export function removeStop(plan: Plan, day: number, attractionId: string, attractions: PlannerAttraction[], prefs: Preferences): Plan {
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const order = visitIdsOf(plan, day).filter((id) => id !== attractionId);
  return withTotals(plan.days.map((d, i) => (i === day ? (order.length ? scheduleOrder(d.date, order, byId, prefs) : { date: d.date, blocks: [] }) : d)));
}

/** Every place in the plan, for Regenerate's exclude list. */
export function planAttractionIds(plan: Plan): string[] {
  return plan.days.flatMap((_, d) => visitIdsOf(plan, d));
}

export type ReorderResult = { ok: true; plan: Plan } | { ok: false; message: string };

/**
 * A plan with the traveller's own order of stops (drag to reorder, move to
 * another day, or add a stop). Only the ids are trusted: unknown places are
 * refused, a place may appear once, and each changed day is re-timed by the
 * engine. When the new order breaks a rule (a place is closed then, the day
 * runs late), the first reason comes back instead of a plan.
 */
export function reorderDays(plan: Plan, days: string[][], attractions: PlannerAttraction[], prefs: Preferences): ReorderResult {
  if (!Array.isArray(days) || days.length !== plan.days.length) return { ok: false, message: "That change doesn't match your plan. Please try again." };
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const seen = new Set<string>();
  for (const day of days) {
    if (!Array.isArray(day)) return { ok: false, message: "That change doesn't match your plan. Please try again." };
    for (const id of day) {
      if (typeof id !== "string" || !byId.has(id)) return { ok: false, message: "One of those places is no longer listed. Please plan again." };
      if (seen.has(id)) return { ok: false, message: `${byId.get(id)!.name} is already in your plan.` };
      seen.add(id);
    }
  }
  const next = withTotals(
    plan.days.map((d, i) => {
      const order = days[i];
      const same = order.length === visitIdsOf(plan, i).length && order.every((id, j) => id === visitIdsOf(plan, i)[j]);
      if (same) return d;
      return order.length ? scheduleOrder(d.date, order, byId, prefs) : { date: d.date, blocks: [] };
    }),
  );
  const check = validatePlan(next, byId, prefs);
  if (check.ok) return { ok: true, plan: next };
  const issue = check.issues[0];
  return { ok: false, message: `That order doesn't fit Day ${issue.day + 1}: ${issue.message}` };
}

/** The current order of stops, day by day. */
export function dayOrders(plan: Plan): string[][] {
  return plan.days.map((_, d) => visitIdsOf(plan, d));
}

export type StopChoice = { id: string; name: string; category: AttractionCategory; fee: number | null; photoUrl: string | null };

/** Places not yet in the plan that suit a day, best first, for "Add a stop". */
export function stopChoices(plan: Plan, day: number, attractions: PlannerAttraction[], prefs: Preferences, limit = 8): StopChoice[] {
  const used = new Set(planAttractionIds(plan));
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const ids = visitIdsOf(plan, day);
  const last = ids.length ? byId.get(ids[ids.length - 1]) : null;
  const categoriesToday = ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!.category] : []));
  return attractions
    .filter((a) => !used.has(a.id))
    .map((a) => ({ a, score: scoreAttraction(a, prefs, { categoriesToday, travelMinutes: travelMinutes(last ?? DAY_ORIGIN, a) }) }))
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map(({ a }) => ({ id: a.id, name: a.name, category: a.category, fee: a.fee, photoUrl: a.photoUrl ?? null }));
}
