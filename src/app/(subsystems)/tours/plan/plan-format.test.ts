import { defaultTitle } from "./plan-format";

describe("defaultTitle", () => {
  it("names the trip by its dates", () => {
    expect(defaultTitle([{ date: "2026-11-10" }, { date: "2026-11-11" }])).toBe("Daet trip, Nov 10–11");
    expect(defaultTitle([{ date: "2026-11-30" }, { date: "2026-12-01" }])).toBe("Daet trip, Nov 30–Dec 1");
    expect(defaultTitle([{ date: "2026-11-10" }])).toBe("Daet trip, Nov 10");
    expect(defaultTitle([])).toBe("Daet trip");
  });
});
