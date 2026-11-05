import { formatPeso } from "@/lib/money";
import { ATTRACTION_CATEGORIES, type AttractionCategory } from "@/lib/tours/attractions";
import type { PlannerInput } from "@/lib/tours/itinerary/form";
import { scheduleOrder, withTotals } from "@/lib/tours/itinerary/schedule";
import { addDays, MAX_DAYS, MAX_GROUP, PACES, type Pace, type Plan, type PlannerAttraction, type Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";

/**
 * Trip assistant (F7c): plain-language requests, in English or Taglish.
 * "Describe your trip" fills the planner form; "Ask the assistant" edits a
 * plan. These rule-based versions always work; when Gemini is configured
 * it handles the wording instead (llm.ts), and both end in the same
 * merge-and-validate steps here, so nothing invalid reaches the tourist.
 */

export const ASSISTANT_MAX_LENGTH = 500;

/** Words that point at a category (English, Filipino and local names). */
export const CATEGORY_WORDS: Record<AttractionCategory, string[]> = {
  beach: ["beach", "beaches", "swim", "swimming", "dagat", "baybay", "shore", "sand", "resort"],
  adventure: ["surf", "surfing", "surfer", "skimboard", "kitesurf", "kite", "zipline", "adventure", "extreme", "kayak"],
  nature: ["nature", "hike", "hiking", "trek", "falls", "waterfall", "waterfalls", "talon", "river", "mountain", "bundok", "island", "islands", "mangrove", "outdoors"],
  heritage: ["history", "historic", "historical", "heritage", "museum", "museums", "monument", "culture", "cultural", "rizal", "landmark"],
  religious: ["church", "churches", "simbahan", "mass", "misa", "cathedral", "chapel", "shrine", "religious", "pilgrimage"],
  food: ["food", "foods", "eat", "eating", "kain", "kainan", "restaurant", "restaurants", "delicacy", "delicacies", "foodie", "pinangat", "kinilaw", "pineapple", "pinya"],
  shopping: ["shop", "shopping", "pasalubong", "souvenir", "souvenirs", "market", "palengke", "mall"],
  park: ["park", "parks", "plaza", "garden", "gardens", "liwasan"],
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  isa: 1, isang: 1, dalawa: 2, dalawang: 2, tatlo: 3, tatlong: 3, apat: 4, lima: 5, limang: 5,
};
const NUM = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join("|")})`;
const toNumber = (word: string) => (/^\d+$/.test(word) ? Number(word) : (NUMBER_WORDS[word] ?? NaN));

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Lower-case, accents and punctuation removed, single spaces. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[₱]/g, " php ")
    .replace(/[^a-z0-9:.,;!?\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(text);

export function categoriesIn(text: string): AttractionCategory[] {
  const norm = normalizeText(text);
  return (Object.keys(CATEGORY_WORDS) as AttractionCategory[]).filter((category) => CATEGORY_WORDS[category].some((word) => hasWord(norm, word)));
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
/** The next date on that weekday, today included when includeToday. */
function nextWeekday(today: string, target: number, includeToday: boolean): string {
  let offset = (target - weekday(today) + 7) % 7;
  if (offset === 0 && !includeToday) offset = 7;
  return addDays(today, offset);
}

function parseClockWords(hour: string, minute: string | undefined, meridiem: string | undefined, defaultPm: boolean): string | null {
  let h = Number(hour);
  const m = minute ? Number(minute) : 0;
  if (!Number.isInteger(h) || h > 23 || m > 59) return null;
  if (meridiem === "pm" && h < 12) h += 12;
  else if (meridiem === "am" && h === 12) h = 0;
  else if (!meridiem && defaultPm && h < 12 && h <= 9) h += 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type TripRequest = { input: PlannerInput; understood: string[] };

/** Rule-based reading of "3 days with my 2 kids next weekend, beaches and food, ₱300 each". */
export function parseTripRequest(text: string, today: string, current: PlannerInput): TripRequest {
  const t = normalizeText(text.slice(0, ASSISTANT_MAX_LENGTH));
  const input: PlannerInput = { ...current, interests: [...current.interests] };
  const understood: string[] = [];

  // --- dates
  let start: string | null = null;
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(t);
  const monthFirst = new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\.? (\\d{1,2})\\b`).exec(t);
  const dayFirst = new RegExp(`\\b(\\d{1,2}) (${MONTHS.join("|")})[a-z]*\\b`).exec(t);
  const inDays = new RegExp(`\\bin ${NUM} days?\\b`).exec(t);
  const named = new RegExp(`\\b(this |next |on |sa )?(${WEEKDAYS.join("|")})\\b`).exec(t);
  if (iso) start = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (monthFirst || dayFirst) {
    const month = MONTHS.indexOf((monthFirst ? monthFirst[1] : dayFirst![2]).slice(0, 3)) + 1;
    const day = Number(monthFirst ? monthFirst[2] : dayFirst![1]);
    let year = Number(today.slice(0, 4));
    const key = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (day >= 1 && day <= 31) {
      if (key(year) < today) year += 1;
      start = key(year);
    }
  } else if (/\b(tomorrow|bukas)\b/.test(t)) start = addDays(today, 1);
  else if (/\b(today|ngayon)\b/.test(t)) start = today;
  else if (inDays) start = addDays(today, toNumber(inDays[1]));
  else if (/\bnext week\b/.test(t)) start = nextWeekday(today, 1, false);
  // "next weekend" said from Friday on means the one after the coming weekend.
  else if (/\bnext weekend\b/.test(t)) start = addDays(nextWeekday(today, 6, true), [0, 5, 6].includes(weekday(today)) ? 7 : 0);
  else if (/\b(this )?weekend\b/.test(t)) start = weekday(today) === 0 ? today : nextWeekday(today, 6, true);
  else if (named) start = nextWeekday(today, WEEKDAYS.indexOf(named[2]), false);
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start) && !Number.isNaN(Date.parse(`${start}T00:00:00Z`))) {
    input.startDate = start < today ? today : start;
    understood.push(`starting ${new Date(`${input.startDate}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}`);
  }

  // --- length
  let days: number | null = null;
  const dayCount = new RegExp(`(?<!\\bin )\\b${NUM}[ -]?(days?|araw)\\b`).exec(t);
  const nights = new RegExp(`\\b${NUM}[ -]?nights?\\b`).exec(t);
  if (/\b(day trip|one day|isang araw|half day)\b/.test(t)) days = 1;
  else if (dayCount) days = toNumber(dayCount[1]);
  else if (nights) days = toNumber(nights[1]) + 1;
  else if (/\b(weekend|overnight)\b/.test(t)) days = 2;
  else if (/\b(a|one) week\b/.test(t)) days = MAX_DAYS;
  if (days !== null && Number.isFinite(days) && days >= 1) {
    const clamped = Math.min(MAX_DAYS, days);
    input.days = clamped;
    understood.push(clamped < days ? `${clamped} days (the most we plan at once)` : `${clamped} day${clamped > 1 ? "s" : ""}`);
  }

  // --- group
  let group: number | null = null;
  const people = new RegExp(`\\b${NUM} ?(people|persons|pax|of us|tao|guests|travell?ers)\\b`).exec(t);
  const family = new RegExp(`\\b(family|group|barkada) of ${NUM}\\b`).exec(t);
  const adults = new RegExp(`\\b${NUM} (adults?|matanda)\\b`).exec(t);
  const kids = new RegExp(`\\b${NUM} (kids?|children|child|anak|bata|teens?)\\b`).exec(t);
  const partner = /\b(wife|husband|partner|girlfriend|boyfriend|asawa|jowa|fiance|fiancee)\b/.test(t);
  const friend = /\bwith (a |my )?(friend|kaibigan|buddy)\b/.test(t);
  if (people) group = toNumber(people[1]);
  else if (family) group = toNumber(family[2]);
  else if (adults || kids) group = (adults ? toNumber(adults[1]) : partner ? 2 : 1) + (kids ? toNumber(kids[1]) : 0);
  else if (/\b(solo|alone|by myself|just me|ako lang)\b/.test(t)) group = 1;
  else if (partner || friend || /\b(couple|honeymoon|date)\b/.test(t)) group = 2;
  if (group !== null && Number.isFinite(group) && group >= 1) {
    input.groupSize = Math.min(MAX_GROUP, group);
    understood.push(`${input.groupSize} ${input.groupSize === 1 ? "person" : "people"}`);
  }

  // --- pace
  let pace: Pace | null = null;
  let paceReason = "";
  if (/\b(packed|as many|as much as|busy|full day|maximi[sz]e|sulit|lots of stops|many stops)\b/.test(t)) pace = "packed";
  else if (/\b(relax|relaxed|relaxing|slow|chill|easy|not (too )?(rushed|hurried|tiring)|no rush|leisure|leisurely|take it easy|petiks)\b/.test(t)) pace = "relaxed";
  else if (/\b(normal|regular|moderate) pace\b/.test(t)) pace = "normal";
  else if (kids || /\b(kids|children|toddler|baby|senior|seniors|elderly|lola|lolo|wheelchair)\b/.test(t)) {
    pace = "relaxed";
    paceReason = " (easier with kids or seniors)";
  }
  if (pace) {
    input.pace = pace;
    understood.push(`${pace} pace${paceReason}`);
  }

  // --- budget (entrance fees, per person per day)
  const amount = /\b(?:php|p|peso|pesos)\s?(\d[\d,]*)\b|\b(\d[\d,]*)\s?(?:php|pesos?)\b/.exec(t);
  if (amount) {
    let value = Number((amount[1] ?? amount[2]).replace(/,/g, ""));
    const total = /\b(total|in all|altogether|for (all|everyone|the group|the whole trip)|lahat)\b/.test(t);
    if (total) value = value / Math.max(1, input.groupSize) / Math.max(1, input.days);
    if (Number.isFinite(value) && value >= 0 && value <= 100000) {
      input.budgetPerDay = Math.round(value);
      understood.push(`${formatPeso(input.budgetPerDay)} per person per day for entrance fees${total ? " (from your total)" : ""}`);
    }
  } else if (/\b(free|no entrance|no fees|walang bayad|libre)\b/.test(t)) {
    input.budgetPerDay = 0;
    understood.push("free places only");
  } else if (/\b(cheap|budget trip|tight budget|low budget|tipid|mura)\b/.test(t)) {
    input.budgetPerDay = Math.min(input.budgetPerDay, 200);
    understood.push(`up to ${formatPeso(input.budgetPerDay)} per person per day`);
  }

  // --- times
  const startAt = /\b(?:start(?:ing)?|from|leave|begin|alis)(?: at| by)? (\d{1,2})(?::(\d{2}))? ?(am|pm)?\b/.exec(t);
  const endAt = /\b(?:until|till|til|by|end(?:ing)?(?: at)?|back by|finish(?: by)?|hanggang) (\d{1,2})(?::(\d{2}))? ?(am|pm)?\b/.exec(t);
  const startTime = startAt ? parseClockWords(startAt[1], startAt[2], startAt[3], false) : /\b(early|maaga|sunrise)\b/.test(t) ? "07:00" : /\b(sleep in|late start|not too early)\b/.test(t) ? "09:30" : null;
  const endTime = endAt ? parseClockWords(endAt[1], endAt[2], endAt[3], true) : null;
  if (startTime) {
    input.dayStart = startTime;
    understood.push(`days start ${startTime}`);
  }
  if (endTime) {
    input.dayEnd = endTime;
    understood.push(`finish by ${endTime}`);
  }

  // --- interests
  const interests = categoriesIn(t);
  if (interests.length) {
    input.interests = interests;
    understood.push(interests.map((c) => ATTRACTION_CATEGORIES[c]).join(", "));
  } else if (/\b(anything|everything|surprise me|kahit ano|all kinds|all categories|lahat)\b/.test(t)) {
    // R2: "everything" selects every category, so the planner shows All pressed.
    input.interests = Object.keys(ATTRACTION_CATEGORIES) as AttractionCategory[];
    understood.push("all categories");
  }

  return { input, understood };
}

/** A model's reading of the request; anything left null keeps the current form value. */
export type TripFields = {
  startDate: string | null;
  days: number | null;
  groupSize: number | null;
  budgetPerDay: number | null;
  interests: string[] | null;
  pace: string | null;
  dayStart: string | null;
  dayEnd: string | null;
  understood: string[];
};

export function mergeTripFields(current: PlannerInput, fields: TripFields, today: string): TripRequest {
  const input: PlannerInput = { ...current, interests: [...current.interests] };
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null);
  if (isDate(fields.startDate)) input.startDate = fields.startDate < today ? today : fields.startDate;
  input.days = int(fields.days, 1, MAX_DAYS) ?? input.days;
  input.groupSize = int(fields.groupSize, 1, MAX_GROUP) ?? input.groupSize;
  input.budgetPerDay = int(fields.budgetPerDay, 0, 100000) ?? input.budgetPerDay;
  if (Array.isArray(fields.interests)) {
    const valid = fields.interests.filter((c): c is AttractionCategory => typeof c === "string" && c in ATTRACTION_CATEGORIES);
    input.interests = [...new Set(valid)];
  }
  if (typeof fields.pace === "string" && (PACES as readonly string[]).includes(fields.pace)) input.pace = fields.pace;
  if (isTime(fields.dayStart)) input.dayStart = fields.dayStart;
  if (isTime(fields.dayEnd)) input.dayEnd = fields.dayEnd;
  const understood = (Array.isArray(fields.understood) ? fields.understood : [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().slice(0, 80))
    .slice(0, 8);
  return { input, understood };
}

// ------------------------------------------------------------------ plan changes

export type ChangeResult = { plan: Plan; prefs: Preferences; reply: string; changed: boolean };

const STOP_WORDS = new Set(["the", "and", "day", "days", "to", "of", "a", "an", "in", "on", "at", "for", "my", "me", "please", "pls", "po", "naman", "ng", "sa", "ang", "na", "stop", "stops", "place", "places", "visit", "also", "instead", "with", "more", "some", "one", "another"]);
const GENERIC_NAME_WORDS = new Set(["beach", "church", "park", "falls", "island", "museum", "plaza", "river", "resort", "parish", "national", "camarines", "norte", "daet", "of", "the", "de", "san", "santa", "sto", "ng"]);

/** Attractions a phrase names, best match first. */
export function matchAttractions(phrase: string, attractions: PlannerAttraction[]): PlannerAttraction[] {
  const words = normalizeText(phrase).split(" ").filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (words.length === 0) return [];
  const scored = attractions
    .map((attraction) => {
      const name = normalizeText(attraction.name);
      const nameWords = name.split(" ");
      const phraseNorm = normalizeText(phrase);
      if (phraseNorm.includes(name)) return { attraction, score: 100 };
      const hits = words.filter((w) => nameWords.some((n) => n === w || (w.length >= 5 && n.startsWith(w))));
      const distinctive = hits.filter((w) => !GENERIC_NAME_WORDS.has(w));
      return { attraction, score: distinctive.length * 10 + hits.length };
    })
    .filter((s) => s.score >= 10)
    .sort((a, b) => b.score - a.score || a.attraction.name.localeCompare(b.attraction.name));
  if (scored.length === 0) return [];
  return scored.filter((s) => s.score === scored[0].score).map((s) => s.attraction);
}

const visitsOf = (plan: Plan, day: number) => plan.days[day].blocks.flatMap((b) => (b.kind === "visit" ? [b.attractionId] : []));

function retime(days: string[][], dates: string[], byId: Map<string, PlannerAttraction>, prefs: Preferences): Plan {
  return withTotals(days.map((ids, i) => scheduleOrder(dates[i], ids, byId, prefs)));
}

/** Keeps the order, dropping any stop that would break the day (closed, too late, over budget). */
function fitDays(days: string[][], dates: string[], byId: Map<string, PlannerAttraction>, prefs: Preferences): { days: string[][]; dropped: string[] } {
  const kept: string[][] = days.map(() => []);
  const dropped: string[] = [];
  for (let d = 0; d < days.length; d += 1) {
    for (const id of days[d]) {
      const trial = kept.map((ids, i) => (i === d ? [...ids, id] : ids));
      const plan = retime(trial, dates, byId, prefs);
      if (validatePlan(plan, byId, prefs).issues.some((issue) => issue.day === d)) dropped.push(id);
      else kept[d] = trial[d];
    }
  }
  return { days: kept, dropped };
}

/** Tries to add a stop: to the named day, else the day with the fewest stops that it fits. */
function addStop(days: string[][], id: string, dayIndex: number | null, dates: string[], byId: Map<string, PlannerAttraction>, prefs: Preferences): number | null {
  const order = dayIndex !== null ? [dayIndex] : days.map((_, i) => i).sort((a, b) => days[a].length - days[b].length || a - b);
  for (const d of order) {
    // Try every position; keep the first that leaves the day valid.
    for (let pos = days[d].length; pos >= 0; pos -= 1) {
      const ids = [...days[d].slice(0, pos), id, ...days[d].slice(pos)];
      const trial = days.map((x, i) => (i === d ? ids : x));
      if (!validatePlan(retime(trial, dates, byId, prefs), byId, prefs).issues.some((issue) => issue.day === d)) {
        days[d] = ids;
        return d;
      }
    }
  }
  return null;
}

const nameOf = (byId: Map<string, PlannerAttraction>, id: string) => byId.get(id)?.name ?? "that place";
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Rule-based plan edits: "remove the church", "add Bagasbas Beach to day 2",
 * "more food", "swap X for Y", "make it relaxed", "start at 9am".
 */
export function applyChangeRequest(text: string, plan: Plan, attractions: PlannerAttraction[], prefs: Preferences): ChangeResult {
  const byId = new Map(attractions.map((a) => [a.id, a]));
  const dates = plan.days.map((d) => d.date);
  let next: Preferences = { ...prefs };
  let days = plan.days.map((_, i) => visitsOf(plan, i));
  const notes: string[] = [];
  const failed: string[] = [];
  let understoodAny = false;

  const clauses = normalizeText(text.slice(0, ASSISTANT_MAX_LENGTH))
    .split(/[.;,!?]| and then | then | and | at saka | tsaka | saka | tapos /)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    const dayMatch = /\bday (\d{1,2})\b|\b(first|second|third|fourth|fifth|last) day\b|\b(tomorrow|today)\b/.exec(clause);
    const ordinal = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4 } as Record<string, number>;
    let dayIndex: number | null = dayMatch ? (dayMatch[1] ? Number(dayMatch[1]) - 1 : dayMatch[2] === "last" ? days.length - 1 : dayMatch[2] ? ordinal[dayMatch[2]] : 0) : null;
    if (dayIndex !== null && (dayIndex < 0 || dayIndex >= days.length)) {
      understoodAny = true;
      failed.push(`your trip has ${days.length} day${days.length > 1 ? "s" : ""}, so there is no day ${dayIndex + 1}`);
      continue;
    }
    const scoped = (d: number) => dayIndex === null || dayIndex === d;

    // pace
    const pace: Pace | null = /\b(relax|relaxed|slower|slow|chill|easier|easy|less rushed|not (too )?rushed|fewer stops|less stops|lighter)\b/.test(clause)
      ? "relaxed"
      : /\b(packed|busier|more stops|as many|maximi[sz]e|fuller|sulit)\b/.test(clause)
        ? "packed"
        : /\bnormal pace\b/.test(clause)
          ? "normal"
          : null;
    if (pace) {
      understoodAny = true;
      if (pace !== next.pace) {
        next = { ...next, pace };
        notes.push(`switched to a ${pace} pace${dayIndex !== null ? " (pace applies to the whole trip)" : ""}`);
      }
      if (pace === "relaxed") {
        // Fewer stops per day: keep the earliest ones.
        const max = 3;
        days = days.map((ids, d) => {
          if (!scoped(d) || ids.length <= max) return ids;
          notes.push(`dropped ${list(ids.slice(max).map((id) => nameOf(byId, id)))} from day ${d + 1}`);
          return ids.slice(0, max);
        });
      }
      continue;
    }

    // times
    const startAt = /\b(?:start|begin|leave)(?: the day| each day| days)?(?: at| by)? (\d{1,2})(?::(\d{2}))? ?(am|pm)?\b/.exec(clause);
    const endAt = /\b(?:finish|end|until|till|back)(?: by| at)? (\d{1,2})(?::(\d{2}))? ?(am|pm)?\b/.exec(clause);
    if (startAt || endAt || /\b(start later|sleep in|start earlier)\b/.test(clause)) {
      understoodAny = true;
      const toMinutes = (h: string, m: string | undefined, mer: string | undefined, pm: boolean) => {
        const value = parseClockWords(h, m, mer, pm);
        return value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
      };
      const s = startAt ? toMinutes(startAt[1], startAt[2], startAt[3], false) : /start later|sleep in/.test(clause) ? next.dayStart + 60 : /start earlier/.test(clause) ? next.dayStart - 60 : null;
      const e = endAt ? toMinutes(endAt[1], endAt[2], endAt[3], true) : null;
      const candidate = { ...next, dayStart: s ?? next.dayStart, dayEnd: e ?? next.dayEnd };
      if (candidate.dayStart < 5 * 60 || candidate.dayEnd > 22 * 60 || candidate.dayEnd - candidate.dayStart < 4 * 60) {
        failed.push("days need at least 4 hours between 5 AM and 10 PM");
      } else {
        next = candidate;
        const clock = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
        notes.push(`days now run ${clock(next.dayStart)}–${clock(next.dayEnd)}`);
      }
      continue;
    }

    // swap A for B / replace A with B
    const swap = /\b(?:swap|replace|change|palitan)\s+(.+?)\s+(?:for|with|to|ng)\s+(.+)$/.exec(clause);
    if (swap) {
      understoodAny = true;
      const out = matchAttractions(swap[1], attractions).find((a) => days.some((ids, d) => scoped(d) && ids.includes(a.id)));
      const inCandidates = matchAttractions(swap[2], attractions);
      const incoming = inCandidates.find((a) => !days.flat().includes(a.id)) ?? inCandidates[0];
      if (!out) failed.push(`"${swap[1]}" isn't in your plan`);
      else if (!incoming) failed.push(`"${swap[2]}" isn't in our attraction list`);
      else if (days.flat().includes(incoming.id)) failed.push(`${incoming.name} is already in your plan`);
      else {
        const d = days.findIndex((ids) => ids.includes(out.id));
        const trial = days.map((ids, i) => (i === d ? ids.map((id) => (id === out.id ? incoming.id : id)) : ids));
        if (validatePlan(retime(trial, dates, byId, next), byId, next).issues.some((issue) => issue.day === d)) {
          failed.push(`${incoming.name} doesn't fit in ${out.name}'s slot on day ${d + 1} (hours, travel or budget)`);
        } else {
          days = trial;
          notes.push(`swapped ${out.name} for ${incoming.name} on day ${d + 1}`);
        }
      }
      continue;
    }

    // remove / skip
    const remove = /\b(?:remove|skip|drop|delete|cancel|no|without|not|ayaw(?: ko)?(?: ng| sa)?|tanggalin|alisin|wag(?: na)?|huwag)\s+(.+)$/.exec(clause);
    if (remove) {
      understoodAny = true;
      const target = remove[1];
      const named = matchAttractions(target, attractions).filter((a) => days.some((ids, d) => scoped(d) && ids.includes(a.id)));
      const cats = named.length ? [] : categoriesIn(target);
      const removeIds = new Set(named.length ? named.map((a) => a.id) : days.flatMap((ids, d) => (scoped(d) ? ids.filter((id) => cats.includes(byId.get(id)!.category)) : [])));
      if (removeIds.size === 0) {
        failed.push(`nothing in your plan matches "${target}"`);
      } else {
        days = days.map((ids, d) => (scoped(d) ? ids.filter((id) => !removeIds.has(id)) : ids));
        notes.push(`removed ${list([...removeIds].map((id) => nameOf(byId, id)))}`);
        if (cats.length) next = { ...next, interests: next.interests.filter((c) => !cats.includes(c)) };
      }
      continue;
    }

    // add / more of a category
    const add = /\b(?:add|include|visit|go to|see|put|isama|isingit|puntahan|dagdag(?:an)?|more|another|extra)\s+(.+)$/.exec(clause);
    const target = add ? add[1] : clause;
    const named = matchAttractions(target, attractions);
    const cats = named.length ? [] : categoriesIn(target);
    if (add || named.length || cats.length) {
      understoodAny = true;
      const inPlan = new Set(days.flat());
      const candidates = named.length
        ? named.filter((a) => !inPlan.has(a.id))
        : attractions.filter((a) => cats.includes(a.category) && !inPlan.has(a.id)).sort((a, b) => (a.fee ?? 0) - (b.fee ?? 0) || a.name.localeCompare(b.name));
      if (named.length && candidates.length === 0) {
        failed.push(`${named[0].name} is already in your plan`);
        continue;
      }
      if (candidates.length === 0) {
        failed.push(cats.length ? `there are no more ${cats.map((c) => ATTRACTION_CATEGORIES[c].toLowerCase()).join(" or ")} places to add` : `"${target}" isn't in our attraction list`);
        continue;
      }
      let added: { id: string; day: number } | null = null;
      for (const candidate of candidates.slice(0, 8)) {
        const day = addStop(days, candidate.id, dayIndex, dates, byId, next);
        if (day !== null) {
          added = { id: candidate.id, day };
          break;
        }
      }
      if (added) {
        notes.push(`added ${nameOf(byId, added.id)} to day ${added.day + 1}`);
        if (cats.length) next = { ...next, interests: [...new Set([...next.interests, ...cats])] };
      } else {
        failed.push(`${named.length ? candidates[0].name : "nothing like that"} doesn't fit ${dayIndex !== null ? `day ${dayIndex + 1}` : "any day"} (opening hours, travel time or budget)`);
      }
      continue;
    }
  }

  // Nothing to do: keep the plan exactly as it was (re-timing could move lunch).
  if (notes.length === 0 && JSON.stringify(next) === JSON.stringify(prefs)) {
    const reply = !understoodAny
      ? 'I didn\'t catch that. Try "remove the church", "add Bagasbas Beach to day 2", "more food", "swap A for B", "make it relaxed" or "start at 9am".'
      : failed.length
        ? `${capitalize(list(failed))}, so nothing changed.`
        : "Your plan already matches that.";
    return { plan, prefs, reply, changed: false };
  }

  // Pace and time changes re-time everything; drop whatever no longer fits.
  const fitted = fitDays(days, dates, byId, next);
  if (fitted.dropped.length) notes.push(`left out ${list(fitted.dropped.map((id) => nameOf(byId, id)))} because ${fitted.dropped.length > 1 ? "they no longer fit" : "it no longer fits"}`);
  const result = retime(fitted.days, dates, byId, next);
  const valid = validatePlan(result, byId, next).ok;
  const changed = valid;

  let reply: string;
  if (!valid) {
    reply = "I couldn't make that change and keep every stop open and on time, so your plan is unchanged.";
  } else {
    const sentences = [notes.length ? capitalize(list(notes)) + "." : null, failed.length ? `Not done: ${list(failed)}.` : null].filter(Boolean);
    reply = sentences.join(" ") || "Your plan already matches that.";
  }
  return valid ? { plan: result, prefs: next, reply, changed } : { plan, prefs, reply, changed: false };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Preferences back to the form shape (for saving after the assistant changed pace or times). */
export function prefsToInput(prefs: Preferences): PlannerInput {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { startDate: prefs.startDate, days: prefs.days, budgetPerDay: prefs.budgetPerDay, interests: [...prefs.interests], pace: prefs.pace, groupSize: prefs.groupSize, dayStart: clock(prefs.dayStart), dayEnd: clock(prefs.dayEnd) };
}

/** Example prompts shown as tappable chips. */
export const TRIP_EXAMPLES = [
  "3 days next weekend with my 2 kids, beaches and food, not too rushed",
  "Surfing and seafood for 4 friends, 2 days from Nov 15, ₱500 each per day",
  "Day trip tomorrow, churches and history, start at 7am",
];
export const CHANGE_EXAMPLES = ["Make it more relaxed", "Add more food stops", "Remove the church on day 1", "Start at 9am"];
