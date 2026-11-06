import { askedToday, FEEDBACK_ASKED_KEY, markAsked } from "./feedback-ask";

function memory(): Pick<Storage, "getItem" | "setItem"> & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("feedback ask", () => {
  it("has not asked on a fresh device", () => {
    expect(askedToday(memory())).toBe(false);
    expect(askedToday(null)).toBe(false);
  });

  it("has asked for the rest of the same day (Philippine time)", () => {
    const store = memory();
    markAsked(store, new Date("2026-11-06T02:00:00Z")); // 10:00 in Manila
    expect(store.data[FEEDBACK_ASKED_KEY]).toBe("2026-11-06");
    expect(askedToday(store, new Date("2026-11-06T15:00:00Z"))).toBe(true); // 23:00 in Manila
  });

  it("asks again the next day", () => {
    const store = memory();
    markAsked(store, new Date("2026-11-06T02:00:00Z"));
    expect(askedToday(store, new Date("2026-11-06T16:30:00Z"))).toBe(false); // 00:30 on the 7th in Manila
  });

  it("copes with storage that throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(askedToday(broken)).toBe(false);
    expect(() => markAsked(broken)).not.toThrow();
  });
});
