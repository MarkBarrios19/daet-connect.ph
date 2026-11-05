import { fakeSupabase, type Tables } from "@/lib/tours/assistant/__fixtures__/fake-supabase";
import { describeItinerary, fareOrigins, gettingThereFrom, planTrip, wantsFromText } from "@/lib/tours/assistant/plan-tool";
import { respond, type AssistantEvent, type RespondDeps } from "@/lib/tours/assistant/respond";
import type { ToolContext } from "@/lib/tours/assistant/tools";

const TODAY = "2026-11-05";
const attraction = (id: string, name: string, category: string, lat: number, lng: number, fee: number | null = null) => ({
  id, name, slug: id, category, description: "", municipality: "Daet", address: null, latitude: String(lat), longitude: String(lng), location_verified: true,
  opening_hours: null, hours_note: null, dwell_minutes: 60, entrance_fee: fee === null ? null : String(fee), photo_url: null, source: null, is_active: true,
});
const tables = (): Tables => ({
  tours_attractions: [
    attraction("bagasbas", "Bagasbas Beach", "beach", 14.1316, 122.9851),
    attraction("rizal", "First Rizal Monument", "heritage", 14.1131, 122.9545),
    attraction("church", "Daet Cathedral", "religious", 14.1125, 122.955),
    attraction("park", "Daet Park", "park", 14.115, 122.957, 20),
  ],
  tours_fares: [
    { id: "f1", mode: "bus", from_name: "Manila (PITX)", to_name: "Daet", board_place_id: null, fare_min: "752", fare_max: "950", fare_per: "person", minutes_min: 480, minutes_max: 540, schedule_note: null, source: "test", checked_on: "2026-11-05", verified: false, is_active: true },
  ],
  tours_packages: [
    {
      id: "pkg1", title: "Bagasbas Surf Lesson", cover_image_url: null, status: "published",
      tours_package_stops: [{ location_name: "Bagasbas", latitude: "14.1317", longitude: "122.9850" }],
      tours_package_price_variants: [{ price_per_pax: 800, flat_price: null, is_default: true }],
      tours_package_inclusions: [{ item_text: "Board", is_included: true }, { item_text: "Lunch", is_included: false }],
      tours_operators: { business_name: "Bagasbas Coast Tours", accreditation_status: "approved" },
    },
  ],
});
const trip = { dates: { start: "2026-11-10", end: "2026-11-11" }, travelers: { adults: 2, children: [6] }, origin: { city: "Manila" } };
const ctx = (overrides: Partial<ToolContext> = {}): ToolContext => ({ supabase: fakeSupabase(tables()), userId: null, today: TODAY, cards: [], trip, ...overrides });

