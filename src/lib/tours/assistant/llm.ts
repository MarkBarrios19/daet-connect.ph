import "server-only";
import { emergencyNumbers, openNearMe, tourToday } from "@/lib/tours/assistant/trip-day";
import type { Content, FunctionCall, Part } from "@google/genai";
import { z } from "zod/v4";
import { createGeminiClient, GEMINI_DEFAULT_MODEL, isGeminiConfigured, stopReasonOf, toJsonSchema, withBusyFallback, type GeminiClient } from "@/lib/ai/gemini";
import { assistantSystemPrompt } from "@/lib/tours/assistant/prompt";
import type { ChatTurn } from "@/lib/tours/assistant/respond";
import {
  attractionInfo,
  handoff,
  myBookings,
  planTripLink,
  policy,
  POLICY_TOPICS,
  searchTours,
  tourDetails,
  travelTime,
  upcomingEvents,
  type ToolContext,
} from "@/lib/tours/assistant/tools";
import { INTEREST_KEYS, planTrip } from "@/lib/tours/assistant/plan-tool";
import { estimateCost, findPlaces, foodStops, howToGetThere, meetingPoint } from "@/lib/tours/assistant/guide-tools";

/**
 * The travel assistant on Gemini (F13): streaming plus our own tool loop over the
 * read-only tools. On whenever GEMINI_API_KEY is set, unless ASSISTANT_LLM=off.
 * Any failure throws, and the route answers in basic mode.
 */

export function isAssistantLlmEnabled(): boolean {
  return process.env.ASSISTANT_LLM !== "off" && isGeminiConfigured();
}

const MODEL = () => process.env.ASSISTANT_MODEL || GEMINI_DEFAULT_MODEL;
const MAX_RESULT_CHARS = 6000;
const MAX_ITERATIONS = 6;
const MAX_OUTPUT_TOKENS = 4000;


/** Tool results go back as data, trimmed so one big result can't flood the context. */
const asResult = (value: unknown) => JSON.stringify(value).slice(0, MAX_RESULT_CHARS);

async function guard(run: () => unknown | Promise<unknown>): Promise<string> {
  try {
    return asResult(await run());
  } catch (error) {
    console.error("Assistant tool error:", error);
    return asResult({ error: "That lookup failed. Try again or answer without it." });
  }
}

export type AssistantTool = { name: string; description: string; inputSchema: z.ZodType; run: (input: unknown) => Promise<string> };

/**
 * A tool: its zod schema becomes the function declaration, and what the model sends is
 * checked against it. Gemini often leaves out a nullable argument, so missing ones read as null.
 */
function defineTool<S extends z.ZodObject>(def: { name: string; description: string; inputSchema: S; run: (input: z.infer<S>) => Promise<string> }): AssistantTool {
  const keys = Object.keys(def.inputSchema.shape);
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    run: async (raw) => {
      const args: Record<string, unknown> = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
      for (const key of keys) if (args[key] === undefined) args[key] = null;
      const parsed = def.inputSchema.safeParse(args);
      if (!parsed.success) return asResult({ error: "Those tool inputs were not valid. Check them and try again." });
      return def.run(parsed.data);
    },
  };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, Manila");

