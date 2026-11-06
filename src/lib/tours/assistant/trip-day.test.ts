import { fakeSupabase, type Tables } from "@/lib/tours/assistant/__fixtures__/fake-supabase";
import { asksOpenNearMe, asksTourToday, basicReply, isEmergency } from "@/lib/tours/assistant/basic";
import { emergencyNumbers, openNearMe, tourToday } from "@/lib/tours/assistant/trip-day";
import { emergencyAnswer } from "@/lib/tours/emergency/contacts";
import type { ToolContext } from "@/lib/tours/assistant/tools";

const TODAY = "2026-11-07";
const ctx = (tables: Tables, extra: Partial<ToolContext> = {}): ToolContext => ({ supabase: fakeSupabase(tables), userId: null, today: TODAY, cards: [], ...extra });
const ALWAYS = { mon: [["00:00", "23:59"]], tue: [["00:00", "23:59"]], wed: [["00:00", "23:59"]], thu: [["00:00", "23:59"]], fri: [["00:00", "23:59"]], sat: [["00:00", "23:59"]], sun: [["00:00", "23:59"]] };
const NEVER = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
const here = { lat: 14.112, lng: 122.955 };
const attraction = (name: string, lat: number, lng: number, opening_hours: unknown) => ({ id: name, name, slug: name.toLowerCase().replace(/ /g, "-"), category: "heritage", latitude: lat, longitude: lng, opening_hours, is_active: true, municipality: "Daet" });

describe("emergency numbers (decisions 22, 32)", () => {
  it("gives 911 alone until the Tourism Office adds numbers", async () => {
    const c = ctx({ tours_emergency_contacts: [] });
    const result = await emergencyNumbers(c);
    expect(result.answer).toMatch(/^In an emergency, call 911/);
    expect(result.answer).toMatch(/tell your guide or operator/);
    expect(c.cards).toContainEqual({ type: "link", href: "tel:911", label: "Call 911" });
  });

  it("adds the listed numbers with the date they were checked", async () => {
    const c = ctx({ tours_emergency_contacts: [{ id: "1", label: "Daet Police", kind: "police", phone: "(054) 721-0000", area: null, checked_on: "2026-10-01", is_active: true, sort_order: 0 }] });
    const result = await emergencyNumbers(c);
    expect(result.answer).toMatch(/Daet Police: \(054\) 721-0000/);
    expect(result.answer).toMatch(/last Oct 1, 2026/);
    expect(c.cards).toContainEqual({ type: "link", href: "tel:(054)721-0000".replace(/[()-]/g, ""), label: "Call Daet Police" });
  });

  it("is what basic mode answers for emergencies, in English or Filipino", async () => {
    for (const q of ["Emergency! someone is drowning", "Saan ang ospital?", "Need police"]) {
      expect(isEmergency(q.toLowerCase())).toBe(true);
      expect(await basicReply(q, ctx({ tours_emergency_contacts: [] }))).toMatch(/call 911/);
    }
    expect(emergencyAnswer([])).not.toMatch(/In Daet/);
  });
});

describe("is my tour on today? (decisions 12, 30)", () => {
  const booking = (extra: Record<string, unknown>) => ({ user_id: "u1", booking_reference: "bk-1", tour_date: TODAY, status: "confirmed", called_off_at: null, called_off_reason: null, call_off_resolution: null, tours_packages: { title: "Calaguas Island Hopping" }, ...extra });

  it("asks a visitor who is not signed in to sign in", async () => {
    expect((await tourToday(ctx({}))).answer).toMatch(/Sign in/);
  });

  it("says a confirmed tour is on, and a called-off one with its reason and what's next", async () => {
    expect((await tourToday(ctx({ tours_bookings: [booking({})] }, { userId: "u1" }))).answer).toMatch(/Calaguas Island Hopping today \(BK-1\) is on/);
    const off = await tourToday(ctx({ tours_bookings: [booking({ called_off_at: "2026-11-07T00:00:00Z", called_off_reason: "Rough sea, gale warning" })] }, { userId: "u1" }));
    expect(off.answer).toMatch(/called off by the operator: Rough sea, gale warning\. Pick a new date or a full refund/);
  });

  it("says when nothing is booked today or tomorrow", async () => {
    const result = await tourToday(ctx({ tours_bookings: [booking({ tour_date: "2026-12-01" })] }, { userId: "u1" }));
    expect(result.answer).toMatch(/no tour booked for today or tomorrow/);
  });

  it("is read from the question", () => {
    expect(asksTourToday("is my tour still on today")).toBe(true);
    expect(asksTourToday("tuloy ba ang tour ko bukas")).toBe(true);
    expect(asksTourToday("is the boat running")).toBe(false);
  });
});

describe("open near me now (decisions 21, 31)", () => {
  it("asks for the location first", async () => {
    const c = ctx({});
    expect((await openNearMe(c)).answer).toMatch(/Use my location/);
    expect(c.cards).toContainEqual({ type: "link", href: "#share-location", label: "Use my location" });
  });

  it("lists open places first, then no-hours ones marked check before you go; within 3 km, at most 5; never closed ones", async () => {
    const tables: Tables = {
      tours_attractions: [
        attraction("Far Museum", 14.2, 122.955, ALWAYS),
        attraction("Closed Church", 14.1121, 122.9551, NEVER),
        attraction("No Hours Plaza", 14.1125, 122.955, null),
        ...Array.from({ length: 6 }, (_, i) => attraction(`Open Spot ${i}`, 14.112 + 0.001 * (i + 1), 122.955, ALWAYS)),
      ],
      tours_guide_places: [],
    };
    const result = await openNearMe(ctx(tables, { here }), new Date("2026-11-07T04:00:00Z"));
    const names = (("places" in result ? result.places : undefined) ?? []).map((p) => p.name);
    expect(names).toHaveLength(5);
    expect(names).not.toContain("Far Museum");
    expect(names).not.toContain("Closed Church");
    expect(names.slice(0, 5).every((n) => n.startsWith("Open Spot"))).toBe(true);
  });

  it("marks places without hours", async () => {
    const tables: Tables = { tours_attractions: [attraction("No Hours Plaza", 14.1125, 122.955, null)], tours_guide_places: [] };
    expect((await openNearMe(ctx(tables, { here }))).answer).toMatch(/check before you go: No Hours Plaza/);
  });

  it("is read from the question", () => {
    expect(asksOpenNearMe("what s open near me")).toBe(true);
    expect(asksOpenNearMe("anong bukas malapit dito")).toBe(true);
    expect(asksOpenNearMe("where to eat near bagasbas")).toBe(false);
  });
});
