import { normalizeText } from "@/lib/tours/itinerary/assistant";
import type { CostStyle } from "@/lib/tours/guide/costs";
import type { GuidePlaceKind } from "@/lib/tours/guide/places";

/** Reads local-guide questions in English, Filipino or Taglish, for basic mode (no AI). */

const words = (text: string) =>
  normalizeText(text)
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const PLACE_WORDS: Array<[GuidePlaceKind, RegExp]> = [
  ["pasalubong", /\b(pasalubong|souvenir food|pili)\b/],
  ["lodging", /\b(hotel|hotels|stay|staying|sleep|lodging|accommodation|accommodations|resort|resorts|inn|hostel|matulog|tutuluyan|matutuluyan|tulugan|room|rooms)\b/],
  ["eatery", /\b(eat|eating|food|foods|restaurant|restaurants|carinderia|kain|kumain|kainan|pagkain|lunch|dinner|breakfast|almusal|tanghalian|hapunan|merienda|cafe|coffee|food stop|food stops)\b/],
  ["terminal", /\b(terminal|bus station|van terminal|sakayan)\b/],
  ["service", /\b(tourism office|police|hospital|clinic|atm|help desk|emergency)\b/],
];

/** "Where to eat near Bagasbas?" → { kind: "eatery", near: "bagasbas" }. */
/** What the place question also asks to see: sights, not only food or a bed. */
const SIGHT_WORDS = /\b(places to see|place to see|things to see|sights|sightseeing|attractions?|landmarks?|tourist spots?|pasyalan|puntahan)\b/;
/** Kind words that can follow the place in one clause ("near the plaza for food and sights"). */
const TRAILING = /\s+(?:for|na|with|under|and|at|food|foods|eat|restaurants?|places?|things?|sights|attractions?|to see|hotels?|stay)\b.*$/;

export function readPlaceQuestion(text: string): { kind: GuidePlaceKind; near: string | null; budget: boolean; sights: boolean } | null {
  const t = words(text);
  const hit = PLACE_WORDS.find(([, re]) => re.test(t));
  if (!hit) return null;
  // The place is read from the clause that says "near …", so "What's near X? Food and places to see." gives X.
  const clauses = normalizeText(text).split(/[?!.;]+/).map((c) => c.replace(/[,:]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  let near: string | null = null;
  for (const clause of clauses) {
    const m = clause.match(/\b(?:near|around|in|at|malapit sa|sa may|sa)\s+([a-z ]+)$/) ?? clause.match(/\b(?:near|around|malapit sa|sa may)\s+([a-z ]+?)(?=\s+(?:for|na|with|under|and)\b)/);
    if (m) {
      near = m[1].replace(TRAILING, "").trim();
      if (/\b(near|around|malapit)\b/.test(clause)) break;
    }
  }
  const nearMe = /\b(near me|nearby|around here|malapit sa akin|malapit dito|dito)\b/.test(t);
  return {
    kind: hit[0],
    near: nearMe ? "me" : near && !/^(the|a|an)$/.test(near) ? near : null,
    budget: /\b(cheap|budget|affordable|mura)\b/.test(t),
    sights: SIGHT_WORDS.test(t),
  };
}

/** Drops "by bus", "please", "the" from a place the traveller typed. */
const place = (value: string) =>
  value
    .replace(/\b(by|via|sakay ng|using)\s+(bus|van|jeep|jeepney|tricycle|trike|boat|bangka|car|plane)\b.*$/, "")
    .replace(/\b(please|po|naman|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "Paano pumunta sa Daet from Manila?", "how do I get from Daet to Bagasbas" → { from, to }. */
export function readDirectionsQuestion(text: string): { from: string | null; to: string } | null {
  const result = readDirectionsRaw(text);
  if (!result) return null;
  const to = place(result.to);
  return to ? { from: result.from ? place(result.from) || null : null, to } : null;
}

function readDirectionsRaw(text: string): { from: string | null; to: string } | null {
  const t = words(text);
  if (!/\b(how (do|can) (i|we) (get|go)|how to (get|go|commute)|get to|going to|directions?|paano (pumunta|pumunta|makarating|mag commute|magcommute)|papunta|commute|sakay)\b/.test(t)) return null;
  const fromTo = t.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/) ?? t.match(/\bgaling(?: sa)?\s+(.+?)\s+(?:papunta(?: sa)?|to)\s+(.+)$/);
  if (fromTo) return { from: fromTo[1].trim(), to: fromTo[2].trim() };
  const toFrom = t.match(/\b(?:to|sa|papunta sa|papuntang)\s+(.+?)\s+(?:from|galing(?: sa)?)\s+(.+)$/);
  if (toFrom) return { from: toFrom[2].trim(), to: toFrom[1].trim() };
  const only = t.match(/\b(?:to|sa|papunta sa|papuntang)\s+([a-z ]+)$/);
  return only ? { from: null, to: only[1].trim() } : null;
}

/** "Budget for 2 days in Calaguas for 4 people?" → { to: "calaguas", people: 4, nights: 1 }. */
export function readCostQuestion(text: string): { to: string | null; from: string | null; people: number; nights: number; style: CostStyle } | null {
  const t = words(text);
  if (!/\b(budget|how much (will|would|does|do)|magkano (lahat|aabutin|gagastusin|magagastos)|estimate|total cost|cost of (a|the) trip|gastos|expenses?|magkano ang (budget|gastos))\b/.test(t)) return null;
  const num = (re: RegExp) => {
    const m = t.match(re);
    return m ? Number(m[1]) : null;
  };
  const people = num(/\b(\d{1,2})\s*(?:people|persons|pax|tao|kami|adults|of us)\b/) ?? (/\b(couple|two of us|dalawa kami)\b/.test(t) ? 2 : /\b(solo|alone|mag isa|ako lang)\b/.test(t) ? 1 : 2);
  const nightsDirect = num(/\b(\d{1,2})\s*(?:nights?|gabi)\b/);
  const days = num(/\b(\d{1,2})\s*(?:days?|araw)\b/);
  const nights = nightsDirect ?? (days !== null ? Math.max(0, days - 1) : /\bday trip\b/.test(t) ? 0 : 1);
  const to = t.match(/\b(?:in|to|at|sa)\s+([a-z]+(?: [a-z]+)?)(?:\s+(?:for|from|galing|na)\b.*)?$/)?.[1] ?? t.match(/\b(calaguas|bagasbas|mercedes|apuao|daet|vinzons|paracale)\b/)?.[1] ?? null;
  const from = t.match(/\b(?:from|galing(?: sa)?)\s+([a-z]+(?: (?:city|port|pitx|cubao|airport))?)/)?.[1] ?? null;
  const style: CostStyle = /\b(cheap|budget trip|tipid|mura|backpack)\b/.test(t) ? "budget" : /\b(comfort|luxury|nice hotel|sosyal)\b/.test(t) ? "comfort" : "mid";
  return { to: to && !/^\d/.test(to) ? to.replace(/\b(for|the)\b/g, "").trim() || null : null, from, people: Math.min(Math.max(people, 1), 50), nights: Math.min(nights, 30), style };
}

export function isMeetingQuestion(text: string): boolean {
  return /\b(meeting point|where (do|will|should) (we|i) meet|where to meet|saan (kami|tayo|ako) (magkikita|magkita|magmimeet)|tagpuan|pick ?up point)\b/.test(words(text));
}
