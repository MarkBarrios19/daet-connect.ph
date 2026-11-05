import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { basicReply } from "@/lib/tours/assistant/basic";
import { isPlanRequest, missingInputs, TripContextSchema, type MissingInput, type TripContext } from "@/lib/tours/assistant/context";
import type { AssistantCard, ToolContext } from "@/lib/tours/assistant/tools";

/**
 * One assistant turn as a stream of events (newline-delimited JSON on the
 * wire). Dependencies are injected so it can be tested without Next or a
 * real model: `runAi` streams text and throws when the model can't be used.
 */

export const ASSISTANT_MESSAGE_MAX = 1000;
export const ASSISTANT_HISTORY_MAX = 12;

export const AssistantRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(40),
  /** Only when the traveller tapped "Use my location" for this message; used for "near me", never stored. */
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
  /** The page it was opened on and the trip answers so far (dates, travellers, origin). */
  context: TripContextSchema.nullable().optional(),
});

/** About 100 m: enough for "nearest eatery", without an exact position. */
export const roundLocation = (p: { lat: number; lng: number }) => ({ lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 });

export type AssistantEvent =
  | { t: "mode"; mode: "ai" | "basic" }
  | { t: "text"; v: string }
  | { t: "cards"; cards: AssistantCard[] }
  /** The planner needs these answers before it drafts; the client shows the "Before I draft" card. */
  | { t: "questions"; missing: MissingInput[]; prefill: TripContext | null }
  | { t: "done" }
  | { t: "error"; message: string };

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type RespondDeps = {
  supabase: SupabaseClient;
  userId: string | null;
  today: string;
  /** Whether the AI may be used for this call (key configured and within the limit). */
  aiAllowed: boolean;
  /** Road legs for travel_time (the cached Routes API); estimates when missing. */
  route?: ToolContext["route"];
  /** Ask for dates, travellers and origin before a plan request (TRIP_PLANNER_V2 is not "off"). */
  tripQuestions?: boolean;
  runAi: (ctx: ToolContext, history: ChatTurn[], onText: (delta: string) => void) => Promise<{ stopReason: string | null }>;
};

/** Validates and trims the conversation; null when it isn't usable. */
export function cleanHistory(raw: unknown): { history: ChatTurn[]; here: { lat: number; lng: number } | null; trip: TripContext | null } | { error: string } {
  const parsed = AssistantRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: "Send a message to the assistant." };
  const turns = parsed.data.messages.map((m) => ({ role: m.role, content: m.content.replace(/\s+$/g, "").trim() })).filter((m) => m.content);
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return { error: "Send a message to the assistant." };
  if (last.content.length > ASSISTANT_MESSAGE_MAX) return { error: `Keep messages under ${ASSISTANT_MESSAGE_MAX} characters.` };
  let history = turns.slice(-ASSISTANT_HISTORY_MAX).map((m) => ({ ...m, content: m.content.slice(0, m.role === "user" ? ASSISTANT_MESSAGE_MAX : 2000) }));
  // The API needs the conversation to start with the tourist.
  while (history.length && history[0].role !== "user") history = history.slice(1);
  return { history, here: parsed.data.location ? roundLocation(parsed.data.location) : null, trip: parsed.data.context ?? null };
}

export async function* respond(raw: unknown, deps: RespondDeps): AsyncGenerator<AssistantEvent> {
  const cleaned = cleanHistory(raw);
  if ("error" in cleaned) {
    yield { t: "error", message: cleaned.error };
    return;
  }
  const { history, here, trip } = cleaned;
  const ctx: ToolContext = { supabase: deps.supabase, userId: deps.userId, today: deps.today, cards: [], route: deps.route, here, trip };

  // A plan needs dates, who is coming and where from. Ask once, before any model call.
  const latest = history[history.length - 1].content;
  if (deps.tripQuestions && trip && isPlanRequest(latest)) {
    const missing = missingInputs(trip, deps.today);
    if (missing.length) {
      yield { t: "mode", mode: deps.aiAllowed ? "ai" : "basic" };
      yield { t: "questions", missing, prefill: trip };
      yield { t: "text", v: "Before I draft your plan, I need three things: your dates, who is coming, and where you are travelling from." };
      yield { t: "done" };
      return;
    }
  }

  if (deps.aiAllowed) {
    const queue: string[] = [];
    let streamed = false;
    let wake: (() => void) | null = null;
    let finished = false;
    let failure: unknown = null;
    let stopReason: string | null = null;
    const run = deps
      .runAi(ctx, history, (delta) => {
        queue.push(delta);
        streamed = true;
        wake?.();
      })
      .then((result) => {
        stopReason = result.stopReason;
      })
      .catch((error) => {
        failure = error;
      })
      .finally(() => {
        finished = true;
        wake?.();
      });

    yield { t: "mode", mode: "ai" };
    while (!finished || queue.length) {
      if (queue.length) {
        yield { t: "text", v: queue.splice(0, queue.length).join("") };
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
        if (finished || queue.length) resolve();
      });
      wake = null;
    }
    await run;

    if (!failure && streamed && stopReason !== "refusal") {
      if (stopReason === "max_tokens") yield { t: "text", v: "…" };
      yield { t: "cards", cards: ctx.cards };
      yield { t: "done" };
      return;
    }
    if (failure) console.error("Assistant AI error, using basic mode:", failure);
    if (streamed) {
      // Part of an answer already went out: close it rather than start over.
      yield { t: "text", v: failure ? "\n\nSorry, I lost the connection there. Please ask again." : "" };
      yield { t: "cards", cards: ctx.cards };
      yield { t: "done" };
      return;
    }
    ctx.cards.length = 0;
  }

  yield { t: "mode", mode: "basic" };
  try {
    const text = await basicReply(history[history.length - 1].content, ctx);
    yield { t: "text", v: text };
  } catch (error) {
    console.error("Assistant basic mode error:", error);
    yield { t: "text", v: "Sorry, something went wrong. Please try again in a moment." };
  }
  yield { t: "cards", cards: ctx.cards };
  yield { t: "done" };
}
