import { bookingPrefill } from "./prefill";

const open = [
  { date: "2026-11-10", seatsLeft: 4, full: false },
  { date: "2026-11-11", seatsLeft: 0, full: true },
  { date: "2026-11-12", seatsLeft: 8, full: false },
] as Parameters<typeof bookingPrefill>[1];
const variant = { min_pax: 2, max_pax: 6 };

describe("bookingPrefill", () => {
  it("uses the planner's date when the tour is open that day, and the group size", () => {
    expect(bookingPrefill({ date: "2026-11-12", pax: "3" }, open, "2026-11-06", variant)).toEqual({ date: "2026-11-12", pax: 3 });
  });
  it("falls back to the first open date when that day is full or not offered", () => {
    expect(bookingPrefill({ date: "2026-11-11" }, open, "2026-11-06", variant).date).toBe("2026-11-10");
    expect(bookingPrefill({ date: "2026-12-01" }, open, "2026-11-06", variant).date).toBe("2026-11-10");
  });
  it("accepts any future date when the tour has no availability calendar", () => {
    expect(bookingPrefill({ date: "2026-11-20" }, null, "2026-11-06", variant).date).toBe("2026-11-20");
    expect(bookingPrefill({ date: "2026-11-01" }, null, "2026-11-06", variant).date).toBe("");
    expect(bookingPrefill({ date: "nonsense" }, null, "2026-11-06", variant).date).toBe("");
  });
  it("keeps the group within what the price option allows, and defaults to 1", () => {
    expect(bookingPrefill({ pax: "12" }, open, "2026-11-06", variant).pax).toBe(6);
    expect(bookingPrefill({ pax: "1" }, open, "2026-11-06", variant).pax).toBe(2);
    expect(bookingPrefill({}, open, "2026-11-06", variant).pax).toBe(1);
  });
});
