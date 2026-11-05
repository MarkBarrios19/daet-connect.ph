import { normalizeText } from "@/lib/tours/itinerary/assistant";
import type { FareLeg, FareMode, FareRoute } from "@/lib/tours/guide/fares";

/**
 * Getting to Daet, for basic mode (no AI): read a fare, route or travel-time
 * question in English, Tagalog, Taglish or Bikol, and answer it in the same
 * language from the fare table. Every answer says the fares are estimates and
 * to confirm them, because they come from public listings, not operators.
 *
 * The Bikol lines are short and plain on purpose; have a Bikol speaker at the
 * Tourism Office read them over (see BIKOL below).
 */

export type TripLang = "en" | "tl" | "taglish" | "bcl";
export type TripQuestion = { from: string | null; to: string; asks: "fare" | "route" | "time" };

const words = (text: string) =>
  ` ${normalizeText(text)
    .replace(/[?!.,;:()"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
const count = (t: string, list: string[]) => list.filter((w) => t.includes(` ${w} `)).length;

// Words only (or almost only) one of the languages uses.
const BIKOL = ["pira", "magduman", "hali", "hale", "pasiring", "tabi", "gurano", "haloy", "kahaloy", "saen", "maray", "dai", "iyo", "kan", "ining", "baga", "ngani"];
const TAGALOG = ["magkano", "paano", "pumunta", "papunta", "papuntang", "galing", "mula", "ilang", "oras", "gaano", "katagal", "po", "ba", "ang", "ng", "mga", "saan", "sasakay", "sumakay", "punta", "pupunta", "kami", "ako", "namin", "natin", "tayo", "bumiyahe"];
const ENGLISH = ["how", "much", "from", "to", "the", "what", "is", "get", "go", "long", "does", "take", "fare", "fares", "price", "travel", "way", "ways", "can", "i", "we", "best", "cheapest", "there"];

/** Which language to answer in. Taglish is Tagalog with English mixed in. */
export function detectTripLang(text: string): TripLang {
  const t = words(text);
  const bcl = count(t, BIKOL);
  const tl = count(t, TAGALOG);
  const en = count(t, ENGLISH);
  if (bcl > 0 && bcl >= tl) return "bcl";
  if (tl === 0) return "en";
  // "Magkano pamasahe from Manila to Daet?" mixes the two.
  return en >= 2 ? "taglish" : "tl";
}

const ASKS_FARE = /\b(pamasahe|pasahe|fare|fares|ticket price|pira|magkano|how much|price|gastos|bayad)\b/;
const ASKS_TIME = /\b(how long|gaano katagal|ilang oras|gurano kahaloy|haloy|kahaloy|travel time|tagal ng biyahe|tagal)\b/;
const ASKS_ROUTE = /\b(how (do|can|to|would) (i|we|you)? ?(get|go|travel|commute)|how to (get|go|travel|commute)|get to|paano|pano|pumunta|papunta|papuntang|pupunta|magduman|makaabot|makarating|commute|byahe|biyahe|route|routes|directions?|way to|ways to|sakay|sumakay|transportation|transport)\b/;
/** A trip word that is a fare word only when two places are named: "magkano" alone is usually a tour price. */
const AMBIGUOUS_FARE = /\b(magkano|how much|price|pira|gastos|bayad)\b/;

const FROM_WORDS = "(?:from|galing(?: sa| ng)?|mula(?: sa)?|hali(?: sa)?|hale(?: sa)?|starting at|starting from)";
const TO_WORDS = "(?:to|papunta(?: sa| ng)?|papuntang|pumunta(?: sa| ng)?|pupunta(?: sa| ng)?|pasiring(?: sa)?|magduman(?: sa)?|going to|get to|go to|sa)";
const STOP_WORDS = "from|to|galing|mula|hali|hale|papunta|papuntang|pasiring|magduman|sa|by|via|using|if|kung|po|tabi|daw|ba|na|and|at|for|para|please|naman|today|tomorrow|bukas|ngayon|how|magkano|pira|gaano|ilang";
/** Where a place name ends: before the next little word, or at the end. */
const STOP = `(?:\\s+(?:${STOP_WORDS})\\b|\\s*$)`;

const clean = (place: string | undefined) =>
  (place ?? "")
    .replace(/\b(the|city|province|airport please)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A place word must look like a place, not "how" or "there". */
const NOT_A_PLACE = /^(here|there|dito|diyan|doon|duman|digdi|it|this|that|me|us|you|get|go|travel|commute|how|much|long|pamasahe|pasahe|fare)$/;

/**
 * "Magkano pamasahe from Manila to Daet?", "Paano pumunta Daet from Cebu?",
 * "How long is the trip to Daet from Davao", "Pira an pamasahe hali sa Naga
 * pasiring sa Daet?" → { from, to, asks }. A question that names only a
 * starting point is about getting here, to Daet.
 */
export function readTripQuestion(text: string): TripQuestion | null {
  const t = words(text).trim();
  const fareWord = ASKS_FARE.test(t);
  const timeWord = ASKS_TIME.test(t);
  const routeWord = ASKS_ROUTE.test(t);
  if (!fareWord && !timeWord && !routeWord) return null;

  const fromMatch = t.match(new RegExp(`\\b${FROM_WORDS}\\s+([a-z][a-z ]*?)(?=${STOP})`));
  let from = clean(fromMatch?.[1]);
  // Everything after the "from" phrase is no longer a candidate destination.
  const withoutFrom = fromMatch ? t.replace(fromMatch[0], " ").replace(/\s+/g, " ").trim() : t;
  let to = "";
  for (const m of withoutFrom.matchAll(new RegExp(`\\b${TO_WORDS}\\s+([a-z][a-z ]*?)(?=${STOP})`, "g"))) {
    const candidate = clean(m[1]);
    if (candidate && !NOT_A_PLACE.test(candidate)) {
      to = candidate;
      break;
    }
  }
  // "Paano pumunta Daet from Cebu": the destination right after the verb, with no "sa".
  if (!to) {
    const bare = withoutFrom.match(/\b(?:pumunta|papunta|pupunta|magduman|makarating|makaabot|get to|go to|reach)\s+([a-z]+(?: [a-z]+)?)/);
    const candidate = clean(bare?.[1]?.replace(new RegExp(`\\s+(?:${STOP_WORDS})\\b.*$`), ""));
    if (candidate && !NOT_A_PLACE.test(candidate)) to = candidate;
  }
  if (from && NOT_A_PLACE.test(from)) from = "";

  // "Magkano" with no places is a tour price, not a fare.
  const onlyAmbiguous = fareWord && !timeWord && !routeWord && !/\b(pamasahe|pasahe|fare|fares)\b/.test(t) && AMBIGUOUS_FARE.test(t);
  if (onlyAmbiguous && !from) return null;
  if (!from && !to) return null;

  return {
    from: from ? titleCase(from) : null,
    to: to ? titleCase(to) : "Daet",
    asks: timeWord && !fareWord ? "time" : fareWord ? "fare" : "route",
  };
}

const titleCase = (place: string) => place.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Sa|Ng|De|Del|Of)\b/g, (w) => w.toLowerCase());

// ---------------------------------------------------------------- answers

const MODE: Record<TripLang, Record<FareMode, string>> = {
  en: { bus: "Bus", van: "Van (UV Express)", jeepney: "Jeepney", tricycle: "Tricycle", boat: "Boat", habal_habal: "Habal-habal", taxi: "Taxi", plane: "Flight" },
  tl: { bus: "Bus", van: "Van (UV Express)", jeepney: "Jeep", tricycle: "Tricycle", boat: "Bangka", habal_habal: "Habal-habal", taxi: "Taxi", plane: "Eroplano" },
  taglish: { bus: "Bus", van: "Van (UV Express)", jeepney: "Jeep", tricycle: "Tricycle", boat: "Boat", habal_habal: "Habal-habal", taxi: "Taxi", plane: "Flight" },
  bcl: { bus: "Bus", van: "Van (UV Express)", jeepney: "Dyip", tricycle: "Tricycle", boat: "Bangka", habal_habal: "Habal-habal", taxi: "Taxi", plane: "Eroplano" },
};

const TEXT: Record<TripLang, {
  intro: (from: string, to: string, n: number) => string;
  introAnyStart: (to: string) => string;
  perPerson: string;
  perBoat: string;
  perTrip: string;
  from: string;
  askLocally: string;
  total: string;
  shared: string;
  time: string;
  atLeast: string;
  hours: string;
  minutes: string;
  then: string;
  none: (from: string, to: string) => string;
  disclaimer: (date: string) => string;
}> = {
  en: {
    intro: (from, to, n) => `From ${from} to ${to}, ${n === 1 ? "here is the way I know" : `here are ${n} ways`}:`,
    introAnyStart: (to) => `Ways to get to ${to}:`,
    perPerson: "per person",
    perBoat: "per boat",
    perTrip: "per trip",
    from: "from",
    askLocally: "fare not listed, ask at the terminal",
    total: "Total",
    shared: "plus, shared by your group",
    time: "Travel time",
    atLeast: "at least",
    hours: "h",
    minutes: "min",
    then: " → ",
    none: (from, to) => `I don't have fares from ${from} to ${to} yet. The usual way is to get to Manila or Naga first, then take the bus or van to Daet. The Daet Tourism Office can help.`,
    disclaimer: (date) => `These are estimates from public fare listings checked ${date}, not quotes. Fares change, so confirm with the bus line, airline or boat operator before you travel.`,
  },
  tl: {
    intro: (from, to, n) => `Mula ${from} papunta sa ${to}, ${n === 1 ? "ito ang paraan" : `ito ang ${n} paraan`}:`,
    introAnyStart: (to) => `Mga paraan papunta sa ${to}:`,
    perPerson: "bawat tao",
    perBoat: "bawat bangka",
    perTrip: "bawat biyahe",
    from: "mula",
    askLocally: "walang nakalistang pamasahe, itanong sa terminal",
    total: "Kabuuan",
    shared: "dagdag, hati-hati ang grupo",
    time: "Tagal ng biyahe",
    atLeast: "hindi bababa sa",
    hours: "oras",
    minutes: "minuto",
    then: " → ",
    none: (from, to) => `Wala pa akong pamasahe mula ${from} papunta sa ${to}. Kadalasan, pumunta muna sa Manila o Naga, saka sumakay ng bus o van papuntang Daet. Makakatulong ang Daet Tourism Office.`,
    disclaimer: (date) => `Tantiya lang ito mula sa mga pampublikong listahan ng pamasahe (nasuri ${date}). Nagbabago ang pamasahe, kaya kumpirmahin muna sa bus, airline o bangka bago bumiyahe.`,
  },
  taglish: {
    intro: (from, to, n) => `From ${from} papunta sa ${to}, ${n === 1 ? "ito ang option" : `ito ang ${n} options`}:`,
    introAnyStart: (to) => `Mga options papunta sa ${to}:`,
    perPerson: "per person",
    perBoat: "per boat",
    perTrip: "per trip",
    from: "from",
    askLocally: "walang listed na fare, itanong sa terminal",
    total: "Total",
    shared: "dagdag, hati-hati ang group",
    time: "Travel time",
    atLeast: "at least",
    hours: "h",
    minutes: "min",
    then: " → ",
    none: (from, to) => `Wala pa akong fares from ${from} papunta sa ${to}. Usually, pumunta muna sa Manila o Naga, then sakay ng bus o van papuntang Daet. Puwede ring magtanong sa Daet Tourism Office.`,
    disclaimer: (date) => `Estimate lang ang fares na ito, from public listings (checked ${date}). Nagbabago ang fares, kaya pa-confirm muna sa bus, airline o boat operator bago ka bumiyahe.`,
  },
  bcl: {
    intro: (from, to, n) => `Hale sa ${from} pasiring sa ${to}, ${n === 1 ? "ini an paagi" : `ini an ${n} na paagi`}:`,
    introAnyStart: (to) => `Mga paagi pasiring sa ${to}:`,
    perPerson: "kada tawo",
    perBoat: "kada bangka",
    perTrip: "kada biyahe",
    from: "hale",
    askLocally: "mayong nakalistang pamasahe, ihapot sa terminal",
    total: "Gabos",
    shared: "dagdag, pagbanga-bangaan kan grupo",
    time: "Haloy kan biyahe",
    atLeast: "dai mababa sa",
    hours: "oras",
    minutes: "minuto",
    then: " → ",
    none: (from, to) => `Mayo pa akong pamasahe hale sa ${from} pasiring sa ${to}. Kadaklan, magduman muna sa Manila o Naga, dangan sumakay nin bus o van pasiring Daet. Makakatabang an Daet Tourism Office.`,
    disclaimer: (date) => `Tantiya sana ining mga pamasahe hale sa mga listahan (${date}). Nagbabago an pamasahe, kaya ihapot tabi sa bus, airline o bangka bago magbiyahe.`,
  },
};