export function assistantTools(ctx: ToolContext): AssistantTool[] {
  return [
    defineTool({
      name: "search_tours",
      description: "Find published tours by words in the title, place or description. Optionally only tours with free seats on a date, or at most a price per person. Returns ids for tour_details.",
      inputSchema: z.object({
        query: z.string().max(60).nullable().describe("e.g. 'Calaguas', 'surf', 'island hopping'; null for all"),
        date: date.nullable(),
        maxPrice: z.number().nonnegative().nullable().describe("pesos per person"),
      }),
      run: (input) => guard(() => searchTours(ctx, input)),
    }),
    defineTool({
      name: "tour_details",
      description: "Prices, inclusions, stops, operator and the next open dates with seats left for one tour.",
      inputSchema: z.object({ packageId: z.string().describe("id from search_tours") }),
      run: (input) => guard(() => tourDetails(ctx, input)),
    }),
    defineTool({
      name: "attraction_info",
      description: "Opening hours, entrance fee and a short description of a listed place in Daet (beaches, churches, museums, parks...).",
      inputSchema: z.object({ name: z.string().max(60) }),
      run: (input) => guard(() => attractionInfo(ctx, input)),
    }),
    defineTool({
      name: "upcoming_events",
      description: "Published events in Daet between two dates (defaults to from today).",
      inputSchema: z.object({ from: date.nullable(), to: date.nullable() }),
      run: (input) => guard(() => upcomingEvents(ctx, input)),
    }),
    defineTool({
      name: "policy",
      description: "CONNECT-Daet rules and how-tos: cancel (cancellation and refunds), pay (payment methods), ticket (QR and check-in), status (booking statuses), book (how to book), rewards, plan (trip planner), contact (operators and the Tourism Office), account, getting_here (bus, plane, car to Daet), getting_around (tricycles, jeepneys, vans), boats (Calaguas and Mercedes islands).",
      inputSchema: z.object({ topic: z.enum(POLICY_TOPICS) }),
      run: (input) => guard(() => policy(ctx, input)),
    }),
    defineTool({
      name: "travel_time",
      description: "How long and how far between two places in or near Daet: listed attractions, towns (Daet, Mercedes, Vinzons, Paracale, Labo...), ports, Naga airport, and boat trips to Calaguas or the Mercedes islands. Adds a directions button.",
      inputSchema: z.object({
        from: z.string().max(60).nullable().describe("start; null means Daet town center"),
        to: z.string().max(60),
        mode: z.enum(["drive", "walk"]).nullable(),
      }),
      run: (input) => guard(() => travelTime(ctx, input)),
    }),
    defineTool({
      name: "find_places",
      description:
        "Places from the Daet Tourism Office directory: eatery (food), lodging (where to stay), terminal (bus/van terminals), pasalubong (souvenir food), meeting_point, service (Tourism Office, help). Nearest first when 'near' is given. Shows each place with a Google Maps directions button. Only recommend places this returns.",
      inputSchema: z.object({
        kind: z.enum(["eatery", "lodging", "terminal", "pasalubong", "meeting_point", "service"]),
        near: z.string().max(60).nullable().describe("a place or town, or 'me' for the traveller's shared location; null for anywhere"),
        query: z.string().max(40).nullable().describe("a dish, tag or name, e.g. 'Bicol express', 'budget', 'wifi'"),
        maxPrice: z.number().nonnegative().nullable().describe("pesos per meal or per night"),
        openNow: z.boolean().nullable(),
        limit: z.number().int().min(1).max(8).nullable(),
      }),
      run: (input) => guard(() => findPlaces(ctx, input)),
    }),
    defineTool({
      name: "food_stops",
      description: "Listed eateries close to the way between two places, for a meal stop on the road.",
      inputSchema: z.object({ from: z.string().max(60), to: z.string().max(60) }),
      run: (input) => guard(() => foodStops(ctx, input)),
    }),
    defineTool({
      name: "how_to_get_there",
      description:
        "Every listed way to travel between two places, from anywhere in the Philippines to Daet and around it: planes, buses, UV Express vans, jeepneys, tricycles, ferries and boats, chaining up to four rides (e.g. Cebu → Manila (NAIA) → Naga → Daet, or Daet → Paracale → Calaguas). For each option: the legs with fare and time, the total per person, the total time, and boat hire shared by the group. Fastest first; fares are estimates with their source and the date they were checked. Adds a transport card and a Google Maps button. Use for fares (pamasahe), routes, 'how do I get to…', and travel times between towns.",
      inputSchema: z.object({
        from: z.string().max(60).nullable().describe("start, e.g. 'Manila', 'Cebu', 'Davao', 'Daet'; null to list every way in"),
        to: z.string().max(60).describe("destination; 'Daet' when they only said where they're coming from"),
      }),
      run: (input) => guard(() => howToGetThere(ctx, input)),
    }),
    defineTool({
      name: "estimate_cost",
      description:
        "A trip cost estimate from listed fares, tour prices, meal and room prices: transport both ways, the tour, meals, rooms and a 10% buffer, with a per-person amount. Shows an itemised card. Unknown costs are listed as 'ask locally', never guessed.",
      inputSchema: z.object({
        to: z.string().max(60).nullable().describe("destination, e.g. 'Calaguas', 'Bagasbas'"),
        from: z.string().max(60).nullable().describe("where they travel from, e.g. 'Manila'; null if unknown"),
        packageId: z.string().nullable().describe("a tour id from search_tours, to include its price instead of fares"),
        people: z.number().int().min(1).max(50),
        nights: z.number().int().min(0).max(30),
        style: z.enum(["budget", "mid", "comfort"]).nullable(),
      }),
      run: (input) => guard(() => estimateCost(ctx, input)),
    }),
    defineTool({
      name: "meeting_point",
      description: "Where and when a tour's guests meet, with directions: for a tour id, or the signed-in tourist's next booking (optionally by reference).",
      inputSchema: z.object({ packageId: z.string().nullable(), bookingReference: z.string().max(40).nullable() }),
      run: (input) => guard(() => meetingPoint(ctx, input)),
    }),
    defineTool({
      name: "emergency_numbers",
      description: "Emergency numbers for Daet: the national 911 hotline and the Tourism Office's checked list (police, rescue, hospital, coast guard). Call it for any emergency, accident or safety question, and give 911 first. Pass need: what happened and the town, in their words (e.g. \"drowning at Mercedes\").",
      inputSchema: z.object({ need: z.string().max(200).nullable() }),
      run: (input) => guard(() => emergencyNumbers(ctx, input.need ?? "")),
    }),
    defineTool({
      name: "tour_today",
      description: "Whether the signed-in tourist's tour today or tomorrow is on, called off by the operator (with the reason and what they chose), or not yet confirmed. Use it for \"is my tour on?\".",
      inputSchema: z.object({}),
      run: () => guard(() => tourToday(ctx)),
    }),
    defineTool({
      name: "open_near_me",
      description: "Places open now within 3 km of the tourist's shared location, closest first (at most 5), then places with no listed hours marked check before you go. Needs Use my location.",
      inputSchema: z.object({}),
      run: () => guard(() => openNearMe(ctx)),
    }),
    defineTool({
      name: "my_bookings",
      description: "The signed-in tourist's own bookings: reference, tour, date, status, amount still due and the next step. Optionally one booking by reference (BK-...).",
      inputSchema: z.object({ reference: z.string().max(40).nullable() }),
      run: (input) => guard(() => myBookings(ctx, input)),
    }),
    defineTool({
      name: "plan_trip",
      description:
        "Draft a day-by-day plan for their trip. Call it for any request to plan or make an itinerary. Dates, group and origin come from the app, not from you. Returns {missing} when the app still needs answers (it shows a form), otherwise a summary of the plan already on screen.",
      inputSchema: z.object({
        interests: z.array(z.enum(INTEREST_KEYS as [string, ...string[]])).max(8).nullable().describe("what they want to see, from their words; null if they didn't say"),
        budgetPerDay: z.number().int().min(0).max(100000).nullable().describe("pesos per person per day for entrance fees, only if they said a budget"),
        pace: z.enum(["relaxed", "normal", "packed"]).nullable(),
      }),
      run: (input) => guard(() => planTrip(ctx, input as Parameters<typeof planTrip>[1])),
    }),
    defineTool({
      name: "plan_trip_link",
      description: "A link to the trip planner, pre-filled with the tourist's trip description, for when they want a day-by-day itinerary.",
      inputSchema: z.object({ description: z.string().max(300).describe("their trip in their words: days, group, interests, budget") }),
      run: (input) => guard(() => planTripLink(ctx, input)),
    }),
    defineTool({
      name: "handoff",
      description: "Offer to pass the conversation to a person: the booking's operator when it is about one of their bookings, otherwise the Daet Tourism Office. Shows a message they can edit and send.",
      inputSchema: z.object({
        summary: z.string().max(600).describe("first person, ready to send, with the key details"),
        bookingReference: z.string().max(40).nullable(),
      }),
      run: (input) => guard(() => handoff(ctx, input)),
    }),
  ];
}

