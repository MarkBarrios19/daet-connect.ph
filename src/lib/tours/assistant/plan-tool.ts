import { ATTRACTION_CATEGORIES, type AttractionCategory } from "@/lib/tours/attractions";
import { missingInputs, type TripContext } from "@/lib/tours/assistant/context";
import { loadFares, transportCard, type TransportCard } from "@/lib/tours/assistant/guide-tools";
import type { ToolContext } from "@/lib/tours/assistant/tools";
import { faresBetween } from "@/lib/tours/guide/fares";
import { parseTripRequest } from "@/lib/tours/itinerary/assistant";
import { bookablePackages, loadAttractions, type BookablePackage } from "@/lib/tours/itinerary/data";
import { contextToInput } from "@/lib/tours/itinerary/edit";
import { parsePreferences, type PlannerInput } from "@/lib/tours/itinerary/form";
import { generatePlan } from "@/lib/tours/itinerary/schedule";
import { formatClock, type Pace, type Plan } from "@/lib/tours/itinerary/types";

/**
 * plan_trip: the assistant drafts a plan with the rule engine. The model only
 * says what the traveller wants (interests, budget, pace); dates and the group
 * come from the form they filled in, and every stop, time and price comes from
 * the database. The panel is built from `ctx.itinerary`, never from model text.
 */

export const INTEREST_KEYS = Object.keys(ATTRACTION_CATEGORIES) as AttractionCategory[];

export type PlanStop = { id: string; name: string; category: AttractionCategory; lat: number; lng: number; fee: number | null; photoUrl?: string | null; tip?: string | null };

export type ItineraryResult = {
  plan: Plan;
  /** The planner input the plan was built from; panel actions send it back. */
  input: PlannerInput;
  stops: PlanStop[];
  packages: BookablePackage[];
  travelers: NonNullable<TripContext["travelers"]>;
  /** Day 1's "Getting there": listed fares from where they travel from to Daet. Null card when none are listed. */
  gettingThere: { from: string; card: TransportCard | null; checkedOn: string | null } | null;
  generatedAt: string;
  /** How they get around between stops (the planner's chips); travel times stay road estimates. */
  transport?: Transport | null;
};

export const TRANSPORTS = ["motorbike", "car", "tricycle"] as const;
export type Transport = (typeof TRANSPORTS)[number];

/**
 * Where the listed fares start for a traveller's city. Buses to Daet leave
 * from Cubao (in Quezon City) and PITX, which the fares table lists under
 * "Manila", so Quezon City and the other Metro Manila cities start there.
 */
export function fareOrigins(city: string): string[] {
  const c = city.trim().toLowerCase();
  if (/\b(quezon city|qc|cubao)\b/.test(c)) return ["Manila (Cubao)", "Manila"];
  if (/\b(makati|pasay|taguig|bgc|paranaque|parañaque|mandaluyong|pasig|san juan|caloocan|las pinas|las piñas|muntinlupa|marikina|valenzuela|malabon|navotas|pateros|metro manila|ncr)\b/.test(c)) return ["Manila"];
  return [];
}

/** Up to two ways from the traveller's city to Daet, from tours_fares. Never throws: the plan doesn't depend on it. */
export async function gettingThereFrom(ctx: Pick<ToolContext, "supabase">, city: string | null | undefined): Promise<ItineraryResult["gettingThere"]> {
  const from = (city ?? "").trim();
  if (!from) return null;
  try {
    const fares = await loadFares(ctx);
    let routes = faresBetween(fares, from, "Daet").slice(0, 2);
    for (const start of fareOrigins(from)) {
      if (routes.length) break;
      routes = faresBetween(fares, start, "Daet").slice(0, 2);
    }
    const checkedOn = routes.flatMap((r) => r.legs.map((l) => l.checked_on)).sort()[0] ?? null;
    return { from, card: routes.length ? transportCard(`${from} to Daet`, routes) : null, checkedOn };
  } catch {
    return { from, card: null, checkedOn: null };
  }
}

export type PlanWants = { interests: AttractionCategory[] | null; budgetPerDay: number | null; pace: Pace | null };