function duration(min: number | null, max: number | null, lang: TripLang): string | null {
  const s = TEXT[lang];
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (!h) return `${r} ${s.minutes}`;
    return r ? `${h} ${s.hours} ${r} ${s.minutes}` : `${h} ${s.hours}`;
  };
  if (min === null && max === null) return null;
  const lo = (min ?? max) as number;
  const hi = (max ?? min) as number;
  if (lo === hi) return fmt(lo);
  // Whole hours read better as a range: "8–10 h".
  if (lo % 60 === 0 && hi % 60 === 0) return `${lo / 60}–${hi / 60} ${s.hours}`;
  return `${fmt(lo)}–${fmt(hi)}`;
}

function money(lo: number | null, hi: number | null, fromOnly: boolean, unit: string, lang: TripLang, format: (n: number) => string): string | null {
  if (lo === null && hi === null) return null;
  const a = (lo ?? hi) as number;
  const b = (hi ?? lo) as number;
  if (fromOnly || hi === null) return `${TEXT[lang].from} ${format(a)} ${unit}`;
  return a === b ? `${format(a)} ${unit}` : `${format(a)}–${format(b)} ${unit}`;
}

function legText(leg: FareLeg, lang: TripLang, format: (n: number) => string): string {
  const s = TEXT[lang];
  const unit = leg.fare_per === "boat" ? s.perBoat : leg.fare_per === "trip" ? s.perTrip : s.perPerson;
  const fare = money(leg.fare_min, leg.fare_max, false, unit, lang, format) ?? s.askLocally;
  const time = duration(leg.minutes_min, leg.minutes_max, lang);
  return `${MODE[lang][leg.mode]} ${leg.from_name} → ${leg.to_name} (${fare}${time ? `, ${time}` : ""})`;
}

