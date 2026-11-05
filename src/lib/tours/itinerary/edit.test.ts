import { contextToInput, dayOrders, planAttractionIds, removeStop, reorderDays, stopChoices, swapStop } from "@/lib/tours/itinerary/edit";
import { generatePlan } from "@/lib/tours/itinerary/schedule";
import type { PlannerAttraction, Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";

const places: PlannerAttraction[] = [
  { id: "rizal", name: "First Rizal Monument", category: "heritage", lat: 14.1131, lng: 122.9545, hours: null, dwellMinutes: 20, fee: null },
  { id: "church", name: "Daet Cathedral", category: "religious", lat: 14.1125, lng: 122.955, hours: null, dwellMinutes: 30, fee: null },
  { id: "bagasbas", name: "Bagasbas Beach", category: "beach", lat: 14.131583, lng: 122.985083, hours: null, dwellMinutes: 120, fee: null },
  { id: "market", name: "Daet Market", category: "shopping", lat: 14.114, lng: 122.956, hours: null, dwellMinutes: 40, fee: null },
  { id: "park", name: "Daet Park", category: "park", lat: 14.115, lng: 122.957, hours: null, dwellMinutes: 30, fee: 20 },
  { id: "falls", name: "Mananap Falls", category: "nature", lat: 14.05, lng: 122.9, hours: null, dwellMinutes: 90, fee: 50 },
];
const byId = new Map(places.map((a) => [a.id, a]));
const prefs: Preferences = { startDate: "2026-11-06", days: 1, budgetPerDay: 500, interests: ["beach", "heritage"], pace: "relaxed", groupSize: 2, dayStart: 480, dayEnd: 1080 };

describe("contextToInput", () => {
  it("takes dates and the group from the form, and wants from the words", () => {
    const input = contextToInput({ dates: { start: "2026-11-10", end: "2026-11-12" }, travelers: { adults: 2, children: [6, 9] } }, { interests: ["beach"], budgetPerDay: null, pace: "relaxed" });
    expect(input).toMatchObject({ startDate: "2026-11-10", days: 3, groupSize: 4, budgetPerDay: 500, interests: ["beach"], pace: "relaxed" });
    expect(contextToInput({ dates: null, travelers: { adults: 1, children: [] } }, {})).toBeNull();
  });
});

describe("swapStop and removeStop", () => {
  const plan = generatePlan(places, prefs);
  const first = planAttractionIds(plan)[0];

  it("replaces a stop with a place not already in the plan, and the result is valid", () => {
    const next = swapStop(plan, 0, first, places, prefs)!;
    expect(next).not.toBeNull();
    const ids = planAttractionIds(next);
    expect(ids).not.toContain(first);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(planAttractionIds(plan).length);
    expect(validatePlan(next, byId, prefs).ok).toBe(true);
  });

  it("returns null when the stop isn't in that day or nothing else fits", () => {
    expect(swapStop(plan, 0, "nope", places, prefs)).toBeNull();
    const only = places.filter((a) => planAttractionIds(plan).includes(a.id));
    expect(swapStop(plan, 0, first, only, prefs)).toBeNull();
  });

  it("removes a stop and re-times the day", () => {
    const next = removeStop(plan, 0, first, places, prefs);
    expect(planAttractionIds(next)).not.toContain(first);
    expect(next.totals.visits).toBe(plan.totals.visits - 1);
  });

  it("regenerate leaves out the places already planned", () => {
    const again = generatePlan(places, prefs, { exclude: new Set(planAttractionIds(plan)) });
    expect(planAttractionIds(again).some((id) => planAttractionIds(plan).includes(id))).toBe(false);
  });
});

describe("reorderDays", () => {
  const two: Preferences = { ...prefs, days: 2 };
  const plan = generatePlan(places, two);

  it("re-times a day in the traveller's order, and the result is valid", () => {
    const orders = dayOrders(plan);
    const reversed = [...orders[0]].reverse();
    const result = reorderDays(plan, [reversed, orders[1]], places, two);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dayOrders(result.plan)[0]).toEqual(reversed);
    expect(result.plan.days[1]).toBe(plan.days[1]);
    expect(validatePlan(result.plan, byId, two).ok).toBe(true);
  });

  it("moves a stop to another day", () => {
    const orders = dayOrders(plan);
    const moved = orders[0][0];
    const result = reorderDays(plan, [orders[0].slice(1), [...orders[1], moved]], places, two);
    expect(result.ok && dayOrders(result.plan)[1].includes(moved)).toBe(true);
  });

  it("refuses unknown or repeated places, and a day count that doesn't match", () => {
    const orders = dayOrders(plan);
    expect(reorderDays(plan, [["nope"], orders[1]], places, two)).toMatchObject({ ok: false, message: expect.stringMatching(/no longer listed/) });
    expect(reorderDays(plan, [[orders[0][0], orders[0][0]], orders[1]], places, two)).toMatchObject({ ok: false, message: expect.stringMatching(/already in your plan/) });
    expect(reorderDays(plan, [orders[0]], places, two)).toMatchObject({ ok: false });
  });

  it("says why an order doesn't fit", () => {
    const closedLate = places.map((a) => (a.id === "rizal" ? { ...a, hours: { mon: [["08:00", "09:00"]], tue: [["08:00", "09:00"]], wed: [["08:00", "09:00"]], thu: [["08:00", "09:00"]], fri: [["08:00", "09:00"]], sat: [["08:00", "09:00"]], sun: [["08:00", "09:00"]] } as never } : a));
    const result = reorderDays({ days: [{ date: "2026-11-06", blocks: [] }], totals: { cost: 0, travelMinutes: 0, visits: 0 } }, [["bagasbas", "falls", "rizal"]], closedLate, prefs);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/^That order doesn't fit Day 1: /) });
  });
});

describe("stopChoices", () => {
  it("offers places not in the plan, best first, at most the limit", () => {
    const plan = generatePlan(places, prefs);
    const choices = stopChoices(plan, 0, places, prefs, 3);
    expect(choices.length).toBeLessThanOrEqual(3);
    for (const c of choices) expect(planAttractionIds(plan)).not.toContain(c.id);
  });
});

describe("ordersFromRows", () => {
  it("keeps the saved order per day and skips lunch, unknown and repeated places", () => {
    const { ordersFromRows } = jest.requireActual("@/lib/tours/itinerary/edit") as typeof import("@/lib/tours/itinerary/edit");
    const rows = [
      { day_number: 2, item_order: 1, item_kind: "visit", attraction_id: "c" },
      { day_number: 1, item_order: 2, item_kind: "visit", attraction_id: "b" },
      { day_number: 1, item_order: 1, item_kind: "visit", attraction_id: "a" },
      { day_number: 1, item_order: 3, item_kind: "lunch", attraction_id: null },
      { day_number: 2, item_order: 2, item_kind: "visit", attraction_id: "a" },
      { day_number: 4, item_order: 1, item_kind: "visit", attraction_id: "d" },
    ];
    expect(ordersFromRows(rows, 2)).toEqual([["a", "b"], ["c"]]);
  });
});
