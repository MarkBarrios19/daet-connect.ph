import { ADMIN_SEARCH_STATUSES, ADMIN_SEARCH_TYPES, parseAdminSearchStatus, parseAdminSearchType } from "./admin-search";

describe("admin search filters", () => {
  it("exposes the global record groups and status filters", () => {
    expect(ADMIN_SEARCH_TYPES.map(({ value }) => value)).toEqual([
      "all",
      "operators",
      "guides",
      "attractions",
      "events",
      "places",
      "fares",
      "packages",
      "merchandise",
      "reviews",
    ]);
    expect(ADMIN_SEARCH_STATUSES.map(({ value }) => value)).toContain("pending");
    expect(ADMIN_SEARCH_STATUSES.map(({ value }) => value)).toContain("hidden");
  });

  it("accepts known filters and safely falls back for invalid query values", () => {
    expect(parseAdminSearchType("packages")).toBe("packages");
    expect(parseAdminSearchType("not-a-record")).toBe("all");
    expect(parseAdminSearchType(["packages"])).toBe("all");
    expect(parseAdminSearchStatus("verified")).toBe("verified");
    expect(parseAdminSearchStatus("pending OR true")).toBe("all");
    expect(parseAdminSearchStatus(undefined)).toBe("all");
  });
});