export async function planTrip(ctx: ToolContext, wants: PlanWants) {
  const missing = missingInputs(ctx.trip, ctx.today);
  if (missing.length || !ctx.trip?.travelers) {
    ctx.questions = missing.length ? missing : ["travelers"];
    return { missing: ctx.questions, note: "The app is showing the tourist a short form for these. Say one sentence asking them to fill it in; do not ask in text." };
  }
  const input = contextToInput(ctx.trip, wants);
  const parsed = input ? parsePreferences(input, ctx.today) : null;
  if (!input || !parsed?.ok) return { error: "The trip details are not valid. Ask the tourist to check their dates." };

  ctx.onStatus?.("Checking places");
  const attractions = await loadAttractions(ctx.supabase);
  if (!attractions.length) return { error: "No places with a map location are listed yet." };
  const plan = generatePlan(attractions, parsed.prefs);
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const visits = plan.days.flatMap((d) => d.blocks.flatMap((b) => (b.kind === "visit" ? [b] : [])));
  const stops: PlanStop[] = [...new Set(visits.map((v) => v.attractionId))].map((id) => {
    const a = byId.get(id)!;
    return { id, name: a.name, category: a.category, lat: a.lat, lng: a.lng, fee: a.fee, photoUrl: a.photoUrl ?? null, tip: a.tip ?? null };
  });

  ctx.onStatus?.("Checking operators");
  const [packages, gettingThere] = await Promise.all([bookablePackages(ctx.supabase, stops).catch(() => []), gettingThereFrom(ctx, ctx.trip.origin?.city)]);
  ctx.itinerary = { plan, input, stops, packages, travelers: ctx.trip.travelers, gettingThere, generatedAt: new Date().toISOString() };

  // What the model gets back to explain: names and times only, from the plan itself.
  return {
    shownToTourist: "The plan is already on screen with times, fees and bookable tours. Explain it briefly; do not repeat every time or price.",
    days: plan.days.map((d, i) => ({
      day: i + 1,
      date: d.date,
      stops: d.blocks.map((b) => (b.kind === "visit" ? `${formatClock(b.start)} ${b.name}${b.hoursConfirmed ? "" : " (hours not confirmed)"}` : `${formatClock(b.start)} lunch`)),
    })),
    emptyDays: plan.days.filter((d) => d.blocks.length === 0).length,
    gettingThere: gettingThere?.card ? `On screen: ${gettingThere.card.options.length} listed way(s) from ${gettingThere.from} to Daet with fares; say they are estimates to confirm with the operator.` : `No fares listed from ${gettingThere?.from ?? "their city"}; most people go through Manila or Naga, then bus or van to Daet.`,
    bookableTours: packages.map((p) => ({ title: p.title, operator: p.operatorName, verifiedByTourismOffice: p.verified, passesNear: p.matched })),
  };
}

/** Basic mode: the same plan from a rule-based reading of the traveller's words. */
export function wantsFromText(text: string, ctx: ToolContext): PlanWants {
  const base = ctx.trip ? contextToInput(ctx.trip, {}) : null;
  if (!base) return { interests: null, budgetPerDay: null, pace: null };
  const read = parseTripRequest(text, ctx.today, base).input;
  return {
    interests: read.interests.filter((i): i is AttractionCategory => INTEREST_KEYS.includes(i as AttractionCategory)),
    budgetPerDay: read.budgetPerDay,
    pace: (["relaxed", "normal", "packed"] as const).find((p) => p === read.pace) ?? null,
  };
}

/** One templated line for basic mode, from the plan's own numbers. */
export function describeItinerary(result: ItineraryResult): string {
  const days = result.plan.days.length;
  const stops = result.plan.totals.visits;
  if (!stops) return "I couldn't fit any places into those days. Try a bigger budget or different dates.";
  const tours = result.packages.length ? ` ${result.packages.length === 1 ? "One tour" : `${result.packages.length} tours`} you can book pass${result.packages.length === 1 ? "es" : ""} near your stops.` : "";
  const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  const perDay = result.plan.days.map((d, i) => {
    const names = d.blocks.filter((b) => b.kind === "visit").map((b) => b.name);
    return `• Day ${i + 1} (${weekday(d.date)}): ${names.length ? names.join(", ") : "free day"}`;
  });
  return [`Here is a ${days}-day plan with ${stops} stop${stops === 1 ? "" : "s"} for your dates.`, ...perDay, `Costs shown are entrance fees for your group.${tours} Tap a stop to swap or remove it.`].join("\n");
}