/** The answer in the traveller's language: up to four ways, each with fares, totals and time, then the disclaimer. */
export function tripAnswer(
  routes: FareRoute[],
  question: TripQuestion,
  lang: TripLang,
  format: (n: number) => string,
): string {
  const s = TEXT[lang];
  if (!routes.length) return `${s.none(question.from ?? "there", question.to)} ${s.disclaimer(today())}`;

  const shown = routes.slice(0, 4);
  const lines = shown.map((route, i) => {
    const steps = route.legs.map((leg) => legText(leg, lang, format)).join(s.then);
    const extras: string[] = [];
    if (route.legs.length > 1 && route.perPersonMin !== null) {
      extras.push(`${s.total}: ${money(route.perPersonMin, route.perPersonMax, route.perPersonFromOnly, s.perPerson, lang, format)}`);
    }
    for (const leg of route.sharedLegs) {
      const shared = money(leg.fare_min, leg.fare_max, false, leg.fare_per === "boat" ? s.perBoat : s.perTrip, lang, format);
      if (shared && route.legs.length > 1) extras.push(`${shared} ${s.shared}`);
    }
    const time = duration(route.minutesMin, route.minutesMax, lang);
    if (time && route.legs.length > 1) extras.push(`${s.time}: ${route.timeComplete ? "" : `${s.atLeast} `}${time}`);
    return `${i + 1}. ${steps}${extras.length ? `. ${extras.join(". ")}` : ""}.`;
  });

  const checked = shown.flatMap((r) => r.legs.map((l) => l.checked_on)).sort()[0] ?? today();
  const intro = question.from ? s.intro(question.from, question.to, shown.length) : s.introAnyStart(question.to);
  return [intro, ...lines, s.disclaimer(checked)].join("\n");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