describe("planTrip", () => {
  it("drafts from the form's dates and group, with bookable tours from the database", async () => {
    const c = ctx();
    const labels: string[] = [];
    c.onStatus = (l) => labels.push(l);
    const result = await planTrip(c, { interests: ["beach"], budgetPerDay: null, pace: null });
    expect(c.itinerary?.plan.days.map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(c.itinerary?.input.groupSize).toBe(3);
    expect(c.itinerary?.packages[0]).toMatchObject({ id: "pkg1", verified: true, price: { amount: 800, perPerson: true }, notIncluded: ["Lunch"], operatorName: "Bagasbas Coast Tours" });
    expect(labels).toEqual(["Checking places", "Checking operators"]);
    expect(c.itinerary?.gettingThere).toMatchObject({ from: "Manila", checkedOn: "2026-11-05", card: { title: "Manila to Daet" } });
    expect(c.itinerary?.gettingThere?.card?.options[0].legs[0]).toMatchObject({ mode: "Bus", from: "Manila (PITX)", fare: "₱752.00–₱950.00 per person" });
    expect(JSON.stringify(result)).toContain("Bagasbas Beach");
    expect(JSON.stringify(result)).not.toContain("800");
  });

  it("asks for the form instead when answers are missing", async () => {
    const c = ctx({ trip: { origin: { city: "Naga" } } });
    const result = await planTrip(c, { interests: null, budgetPerDay: null, pace: null });
    expect(result).toHaveProperty("missing", ["dates", "travelers"]);
    expect(c.questions).toEqual(["dates", "travelers"]);
    expect(c.itinerary).toBeUndefined();
  });

  it("reads interests and pace from plain words in basic mode", () => {
    expect(wantsFromText("relaxed beach days please", ctx())).toMatchObject({ interests: ["beach"], pace: "relaxed" });
  });
});

describe("respond with a plan", () => {
  const collect = async (gen: AsyncGenerator<AssistantEvent>) => {
    const out: AssistantEvent[] = [];
    for await (const e of gen) out.push(e);
    return out;
  };
  const deps = (overrides: Partial<RespondDeps> = {}): RespondDeps => ({ supabase: fakeSupabase(tables()), userId: null, today: TODAY, aiAllowed: true, tripQuestions: true, runAi: async () => ({ stopReason: "end_turn" }), ...overrides });
  const ask = { messages: [{ role: "user", content: "Plan 2 days of beaches for us" }], context: trip };

  it("streams status, the explanation, then the plan from the tool result and follow-ups", async () => {
    const events = await collect(
      respond(ask, deps({
        runAi: async (c, _h, onText) => {
          await planTrip(c, { interests: ["beach"], budgetPerDay: null, pace: null });
          onText("Two easy beach days.");
          return { stopReason: "end_turn" };
        },
      })),
    );
    const kinds = events.map((e) => e.t);
    expect(kinds).toEqual(["mode", "status", "status", "text", "itinerary", "choices", "cards", "done"]);
    expect(events.find((e) => e.t === "itinerary")).toMatchObject({ itinerary: { packages: [{ id: "pkg1" }] } });
  });

  it("drafts the plan anyway when the model answers a plan request without the tool", async () => {
    const events = await collect(respond(ask, deps({ runAi: async (_c, _h, onText) => { onText("Sure!"); return { stopReason: "end_turn" }; } })));
    expect(events.map((e) => e.t)).toContain("itinerary");
  });

  it("drafts the same plan in basic mode with a templated line", async () => {
    const events = await collect(respond(ask, deps({ aiAllowed: false })));
    expect(events.map((e) => e.t)).toEqual(["mode", "text", "itinerary", "choices", "cards", "done"]);
    expect(events[0]).toEqual({ t: "mode", mode: "basic" });
    expect((events[1] as { v: string }).v).toMatch(/^Here is a 2-day plan with \d+ stops/);
  });

  it("falls back to the basic plan when the model fails before saying anything", async () => {
    const events = await collect(respond(ask, deps({ runAi: async () => { throw new Error("down"); } })));
    expect(events.filter((e) => e.t === "mode").map((e) => (e as { mode: string }).mode)).toEqual(["ai", "basic"]);
    expect(events.map((e) => e.t)).toContain("itinerary");
  });
});

describe("gettingThereFrom", () => {
  it("is null without a city and has no card when no fares are listed", async () => {
    expect(await gettingThereFrom(ctx(), null)).toBeNull();
    expect(await gettingThereFrom(ctx(), "Davao")).toEqual({ from: "Davao", card: null, checkedOn: null });
  });
});

describe("describeItinerary", () => {
  it("says when nothing fits", async () => {
    const c = ctx();
    await planTrip(c, { interests: null, budgetPerDay: null, pace: null });
    const empty = { ...c.itinerary!, plan: { days: [], totals: { cost: 0, travelMinutes: 0, visits: 0 } } };
    expect(describeItinerary(empty)).toMatch(/couldn't fit/);
  });
});

describe("fareOrigin", () => {
  it("starts Quezon City at the Cubao terminals and other Metro Manila cities at Manila", () => {
    expect(fareOrigins("Quezon City")).toEqual(["Manila (Cubao)", "Manila"]);
    expect(fareOrigins("Makati")).toEqual(["Manila"]);
    expect(fareOrigins("Naga")).toEqual([]);
  });
});
