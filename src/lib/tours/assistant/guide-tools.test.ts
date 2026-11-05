import { fakeSupabase } from "@/lib/tours/assistant/__fixtures__/fake-supabase";
import { basicReply } from "@/lib/tours/assistant/basic";
import { estimateCost, findPlaces, foodStops, howToGetThere, meetingPoint } from "@/lib/tours/assistant/guide-tools";
import { isMeetingQuestion, readCostQuestion, readDirectionsQuestion, readPlaceQuestion } from "@/lib/tours/assistant/guide-intents";
import { assistantSystemPrompt } from "@/lib/tours/assistant/prompt";
import { cleanHistory } from "@/lib/tours/assistant/respond";
import type { ToolContext } from "@/lib/tours/assistant/tools";

const place = (over: Record<string, unknown>) => ({
  kind: "eatery", municipality: "Daet", address: null, latitude: null, longitude: null, price_min: null, price_max: null, price_unit: null,
  specialties: [], tags: [], opening_hours: null, description: null, source: "test", checked_on: "2026-10-29", verified: false, is_active: true, ...over,
});
const fare = (over: Record<string, unknown>) => ({
  mode: "bus", fare_min: null, fare_max: null, fare_per: "person", minutes_min: null, minutes_max: null, schedule_note: null, source: "test",
  checked_on: "2026-10-29", verified: false, is_active: true, board_place_id: null, ...over,
});

const TABLES = {
  tours_guide_places: [
    place({ id: "p1", name: "Bagasbas Beach eateries", slug: "bbe", latitude: 14.1316, longitude: 122.9851, specialties: ["sinantolan"] }),
    place({ id: "p2", name: "Town Carinderia", slug: "tc", latitude: 14.1125, longitude: 122.9555, price_min: 80, price_max: 150, price_unit: "meal", verified: true }),
    place({ id: "p3", name: "Far Grill", slug: "fg", latitude: 14.29, longitude: 122.69 }),
    place({ id: "p4", name: "Dolor Hotel", slug: "dh", kind: "lodging", price_min: 650, price_unit: "night" }),
    place({ id: "p5", name: "Hidden", slug: "h", is_active: false }),
  ],
  tours_fares: [
    fare({ id: "f1", from_name: "Manila (PITX)", to_name: "Daet", fare_min: 801, fare_max: 801, minutes_min: 540, minutes_max: 720 }),
    fare({ id: "f2", mode: "tricycle", from_name: "Daet town center", to_name: "Bagasbas", fare_min: 30, fare_max: 30, minutes_min: 10, minutes_max: 15, schedule_note: "Agree on the fare first." }),
  ],
  tours_attractions: [
    { id: "a1", name: "Bagasbas Beach", slug: "bagasbas-beach", category: "beach", municipality: "Daet", latitude: 14.131583, longitude: 122.985083, is_active: true },
    { id: "a2", name: "First José Rizal Monument", slug: "first-rizal-monument", category: "heritage", municipality: "Daet", latitude: 14.1131, longitude: 122.9545, is_active: true },
    { id: "a3", name: "Daet Heritage Center", slug: "daet-heritage-center", category: "heritage", municipality: "Daet", latitude: 14.1128, longitude: 122.9560, is_active: true },
  ],
  tours_packages: [
    {
      id: "aa000000-0000-4000-8000-000000000001", title: "Calaguas Day Trip", location_name: "Calaguas", status: "published",
      meeting_point_name: "Vinzons fish port", meeting_lat: "14.1736", meeting_lng: "122.9083", meeting_time: "05:30:00",
      tours_package_stops: [{ location_name: "Mahabang Buhangin", stop_order: 1, latitude: null, longitude: null }],
      tours_package_price_variants: [{ price_per_pax: "1500", flat_price: null, is_default: true }],
    },
  ],
  tours_bookings: [{ user_id: "u1", package_id: "aa000000-0000-4000-8000-000000000001", tour_date: "2026-11-04", booking_reference: "BK-1", status: "confirmed" }],
};

const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({ supabase: fakeSupabase(TABLES), userId: null, today: "2026-10-29", cards: [], ...over });

