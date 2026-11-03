import fc from "fast-check";
import {
  accountLinks,
  activeTab,
  bookingsByDay,
  cancellationRate,
  dashboardPath,
  fillDays,
  markDay,
  occupancy,
  parseAnalytics,
  parseAnalyticsRange,
  queueBuckets,
  roleTabs,
  staffLinks,
} from "@/lib/tours/dashboards";

describe("roleTabs / activeTab", () => {
  it("gives each role five tabs starting at its dashboard, and none when signed out", () => {
    expect(roleTabs("operator")[0].href).toBe("/tours/operator/dashboard");
    expect(roleTabs("guide")[0].href).toBe("/tours/guide/dashboard");
    expect(roleTabs("admin")[0].href).toBe("/tours/admin");
    expect(roleTabs("tourist")[0].href).toBe("/tours/me");
    for (const role of ["operator", "guide", "admin"])
      expect(roleTabs(role)).toHaveLength(5);
    // Tourists' fifth tab is You, the account menu.
    expect(roleTabs("tourist")).toHaveLength(4);
    expect(roleTabs(null)).toEqual([]);
  });
  it("picks the longest matching tab", () => {
    const tabs = roleTabs("admin");
    expect(activeTab(tabs, "/tours/admin")).toBe("/tours/admin");
    expect(activeTab(tabs, "/tours/admin/analytics/x")).toBe(
      "/tours/admin/analytics",
    );
    expect(activeTab(tabs, "/tours/messages/abc")).toBe("/tours/messages");
    expect(activeTab(tabs, "/tours/admin/events")).toBe("/tours/admin");
    expect(activeTab(tabs, "/tours/administrator")).toBeNull();
    expect(
      activeTab(roleTabs("operator"), "/tours/operator/bookings/abc"),
    ).toBe("/tours/operator/bookings");
  });
});

describe("accountLinks", () => {
  it("puts the person's own page first, for every role", () => {
    for (const role of [
      "tourist",
      "operator",
      "guide",
      "admin",
      null,
    ] as const) {
      expect(accountLinks(role, roleTabs(role))[0]).toEqual({
        href: "/settings",
        label: "Profile settings",
      });
    }
  });

  it("keeps the operator's payment page, named so it cannot be mistaken for the profile", () => {
    const labels = accountLinks("operator", roleTabs("operator")).map(
      (link) => link.label,
    );
    expect(labels).toContain("Payment settings");
    expect(labels).not.toContain("Settings");
  });

  it("still ends with the dashboard, and keeps bookings for tourists", () => {
    expect(
      accountLinks("tourist", roleTabs("tourist")).map((link) => link.href),
    ).toEqual([
      "/settings",
      "/tours/my-bookings",
      "/tours/messages",
      "/tours/me",
    ]);
    expect(accountLinks("guide", roleTabs("guide")).at(-1)).toEqual({
      href: "/tours/guide/dashboard",
      label: "Dashboard",
    });
  });
});

describe("staffLinks", () => {
  it("does not list a page twice when the role's own tabs already reach it", () => {
    // The admin bar draws its role tabs and then the Tourism Office's links
    // beside them; Analytics was on it twice, and "Operators" and "Approvals"
    // were two names for one queue (owner's note, image-94).
    const tabs = roleTabs("admin").filter(
      (tab) => tab.label !== "Home" && tab.href !== "/tours/messages",
    );
    const office = [
      { href: "/tours/admin/analytics", label: "Analytics" },
      { href: "/tours/admin/operators", label: "Operators" },
      { href: "/tours/admin/guides", label: "Guides" },
      { href: "/tours/admin/packages", label: "Packages" },
    ];

    expect(staffLinks(tabs, office)).toEqual([
      { href: "/tours/admin/guides", label: "Guides" },
      { href: "/tours/admin/packages", label: "Packages" },
    ]);
  });

  it("keeps every office link a role does not reach from its tabs", () => {
    const office = [
      { href: "/tours/admin/analytics", label: "Analytics" },
      { href: "/tours/admin/guides", label: "Guides" },
    ];
    expect(staffLinks(roleTabs("operator"), office)).toEqual(office);
    expect(staffLinks([], office)).toEqual(office);
  });
});

describe("dashboardPath", () => {
  it("routes each role and accreditation state", () => {
    expect(dashboardPath("admin")).toBe("/tours/admin");
    expect(dashboardPath("tourist")).toBe("/tours/me");
    expect(dashboardPath(null)).toBe("/tours/me");
    expect(dashboardPath("operator", { operatorStatus: "approved" })).toBe(
      "/tours/operator/dashboard",
    );
    expect(dashboardPath("operator", { operatorStatus: "pending" })).toBe(
      "/tours/operator/pending",
    );
    expect(dashboardPath("operator", { operatorStatus: "rejected" })).toBe(
      "/tours/operator/register",
    );
    expect(dashboardPath("guide", { guideStatus: "approved" })).toBe(
      "/tours/guide/dashboard",
    );
    expect(dashboardPath("guide", { guideStatus: "suspended" })).toBe(
      "/tours/guide/pending",
    );
    expect(dashboardPath("guide")).toBe("/tours/guide/register");
  });
});

