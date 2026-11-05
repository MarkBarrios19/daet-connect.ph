import { estimateLeg, type LatLng } from "@/lib/maps/geo";
import type { AttractionCategory } from "@/lib/tours/attractions";
import { isOpenAt, type OpeningHours } from "@/lib/tours/opening-hours";

/**
 * Shared types and rules for the rule-based itinerary planner (F7a).
 * Times are minutes after midnight, Manila time; dates are YYYY-MM-DD.
 */

export type PlannerAttraction = {
  id: string;
  name: string;
  category: AttractionCategory;
  lat: number;
  lng: number;
  hours: OpeningHours | null;
  dwellMinutes: number | null;
  fee: number | null;
  /** For the plan's stop cards; optional so older saved plans still load. */
  photoUrl?: string | null;
  /** One line from the listing's description. */
  tip?: string | null;
};

export const PACES = ["relaxed", "normal", "packed"] as const;
export type Pace = (typeof PACES)[number];

export type Preferences = {
  startDate: string;
  days: number;
  /** Per person per day, in pesos (entrance fees). */
  budgetPerDay: number;
  interests: AttractionCategory[];
  pace: Pace;
  groupSize: number;
  dayStart: number;
  dayEnd: number;
};

export type VisitBlock = {
  kind: "visit";
  attractionId: string;
  name: string;
  start: number;
  end: number;
  travelMinutes: number;
  cost: number;
  /** False when the attraction has no listed hours and default hours were assumed. */
  hoursConfirmed: boolean;
};

export type LunchBlock = { kind: "lunch"; name: string; start: number; end: number; travelMinutes: 0; cost: 0 };

export type Block = VisitBlock | LunchBlock;
export type PlanDay = { date: string; blocks: Block[] };
export type Plan = { days: PlanDay[]; totals: { cost: number; travelMinutes: number; visits: number } };

export const MAX_DAYS = 5;
export const MAX_GROUP = 30;
export const LUNCH = { from: 11 * 60 + 30, latestStart: 12 * 60 + 30, until: 13 * 60 + 30, minutes: 60 };
/** Visits at least this long are day trips that include lunch. */
export const DAY_TRIP_MINUTES = 240;
/** Assumed when an attraction lists no hours (flagged as unconfirmed). */
export const DEFAULT_HOURS: OpeningHours = Object.fromEntries(
  (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).map((day) => [day, [["08:00", "17:00"]]]),
) as OpeningHours;
/** Where each day starts: Daet town centre (Rizal Park). */
export const DAY_ORIGIN: LatLng = { lat: 14.1131, lng: 122.9545 };

export const PACE_RULES: Record<Pace, { dwellFactor: number; maxVisits: number; bufferMinutes: number }> = {
  relaxed: { dwellFactor: 1.25, maxVisits: 3, bufferMinutes: 20 },
  normal: { dwellFactor: 1, maxVisits: 5, bufferMinutes: 10 },
  packed: { dwellFactor: 0.8, maxVisits: 7, bufferMinutes: 5 },
};

export function effectiveHours(attraction: PlannerAttraction): { hours: OpeningHours; confirmed: boolean } {
  return attraction.hours ? { hours: attraction.hours, confirmed: true } : { hours: DEFAULT_HOURS, confirmed: false };
}

export function dwellFor(attraction: PlannerAttraction, pace: Pace): number {
  const base = attraction.dwellMinutes ?? 60;
  return Math.max(15, Math.round((base * PACE_RULES[pace].dwellFactor) / 5) * 5);
}

/** Travel time in whole minutes (estimate; the same function is used to build and to check plans). */
export function travelMinutes(from: LatLng, to: LatLng): number {
  return Math.ceil(estimateLeg(from, to).durationS / 60);
}

export function visitCost(attraction: PlannerAttraction, groupSize: number): number {
  return Math.round((attraction.fee ?? 0) * groupSize * 100) / 100;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

function instant(date: string, minutes: number): Date {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return new Date(`${date}T${h}:${m}:00+08:00`);
}

/** Open for the whole visit (checked every 15 minutes and at the last minute). */
export function openThroughout(hours: OpeningHours, date: string, start: number, end: number): boolean {
  if (end <= start || end > 24 * 60) return false;
  for (let t = start; t < end; t += 15) if (!isOpenAt(hours, instant(date, t))) return false;
  return isOpenAt(hours, instant(date, end - 1)) === true;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 || h === 24 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function planTotals(days: PlanDay[]): Plan["totals"] {
  let cost = 0;
  let travel = 0;
  let visits = 0;
  for (const day of days) {
    for (const block of day.blocks) {
      cost += block.cost;
      travel += block.travelMinutes;
      if (block.kind === "visit") visits += 1;
    }
  }
  return { cost: Math.round(cost * 100) / 100, travelMinutes: travel, visits };
}