describe("guide intents (basic mode)", () => {
  it("reads place questions", () => {
    expect(readPlaceQuestion("Where to eat near Bagasbas?")).toEqual({ kind: "eatery", near: "bagasbas", budget: false, sights: false });
    expect(readPlaceQuestion("What's near First José Rizal Monument? Food and places to see.")).toEqual({ kind: "eatery", near: "first jose rizal monument", budget: false, sights: true });
    expect(readPlaceQuestion("Food near the town plaza for 4 people")).toMatchObject({ near: "the town plaza" });
    expect(readPlaceQuestion("Saan pwede kumain malapit dito?")).toMatchObject({ kind: "eatery", near: "me" });
    expect(readPlaceQuestion("cheap hotel in Daet")).toEqual({ kind: "lodging", near: "daet", budget: true, sights: false });
    expect(readPlaceQuestion("open dates for Calaguas")).toBeNull();
  });

  it("reads directions in English and Taglish", () => {
    expect(readDirectionsQuestion("Paano pumunta sa Daet from Manila?")).toEqual({ from: "manila", to: "daet" });
    expect(readDirectionsQuestion("How do I get to Daet from Manila by bus?")).toEqual({ from: "manila", to: "daet" });
    expect(readDirectionsQuestion("how to get from Daet to Bagasbas")).toEqual({ from: "daet", to: "bagasbas" });
    expect(readDirectionsQuestion("How do I get to Calaguas?")).toEqual({ from: null, to: "calaguas" });
    expect(readDirectionsQuestion("Where to eat?")).toBeNull();
  });

  it("reads cost questions", () => {
    expect(readCostQuestion("Budget for 2 days in Calaguas?")).toEqual({ to: "calaguas", from: null, people: 2, nights: 1, style: "mid" });
    expect(readCostQuestion("Magkano lahat for 4 pax, 3 nights sa Bagasbas galing Manila, tipid lang")).toMatchObject({ people: 4, nights: 3, from: "manila", style: "budget" });
    expect(readCostQuestion("Where is my ticket?")).toBeNull();
    expect(isMeetingQuestion("Where do we meet for my tour?")).toBe(true);
    expect(isMeetingQuestion("Saan kami magkikita?")).toBe(true);
  });
});

describe("guide tools", () => {
  it("finds places nearest first, with Google Maps directions, and skips hidden ones", async () => {
    const c = ctx();
    const result = await findPlaces(c, { kind: "eatery", near: "Bagasbas" });
    expect(result.places.map((p) => p.name)).toEqual(["Bagasbas Beach eateries", "Town Carinderia", "Far Grill"]);
    const card = c.cards[0];
    expect(card).toMatchObject({ type: "place", name: "Bagasbas Beach eateries", verified: false, directionsHref: "https://www.google.com/maps/dir/?api=1&destination=14.131600%2C122.985100&travelmode=driving" });
    expect(result.note).toMatch(/verify locally/);
  });

  it("uses the shared location for 'near me', or asks for it", async () => {
    const here = await findPlaces(ctx({ here: { lat: 14.112, lng: 122.955 } }), { kind: "eatery", near: "me", limit: 1 });
    expect(here.places.map((p) => p.name)).toEqual(["Town Carinderia"]);
    const c = ctx();
    await findPlaces(c, { kind: "eatery", near: "me" });
    expect(c.cards[0]).toEqual({ type: "link", href: "#share-location", label: "Use my location" });
  });

  it("lists eateries along a route", async () => {
    const result = await foodStops(ctx(), { from: "Daet", to: "Bagasbas" });
    expect("stops" in result && result.stops?.map((s) => s.name)).toEqual(["Bagasbas Beach eateries", "Town Carinderia"]);
  });

  it("explains how to get there with fares, joining legs through Daet", async () => {
    const c = ctx();
    const result = await howToGetThere(c, { from: "Manila", to: "Bagasbas" });
    expect("routes" in result && result.routes?.[0].legs.map((l) => `${l.how}: ${l.fare}`)).toEqual(["Bus: ₱801.00 per person", "Tricycle: ₱30.00 per person"]);
    expect(c.cards.map((x) => x.type)).toEqual(["transport", "link"]);
  });

  it("estimates a trip from listed prices only", async () => {
    const c = ctx();
    const result = await estimateCost(c, { to: "Bagasbas", from: "Manila", people: 2, nights: 1, style: "budget" });
    expect(result.estimate.lines.map((l) => l.item)).toEqual(["Bus: Manila (PITX) to Daet", "Tricycle: Daet town center to Bagasbas", "Meals", "Stay: Dolor Hotel", "Extra for the unexpected (10%)"]);
    expect(c.cards[0]).toMatchObject({ type: "cost", title: "2 people, 1 night, Bagasbas" });
    const tour = await estimateCost(ctx(), { packageId: "aa000000-0000-4000-8000-000000000001", people: 2, nights: 0 });
    expect(tour.estimate.lines[0]).toMatchObject({ item: "Tour: Calaguas Day Trip", amount: "₱3,000.00" });
  });

  it("finds the meeting point of a tour or of the tourist's next booking", async () => {
    const c = ctx({ userId: "u1" });
    const result = await meetingPoint(c, {});
    expect(result).toMatchObject({ meetingPoint: "Vinzons fish port", time: "5:30 AM", date: "2026-11-04", fromFirstStop: false });
    expect(c.cards[0]).toMatchObject({ type: "place", kind: "Meeting point", directionsHref: expect.stringContaining("destination=14.173600%2C122.908300") });
    expect(await meetingPoint(ctx(), {})).toMatchObject({ signedIn: false });
  });
});

