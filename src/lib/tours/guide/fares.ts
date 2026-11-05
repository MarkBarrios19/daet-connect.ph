import { normalizeText } from "@/lib/tours/itinerary/assistant";

/** Fares and travel times between places (tours_fares), curated by the Tourism Office. */

export const FARE_MODES = {
  bus: "Bus",
  van: "Van (UV Express)",
  jeepney: "Jeepney",
  tricycle: "Tricycle",
  boat: "Boat",
  habal_habal: "Habal-habal",
  taxi: "Taxi",
  plane: "Plane",
} as const;
export type FareMode = keyof typeof FARE_MODES;
export const FARE_PER = { person: "per person", trip: "per trip", boat: "per boat" } as const;
export type FarePer = keyof typeof FARE_PER;

export function isFareMode(value: unknown): value is FareMode {
  return typeof value === "string" && value in FARE_MODES;
}

export type Fare = {
  id: string;
  mode: FareMode;
  from_name: string;
  to_name: string;
  board_place_id: string | null;
  fare_min: number | null;
  fare_max: number | null;
  fare_per: FarePer;
  minutes_min: number | null;
  minutes_max: number | null;
  schedule_note: string | null;
  source: string;
  checked_on: string;
  verified: boolean;
  is_active: boolean;
};

export const FARE_COLUMNS =
  "id,mode,from_name,to_name,board_place_id,fare_min,fare_max,fare_per,minutes_min,minutes_max,schedule_note,source,checked_on,verified,is_active";

const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));

export function toFare(row: Record<string, unknown>): Fare {
  return {
    ...(row as unknown as Fare),
    fare_min: num(row.fare_min),
    fare_max: num(row.fare_max),
    minutes_min: num(row.minutes_min),
    minutes_max: num(row.minutes_max),
  };
}