describe("calendars and occupancy", () => {
  it("counts active bookings and pax per day", () => {
    const days = bookingsByDay([
      { tour_date: "2026-10-24", status: "confirmed", number_of_pax: 3 },
      { tour_date: "2026-10-24", status: "pending", number_of_pax: 2 },
      { tour_date: "2026-10-24", status: "cancelled", number_of_pax: 9 },
      { tour_date: "2026-10-25", status: "rejected", number_of_pax: 1 },
    ]);
    expect(days.get("2026-10-24")).toEqual({ bookings: 2, pax: 5 });
    expect(days.has("2026-10-25")).toBe(false);
  });
  it("computes occupancy and ignores closed days", () => {
    expect(
      occupancy([
        { capacity_total: 10, capacity_booked: 4 },
        { capacity_total: 10, capacity_booked: 10 },
        { capacity_total: 0, capacity_booked: 0 },
      ]),
    ).toEqual({ seats: 20, booked: 14, openDays: 2, percent: 70 });
    expect(occupancy([]).percent).toBeNull();
  });
  it("occupancy stays within 0–100% for any input", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            capacity_total: fc.integer({ min: -5, max: 500 }),
            capacity_booked: fc.integer({ min: -5, max: 900 }),
          }),
        ),
        (rows) => {
          const o = occupancy(rows);
          return (
            o.percent === null ||
            (o.percent >= 0 && o.percent <= 100 && o.booked <= o.seats)
          );
        },
      ),
    );
  });
  it("marks a guide's day with the chosen mark, and clears it on a second tap", () => {
    expect(markDay("unset", "available")).toBe("available");
    expect(markDay("available", "available")).toBe("unset");
    expect(markDay("available", "unavailable")).toBe("unavailable");
    expect(markDay("unavailable", "unavailable")).toBe("unset");
    expect(markDay("unset", "unavailable")).toBe("unavailable");
  });
});

describe("analytics", () => {
  const today = "2026-10-23";
  it("parses the range", () => {
    expect(parseAnalyticsRange({}, today)).toEqual({
      from: "2026-09-24",
      to: today,
      preset: "30d",
    });
    expect(parseAnalyticsRange({ range: "7d" }, today)).toEqual({
      from: "2026-10-17",
      to: today,
      preset: "7d",
    });
    expect(
      parseAnalyticsRange({ from: "2026-10-01", to: "2026-10-10" }, today),
    ).toEqual({ from: "2026-10-01", to: "2026-10-10", preset: "custom" });
    // future, reversed, too long or malformed → default
    for (const params of [
      { from: "2026-10-01", to: "2026-12-01" },
      { from: "2026-10-10", to: "2026-10-01" },
      { from: "2024-01-01", to: "2026-10-01" },
      { from: "x", to: "y" },
    ]) {
      expect(parseAnalyticsRange(params, today).preset).toBe("30d");
    }
  });
  it("zero-fills days", () => {
    expect(
      fillDays(
        [{ day: "2026-10-02", checkins: 4 }],
        "2026-10-01",
        "2026-10-03",
      ),
    ).toEqual([
      { day: "2026-10-01", checkins: 0 },
      { day: "2026-10-02", checkins: 4 },
      { day: "2026-10-03", checkins: 0 },
    ]);
  });
  it("reads the RPC JSON defensively", () => {
    const a = parseAnalytics({
      bookings: { total: 10, cancelled: 2, rejected: 2, pax: "31" },
      operators: [
        {
          id: "o1",
          business_name: "Bagasbas Coast Tours",
          bookings: 6,
          revenue: "4500.50",
          refunded: 0,
        },
      ],
      ratings: [
        { stars: 5, count: 3 },
        { stars: 1, count: 1 },
      ],
      queue: [
        { kind: "guide", id: "g", name: "A", waiting_days: 9 },
        { kind: "operator", id: "o", name: "B", waiting_days: 1 },
      ],
    });
    expect(a.bookings.pax).toBe(31);
    expect(a.operators[0].revenue).toBe(4500.5);
    expect(a.ratings).toEqual([
      { stars: 5, count: 3 },
      { stars: 4, count: 0 },
      { stars: 3, count: 0 },
      { stars: 2, count: 0 },
      { stars: 1, count: 1 },
    ]);
    expect(cancellationRate(a.bookings)).toBe(25);
    expect(queueBuckets(a.queue).map((b) => b.count)).toEqual([1, 0, 1]);
    expect(parseAnalytics(null).arrivals).toEqual([]);
    expect(cancellationRate(parseAnalytics(null).bookings)).toBeNull();
  });
});