describe("basic mode as a local guide", () => {
  it("answers food, directions, cost and meeting questions without the AI", async () => {
    const c = ctx();
    expect(await basicReply("Where to eat near Bagasbas?", c)).toMatch(/^Food near bagasbas: Bagasbas Beach eateries/);
    // A Tagalog question gets a Tagalog answer: each leg, the total per person, and a reminder to confirm.
    const directions = await basicReply("Paano pumunta sa Bagasbas from Manila?", ctx());
    expect(directions).toMatch(/^Mula Manila papunta sa Bagasbas/);
    expect(directions).toContain("1. Bus Manila (PITX) → Daet (₱801.00 bawat tao, 9–12 oras) → Tricycle Daet town center → Bagasbas (₱30.00 bawat tao");
    expect(directions).toContain("Kabuuan: ₱831.00 bawat tao");
    expect(directions).toMatch(/kumpirmahin muna/);
    expect(await basicReply("Budget for 2 days in Bagasbas from Manila?", ctx())).toMatch(/^Estimated total ₱/);
    expect(await basicReply("Where do we meet for my tour?", ctx({ userId: "u1" }))).toMatch(/meet at Vinzons fish port at 5:30 AM on 2026-11-04/);
    expect(await basicReply("Saan pwede kumain malapit dito?", ctx())).toMatch(/Use my location/);
  });
});

describe("assistant setup", () => {
  it("takes a shared location rounded to about 100 m", () => {
    const result = cleanHistory({ messages: [{ role: "user", content: "food near me" }], location: { lat: 14.112345, lng: 122.955678 } });
    expect("here" in result && result.here).toEqual({ lat: 14.112, lng: 122.956 });
  });

  it("introduces itself as the Daet AI assistant and keeps to listed places", () => {
    const prompt = assistantSystemPrompt({ today: "2026-10-29", signedIn: false });
    expect(prompt).toMatch(/Daet AI assistant/);
    expect(prompt).toMatch(/never name a restaurant, hotel, fare or price from memory/);
  });
});

describe("food and places to see near a named place (basic mode)", () => {
  it("reads the place from its own clause, finds it without the accent, and lists the closest food and sights", async () => {
    const { basicReply } = await import("@/lib/tours/assistant/basic");
    const c = ctx();
    const reply = await basicReply("What's near First José Rizal Monument? Food and places to see.", c);
    expect(reply).toMatch(/^Food near First José Rizal Monument: Town Carinderia, \d+ m/);
    expect(reply).toMatch(/Places to see nearby: Daet Heritage Center \(\d+ m\)/);
    expect(reply).not.toMatch(/Places to see nearby: First José Rizal Monument/);
    expect(c.cards).toContainEqual(expect.objectContaining({ type: "link", href: "/tours/attractions/daet-heritage-center" }));
  });
});

describe("place card map links", () => {
  it("opens Google Maps on the place by name (so the map shows it), and directions at its pin", async () => {
    const { placeCard } = await import("@/lib/tours/assistant/guide-tools");
    const card = placeCard({ ...(TABLES.tours_guide_places[1] as never), distanceM: 20 });
    expect(new URL(card.mapHref).searchParams.get("query")).toBe("Town Carinderia, Daet, Camarines Norte");
    expect(card.directionsHref).toContain("destination=14.112500%2C122.955500");
    // 20 m is the place itself, not a distance.
    expect(card.distance).toBeNull();
  });
});
