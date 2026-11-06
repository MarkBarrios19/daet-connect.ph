import { callOffState, canCallOff, checkNewDate, parseCallOffReason } from "@/lib/tours/call-off";

const base = { status: "confirmed", tour_date: "2026-11-10" };

describe("callOffState", () => {
  it("tracks a call-off from waiting to the traveller's choice", () => {
    expect(callOffState(base)).toBe("none");
    expect(callOffState({ ...base, called_off_at: "2026-11-09T22:00:00Z" })).toBe("awaiting");
    expect(callOffState({ ...base, called_off_at: "x", call_off_resolution: "rescheduled" })).toBe("rescheduled");
    expect(callOffState({ ...base, status: "cancelled", called_off_at: "x", call_off_resolution: "refund_requested" })).toBe("refund_requested");
  });
  it("works before the database has the new columns", () => {
    expect(callOffState({ status: "confirmed" })).toBe("none");
  });
});

describe("canCallOff", () => {
  it("allows confirmed trips from today on that aren't already waiting", () => {
    expect(canCallOff(base, "2026-11-10")).toBe(true);
    expect(canCallOff(base, "2026-11-11")).toBe(false);
    expect(canCallOff({ ...base, status: "pending" }, "2026-11-05")).toBe(false);
    expect(canCallOff({ ...base, called_off_at: "x" }, "2026-11-05")).toBe(false);
    // A moved trip can be called off again if the weather turns.
    expect(canCallOff({ ...base, called_off_at: "x", call_off_resolution: "rescheduled" }, "2026-11-05")).toBe(true);
  });
});

describe("parseCallOffReason and checkNewDate", () => {
  it("needs a short reason", () => {
    expect(parseCallOffReason("  Rough   sea ")).toEqual({ ok: true, reason: "Rough sea" });
    expect(parseCallOffReason("no")).toMatchObject({ ok: false });
    expect(parseCallOffReason("x".repeat(301))).toMatchObject({ ok: false });
  });
  it("takes a new date from tomorrow up to a year ahead", () => {
    expect(checkNewDate("2026-11-12", "2026-11-10", "2026-11-05")).toEqual({ ok: true, date: "2026-11-12" });
    expect(checkNewDate("2026-11-05", "2026-11-10", "2026-11-05")).toMatchObject({ ok: false });
    expect(checkNewDate("2026-11-10", "2026-11-10", "2026-11-05")).toEqual({ ok: false, error: "Pick a different date." });
    expect(checkNewDate("2027-12-01", "2026-11-10", "2026-11-05")).toMatchObject({ ok: false });
    expect(checkNewDate("soon", "2026-11-10", "2026-11-05")).toMatchObject({ ok: false });
  });
});