/**
 * Streams the reply through `onText`. Resolves when done; throws when the
 * model can't be used (the caller falls back to basic mode if nothing was
 * streamed yet). Tool calls run here, up to MAX_ITERATIONS rounds.
 */
export async function runAssistant(
  ctx: ToolContext,
  history: ChatTurn[],
  onText: (delta: string) => void,
  client: GeminiClient = createGeminiClient({ timeoutMs: 30_000 }),
): Promise<{ stopReason: string | null }> {
  const tools = assistantTools(ctx);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const declarations = tools.map((tool) => ({ name: tool.name, description: tool.description, parametersJsonSchema: toJsonSchema(tool.inputSchema) }));
  const system = assistantSystemPrompt({ today: ctx.today, signedIn: Boolean(ctx.userId), trip: ctx.trip });
  const contents: Content[] = history.map((turn) => ({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.content }] }));
  // The photo goes with the latest message only.
  if (ctx.image) contents[contents.length - 1].parts!.push({ inlineData: { mimeType: ctx.image.mimeType, data: ctx.image.data } });

  let stopReason: string | null = null;
  for (let round = 0; round < MAX_ITERATIONS; round++) {
    // Google's "high demand" errors come when the stream opens, before any text, so another try is safe.
    const stream = await withBusyFallback(MODEL(), (model) =>
      client.models.generateContentStream({
        model,
        contents,
        config: { systemInstruction: system, tools: [{ functionDeclarations: declarations }], maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
    );

    // Parts are kept as received (thought signatures included) so the next round can send them back.
    const modelParts: Part[] = [];
    const calls: FunctionCall[] = [];
    let last: { promptFeedback?: { blockReason?: string }; candidates?: Array<{ finishReason?: string }> } = {};
    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        modelParts.push(part);
        if (part.thought) continue;
        if (part.text) onText(part.text);
        if (part.functionCall) calls.push(part.functionCall);
      }
      if (chunk.promptFeedback?.blockReason) last = { ...last, promptFeedback: chunk.promptFeedback };
      if (candidate?.finishReason) last = { ...last, candidates: [{ finishReason: candidate.finishReason }] };
    }

    stopReason = stopReasonOf(last);
    if (stopReason === "refusal") break;
    // A cut-off turn may carry a truncated tool call; don't run it.
    if (!calls.length || stopReason === "max_tokens") break;

    const results: Part[] = [];
    for (const call of calls) {
      const tool = call.name ? byName.get(call.name) : undefined;
      const output = tool ? await tool.run(call.args ?? {}) : JSON.stringify({ error: "Unknown tool." });
      results.push({ functionResponse: { id: call.id, name: call.name, response: { result: output } } });
    }
    contents.push({ role: "model", parts: modelParts }, { role: "user", parts: results });
    stopReason = "tool_limit";
  }
  return { stopReason };
}