const words = (value: string) =>
  normalizeText(value)
    .replace(/[()[\]:.,;!?/-]/g, " ")
    .replace(/\b(port|town|center|centre|city|terminal|island|islands|isla|the|sa|ng)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Does what the traveller typed name this place? "manila" matches "Manila (PITX)"; "daet town" matches "Daet town center". */
export function namesMatch(query: string, name: string): boolean {
  const q = words(query);
  const n = words(name);
  if (!q || !n) return false;
  return ` ${n} `.includes(` ${q} `) || ` ${q} `.includes(` ${n} `);
}

export type FareLeg = Fare & { reversed: boolean };
export type FareRoute = {
  legs: FareLeg[];
  minutesMin: number | null;
  minutesMax: number | null;
  /** False when some leg has no listed time: the totals then count only the legs that do ("at least"). */
  timeComplete: boolean;
  /** What one traveller pays across the per-person legs; null when one of them has no listed fare. */
  perPersonMin: number | null;
  perPersonMax: number | null;
  /** True when a per-person leg only has a lowest price ("from ₱1,088"), so the total is a floor too. */
  perPersonFromOnly: boolean;
  /** Legs paid for the whole boat or vehicle (a hired banca, a special trip): shared by the group. */
  sharedLegs: FareLeg[];
};

const sumOrNull = (values: Array<number | null>) => (values.some((v) => v === null) ? null : values.reduce<number>((a, b) => a + (b as number), 0));
const sumKnown = (values: Array<number | null>) => (values.every((v) => v === null) ? null : values.reduce<number>((a, b) => a + (b ?? 0), 0));

function routeOf(legs: FareLeg[]): FareRoute {
  const perPerson = legs.filter((l) => l.fare_per === "person");
  return {
    legs,
    minutesMin: sumKnown(legs.map((l) => l.minutes_min ?? l.minutes_max)),
    minutesMax: sumKnown(legs.map((l) => l.minutes_max ?? l.minutes_min)),
    timeComplete: legs.every((l) => l.minutes_min !== null || l.minutes_max !== null),
    perPersonMin: sumOrNull(perPerson.map((l) => l.fare_min ?? l.fare_max)),
    perPersonMax: sumOrNull(perPerson.map((l) => l.fare_max ?? l.fare_min)),
    perPersonFromOnly: perPerson.some((l) => l.fare_min !== null && l.fare_max === null),
    sharedLegs: legs.filter((l) => l.fare_per !== "person"),
  };
}

/** The town a stop is in: "Manila (PITX)" and "Manila (NAIA)" are both Manila, "Naga Airport (Pili)" is Naga. */
export function cityOf(name: string): string {
  return words(name.split("(")[0]).replace(/\b(airport|integrated|central|westbound)\b/g, " ").replace(/\s+/g, " ").trim().split(" ")[0] ?? "";
}

/** A trip of more legs than this is not something to suggest to a visitor. */
const MAX_LEGS = 4;
const MAX_ROUTES = 6;
/** Each change of vehicle costs waiting time; this keeps one long direct bus ahead of three short hops. */
const TRANSFER_PENALTY_MIN = 60;

/** A leg with no listed time is counted as this long, so it can't make a route look fastest. */
const UNKNOWN_LEG_MIN = 60;

const score = (route: FareRoute) =>
  (route.minutesMin ?? 0) +
  route.legs.filter((l) => l.minutes_min === null && l.minutes_max === null).length * UNKNOWN_LEG_MIN +
  (route.legs.length - 1) * TRANSFER_PENALTY_MIN;

/**
 * Ways to get from one place to another, chaining up to four rides: either
 * direction of a listed ride counts (a ride back costs the same), and a stop
 * named in one ride joins the next ride that starts there (Cebu → Manila
 * (NAIA) → Manila (PITX) → Daet → Bagasbas). Fastest first, counting an hour
 * for each change, and only one route per sequence of ways to travel, so the
 * list shows real alternatives (bus; plane then van; plane then bus).
 */
export function faresBetween(fares: Fare[], from: string | null, to: string): FareRoute[] {
  const active = fares.filter((f) => f.is_active);
  const legsFrom = (place: string): FareLeg[] => [
    ...active.filter((f) => namesMatch(place, f.from_name)).map((f) => ({ ...f, reversed: false })),
    ...active.filter((f) => namesMatch(place, f.to_name)).map((f) => ({ ...f, from_name: f.to_name, to_name: f.from_name, reversed: true })),
  ];

  if (!from) {
    // "How do I get to Calaguas?": every direct way in, by starting point.
    return active.filter((f) => namesMatch(to, f.to_name)).map((f) => routeOf([{ ...f, reversed: false }]));
  }

  const found: FareRoute[] = [];
  const walk = (place: string, path: FareLeg[], cities: string[]) => {
    if (path.length >= MAX_LEGS) return;
    const here = cityOf(place);
    const lastWasTransfer = path.length > 0 && cityOf(path[path.length - 1].from_name) === here;
    for (const leg of legsFrom(place)) {
      if (path.some((p) => p.id === leg.id)) continue;
      const there = cityOf(leg.to_name);
      // One change of terminal inside a city (NAIA → PITX) is a transfer; going
      // back to a city already left is a detour (Manila → Naga → Manila).
      if (there === here ? lastWasTransfer : cities.includes(there)) continue;
      // Someone starting "in Manila" goes straight to the terminal they need.
      if (path.length === 0 && there === here && cityOf(from) === here) continue;
      const next = [...path, leg];
      if (namesMatch(to, leg.to_name)) {
        found.push(routeOf(next));
        continue;
      }
      walk(leg.to_name, next, [...cities, there]);
    }
  };
  walk(from, [], [cityOf(from)]);

  const ranked = found.sort((a, b) => score(a) - score(b) || a.legs.length - b.legs.length);
  // Nothing that takes more than about twice as long as the best way.
  const limit = ranked.length ? score(ranked[0]) * 2 + 120 : 0;
  const best = new Map<string, FareRoute>();
  for (const route of ranked.filter((r) => score(r) <= limit)) {
    // One route per way of travelling, told apart by where the first ride boards (Cubao or PITX).
    const key = `${route.legs[0].from_name}|${route.legs.map((l) => l.mode).join(">")}`;
    if (!best.has(key)) best.set(key, route);
  }
  return [...best.values()].slice(0, MAX_ROUTES);
}

export function fareLabel(fare: Pick<Fare, "fare_min" | "fare_max" | "fare_per">, format: (n: number) => string): string | null {
  const { fare_min: lo, fare_max: hi } = fare;
  if (lo === null && hi === null) return null;
  const per = ` ${FARE_PER[fare.fare_per]}`;
  if (lo !== null && hi !== null && lo !== hi) return `${format(lo)}–${format(hi)}${per}`;
  // Only a lowest price is known (an airfare seen on a fare site): say so.
  if (lo !== null && hi === null) return `from ${format(lo)}${per}`;
  return `${format((lo ?? hi) as number)}${per}`;
}

export function minutesLabel(min: number | null, max: number | null): string | null {
  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min !== max) {
    if (min >= 60 && max >= 60 && min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} h`;
    return `${fmt(min)} to ${fmt(max)}`;
  }
  return fmt((min ?? max) as number);
}

// ---- admin form and CSV import ----

export type FareInput = Omit<Fare, "id" | "board_place_id">;
export type RawFare = Partial<Record<"mode" | "fromName" | "toName" | "fareMin" | "fareMax" | "farePer" | "minutesMin" | "minutesMax" | "scheduleNote" | "source" | "checkedOn", string>> & {
  verified?: boolean;
  isActive?: boolean;
};

export function validateFare(raw: RawFare, today: string): { ok: true; data: FareInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const text = (value: string | undefined) => (value ?? "").trim();
  const mode = text(raw.mode);
  if (!isFareMode(mode)) errors.mode = "Choose how people travel.";
  const fromName = text(raw.fromName);
  const toName = text(raw.toName);
  if (fromName.length < 2 || fromName.length > 80) errors.fromName = "Enter where the ride starts (2 to 80 characters).";
  if (toName.length < 2 || toName.length > 80) errors.toName = "Enter where it ends (2 to 80 characters).";

  const amount = (value: string | undefined, field: string) => {
    const v = text(value).replace(/^₱/, "").replace(/,/g, "");
    if (!v) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(v)) {
      errors[field] = "Enter pesos, e.g. 30.";
      return null;
    }
    return Number(v);
  };
  const minutes = (value: string | undefined, field: string) => {
    const v = text(value);
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 2000) {
      errors[field] = "Enter whole minutes, e.g. 45.";
      return null;
    }
    return n;
  };
  const fareMin = amount(raw.fareMin, "fareMin");
  const fareMax = amount(raw.fareMax, "fareMax") ?? fareMin;
  if (fareMin !== null && fareMax !== null && fareMin > fareMax) errors.fareMax = "The highest fare must not be below the lowest.";
  const farePer = text(raw.farePer) || "person";
  if (!(farePer in FARE_PER)) errors.farePer = "Choose per person, per trip or per boat.";
  const minutesMin = minutes(raw.minutesMin, "minutesMin");
  const minutesMax = minutes(raw.minutesMax, "minutesMax") ?? minutesMin;
  if (minutesMin !== null && minutesMax !== null && minutesMin > minutesMax) errors.minutesMax = "The longest time must not be below the shortest.";
  const scheduleNote = text(raw.scheduleNote) || null;
  if (scheduleNote && scheduleNote.length > 300) errors.scheduleNote = "Keep this under 300 characters.";
  const source = text(raw.source);
  if (source.length < 3 || source.length > 500) errors.source = "Say where this information comes from.";
  const checkedOn = text(raw.checkedOn) || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) errors.checkedOn = "Use a date like 2026-10-29.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      mode: mode as FareMode,
      from_name: fromName,
      to_name: toName,
      fare_min: fareMin,
      fare_max: fareMax,
      fare_per: farePer as FarePer,
      minutes_min: minutesMin,
      minutes_max: minutesMax,
      schedule_note: scheduleNote,
      source,
      checked_on: checkedOn,
      verified: Boolean(raw.verified),
      is_active: raw.isActive ?? true,
    },
  };
}
