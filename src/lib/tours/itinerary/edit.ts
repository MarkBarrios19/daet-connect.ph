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
