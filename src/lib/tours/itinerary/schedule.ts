import type { LatLng } from "@/lib/maps/geo";
import { filterAttractions } from "@/lib/tours/itinerary/filter";
import { scoreAttraction } from "@/lib/tours/itinerary/score";
import {
  addDays,
  DAY_ORIGIN,
  DAY_TRIP_MINUTES,
  dwellFor,
  effectiveHours,
  LUNCH,
  openThroughout,
  PACE_RULES,
  planTotals,
  travelMinutes,
  visitCost,
  type Block,
  type LunchBlock,
  type Plan,
  type PlanDay,
  type PlannerAttraction,
  type Preferences,
} from "@/lib/tours/itinerary/types";

/** Times shown to a traveller start on the 5 minutes (8:15, not 8:11). */
const toFive = (minutes: number) => Math.ceil(minutes / 5) * 5;

const lunchBlock = (start: number): LunchBlock => ({ kind: "lunch", name: "Lunch break", start, end: start + LUNCH.minutes, travelMinutes: 0, cost: 0 });

type DayState = { time: number; position: LatLng; lunchDone: boolean; blocks: Block[]; cost: number };

function tryVisit(attraction: PlannerAttraction, date: string, state: DayState, prefs: Preferences): Block | null {
  const rules = PACE_RULES[prefs.pace];
  const travel = travelMinutes(state.position, attraction);
  const start = toFive(state.time + (state.blocks.length ? rules.bufferMinutes : 0) + travel);
  const end = start + dwellFor(attraction, prefs.pace);
  if (end > prefs.dayEnd) return null;
  const cost = visitCost(attraction, prefs.groupSize);
  if (state.cost + cost > prefs.budgetPerDay * prefs.groupSize) return null;
  // Before lunch, a visit must leave room to start lunch by 12:30 - unless it is a day trip that covers lunch.
  const coversLunch = end - start >= DAY_TRIP_MINUTES && start <= LUNCH.from && end >= LUNCH.until;
  if (!state.lunchDone && end > LUNCH.latestStart && !coversLunch) return null;
  const { hours, confirmed } = effectiveHours(attraction);
  if (!openThroughout(hours, date, start, end)) return null;
  return { kind: "visit", attractionId: attraction.id, name: attraction.name, start, end, travelMinutes: travel, cost, hoursConfirmed: confirmed };
}

function placeLunchIfDue(state: DayState, force: boolean) {
  if (state.lunchDone) return;
  if (state.time >= LUNCH.from || force) {
    const start = toFive(Math.max(state.time, LUNCH.from));
    if (start <= LUNCH.latestStart) {
      const lunch = lunchBlock(start);
      state.blocks.push(lunch);
      state.time = lunch.end;
    }
    state.lunchDone = true;
  }
}

function commit(state: DayState, block: Block, attraction?: PlannerAttraction) {
  state.blocks.push(block);
  state.time = block.end;
  state.cost += block.cost;
  if (attraction) state.position = attraction;
  if (block.kind === "visit" && block.start <= LUNCH.from && block.end >= LUNCH.until) state.lunchDone = true;
}

/** Greedy day builder: always the best-scoring open, reachable, affordable attraction next. */
function buildDay(date: string, pool: PlannerAttraction[], used: Set<string>, prefs: Preferences): PlanDay {
  const state: DayState = { time: prefs.dayStart, position: DAY_ORIGIN, lunchDone: false, blocks: [], cost: 0 };
  const maxVisits = PACE_RULES[prefs.pace].maxVisits;
  let visits = 0;

  while (visits < maxVisits) {
    placeLunchIfDue(state, false);
    const categoriesToday = state.blocks.flatMap((b) => (b.kind === "visit" ? [pool.find((a) => a.id === b.attractionId)!.category] : []));
    let best: { block: Block; attraction: PlannerAttraction; score: number } | null = null;
    for (const attraction of pool) {
      if (used.has(attraction.id)) continue;
      const block = tryVisit(attraction, date, state, prefs);
      if (!block) continue;
      const score = scoreAttraction(attraction, prefs, { categoriesToday, travelMinutes: block.travelMinutes });
      if (!best || score > best.score || (score === best.score && attraction.id < best.attraction.id)) best = { block, attraction, score };
    }
    if (!best) {
      // Nothing fits before lunch: take lunch now and try again after it.
      if (!state.lunchDone && state.time < LUNCH.until) {
        placeLunchIfDue(state, true);
        continue;
      }
      break;
    }
    commit(state, best.block, best.attraction);
    used.add(best.attraction.id);
    visits += 1;
  }
  // A lunch break alone is not a day out.
  return { date, blocks: visits === 0 ? [] : state.blocks };
}

/** `exclude` leaves places out, so Regenerate offers different stops. */
export function generatePlan(attractions: PlannerAttraction[], prefs: Preferences, options: { exclude?: ReadonlySet<string> } = {}): Plan {
  const pool = filterAttractions(attractions, prefs).filter((a) => !options.exclude?.has(a.id));
  const used = new Set<string>();
  const days: PlanDay[] = [];
  for (let i = 0; i < prefs.days; i += 1) days.push(buildDay(addDays(prefs.startDate, i), pool, used, prefs));
  return { days, totals: planTotals(days) };
}

/**
 * Re-times a day for a fixed order of attractions (used after the tourist
 * reorders, removes or adds a stop, and for LLM suggestions). The result may
 * break a rule (e.g. a place closes); validatePlan reports it.
 */
export function scheduleOrder(date: string, ids: string[], byId: Map<string, PlannerAttraction>, prefs: Preferences): PlanDay {
  const state: DayState = { time: prefs.dayStart, position: DAY_ORIGIN, lunchDone: false, blocks: [], cost: 0 };
  const rules = PACE_RULES[prefs.pace];
  for (const id of ids) {
    const attraction = byId.get(id);
    if (!attraction) continue;
    const travel = travelMinutes(state.position, attraction);
    const dwell = dwellFor(attraction, prefs.pace);
    let start = toFive(state.time + (state.blocks.length ? rules.bufferMinutes : 0) + travel);
    const isDayTrip = dwell >= DAY_TRIP_MINUTES && start <= LUNCH.from && start + dwell >= LUNCH.until;
    if (!state.lunchDone && !isDayTrip && start + dwell > LUNCH.latestStart) {
      placeLunchIfDue(state, true);
      start = toFive(state.time + rules.bufferMinutes + travel);
    }
    const { confirmed } = effectiveHours(attraction);
    commit(state, { kind: "visit", attractionId: id, name: attraction.name, start, end: start + dwell, travelMinutes: travel, cost: visitCost(attraction, prefs.groupSize), hoursConfirmed: confirmed }, attraction);
  }
  if (!state.lunchDone && state.blocks.some((b) => b.end > LUNCH.latestStart)) placeLunchIfDue(state, true);
  return { date, blocks: state.blocks };
}

export function withTotals(days: PlanDay[]): Plan {
  return { days, totals: planTotals(days) };
}
