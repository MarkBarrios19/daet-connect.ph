import { z } from "zod/v4";
import { emergencyNumbers, openNearMe, tourToday } from "@/lib/tours/assistant/trip-day";
import type { ToolContext } from "@/lib/tours/assistant/tools";

/**
 * An ability is one thing the assistant can do on a trip day. It owns everything
 * about it in one place, so basic mode and the AI agree by construction:
 * - `matches`: basic mode's test on a normalised message;
 * - `input` + `basicInput`: the AI tool's arguments, and the same arguments read from plain text;
 * - `name` + `description`: the AI tool declaration;
 * - `promptLine`: the guidance added to the system prompt;
 * - `run`: the answer as data (`answer` plus whatever else it found; cards go on the context).
 * Each adapter formats the result: basic mode reads `answer`, the AI gets the whole object.
 */
export type AbilityResult = { answer: string } & Record<string, unknown>;

export type Ability<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  input: S;
  promptLine: string;
  matches: (t: string) => boolean;
  basicInput: (text: string) => z.infer<S>;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<AbilityResult>;
};

function ability<S extends z.ZodObject>(a: Ability<S>): Ability<S> {
  return a;
}

export const isEmergency = (t: string) => /\b(emergency|911|police|pulis|hospital|ospital|ambulance|ambulansya|rescue|coast guard|accident|aksidente|drowning|nalulunod|nalunod|tumaob|sunog|injured|sugatan|saklolo)\b/.test(t);
export const asksTourToday = (t: string) =>
  /\b(my|ko|namin|our)\b/.test(t) && /\b(tour|booking|trip)\b/.test(t) && /\b(today|tomorrow|ngayon|bukas|tuloy|still on|on today|on tomorrow|called off|cancelled|canceled)\b/.test(t);
export const asksOpenNearMe = (t: string) =>
  (/\b(open|bukas)\b/.test(t) && /\b(near me|nearby|malapit|around here|dito)\b/.test(t)) || /\bwhat s open\b|\bwhats open\b|\banong bukas\b/.test(t);

const emergency = ability({
  name: "emergency_numbers",
  description:
    "Emergency numbers for Daet: the national 911 hotline and the Tourism Office's checked list (police, rescue, hospital, coast guard). Call it for any emergency, accident or safety question, and give 911 first. Pass need: what happened and the town, in their words (e.g. \"drowning at Mercedes\").",
  input: z.object({ need: z.string().max(200).nullable() }),
  promptLine: "For emergencies, accidents or safety, call emergency_numbers and give 911 first, then offer handoff.",
  matches: isEmergency,
  basicInput: (text) => ({ need: text.slice(0, 200) }),
  run: (ctx, input) => emergencyNumbers(ctx, input.need ?? ""),
});

const tourIsOn = ability({
  name: "tour_today",
  description:
    "Whether the signed-in tourist's tour today or tomorrow is on, called off by the operator (with the reason and what they chose), or not yet confirmed. Use it for \"is my tour on?\".",
  input: z.object({}),
  promptLine: "For \"is my tour on today?\", call tour_today.",
  matches: asksTourToday,
  basicInput: () => ({}),
  run: (ctx) => tourToday(ctx),
});

const openNear = ability({
  name: "open_near_me",
  description:
    "Places open now within 3 km of the tourist's shared location, closest first (at most 5), then places with no listed hours marked check before you go. Needs Use my location.",
  input: z.object({}),
  promptLine: "For \"what's open near me\", call open_near_me.",
  matches: asksOpenNearMe,
  basicInput: () => ({}),
  run: (ctx) => openNearMe(ctx),
});

/**
 * Order matters for basic mode: the first match answers. Emergency is first so
 * nothing can shadow it (a test pins this).
 */
export const ABILITIES: readonly Ability[] = [emergency, tourIsOn, openNear] as unknown as readonly Ability[];

/** Basic mode: the first ability that matches answers, or null when none does. */
export async function basicAbilityReply(text: string, t: string, ctx: ToolContext): Promise<string | null> {
  const found = ABILITIES.find((a) => a.matches(t));
  return found ? (await found.run(ctx, found.basicInput(text))).answer : null;
}

/** The ability guidance for the system prompt. */
export const abilityPromptLines = (): string => ABILITIES.map((a) => a.promptLine).join(" ");
