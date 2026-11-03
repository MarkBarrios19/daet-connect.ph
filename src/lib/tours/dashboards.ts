/** Role dashboards (F9): navigation, calendars, occupancy and analytics shaping. */

export type DashboardRole = "tourist" | "operator" | "guide" | "admin";

/** A role tab; its line icon is chosen by label (TabIcon in components/ui/icons.tsx). */
export type Tab = { href: string; label: string };

/** Bottom tab bar per role (phones). The first tab is the role's dashboard. */
export function roleTabs(role: string | null): Tab[] {
  switch (role) {
    case "operator":
      return [
        { href: "/tours/operator/dashboard", label: "Home" },
        { href: "/tours/operator/bookings", label: "Bookings" },
        { href: "/tours/operator/packages", label: "Packages" },
        { href: "/tours/operator/payments", label: "Revenue" },
        { href: "/tours/messages", label: "Messages" },
      ];
    case "guide":
      return [
        { href: "/tours/guide/dashboard", label: "Home" },
        { href: "/tours/guide/my-tours", label: "Tours" },
        { href: "/tours/guide/check-in", label: "Scan" },
        { href: "/tours/guide/my-qr", label: "Badge" },
        { href: "/tours/messages", label: "Messages" },
      ];
    case "admin":
      return [
        { href: "/tours/admin", label: "Home" },
        { href: "/tours/admin/analytics", label: "Analytics" },
        { href: "/tours/admin/operators", label: "Approvals" },
        { href: "/tours/admin/attractions", label: "Content" },
        { href: "/tours/messages", label: "Messages" },
      ];
    case "tourist":
      return [
        // The fifth tab, You, is the account menu (nav iteration 3); Trips is in the Menu sheet.
        { href: "/tours/me", label: "Home" },
        { href: "/tours/plan", label: "Plan" },
        { href: "/tours/my-bookings", label: "Bookings" },
        { href: "/tours/messages", label: "Messages" },
      ];
    default:
      return [];
  }
}

/**
 * The signed-in user's own pages for the account menu (nav iteration 3);
 * Dark mode and Sign out follow them. `tabs` are the role's tabs: the first is
 * the dashboard.
 */
export function accountLinks(role: string | null | undefined, tabs: Tab[]): Tab[] {
  // Everyone's own page comes first: one name, one photo, one password, for
  // tourists and staff alike. The operator's payment details stay their own
  // page, under a label that cannot be mistaken for it.
  const links: Tab[] = [{ href: "/settings", label: "Profile settings" }];
  if (role === "operator") links.push({ href: "/tours/operator/settings", label: "Payment settings" });
  if (!role || role === "tourist") links.push({ href: "/tours/my-bookings", label: "Bookings" });
  links.push({ href: "/tours/messages", label: "Messages" });
  if (tabs[0]) links.push({ href: tabs[0].href, label: "Dashboard" });
  return links;
}

/**
 * The Tourism Office links a staff bar shows *after* the role's own tabs: the
 * ones the tabs don't already reach.
 *
 * An admin's tabs are Analytics, Approvals and Content, and the office's list of
 * pages repeats Analytics and points a second link ("Operators") at the very
 * page the Approvals tab opens. Rendered side by side that is a bar with
 * Analytics on it twice (owner's note, image-94), so one href gets one link —
 * the tab's, because it is the one the role lives in.
 */
export function staffLinks(tabs: Tab[], officeLinks: Tab[]): Tab[] {
  const seen = new Set(tabs.map((tab) => tab.href));
  return officeLinks.filter((link) => !seen.has(link.href));
}

/** The tab that owns a path: longest matching prefix, so /tours/admin/reviews is "Reviews", not "Home". */
export function activeTab(tabs: Tab[], pathname: string): string | null {
  let best: Tab | null = null;
  for (const tab of tabs) {
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
      if (!best || tab.href.length > best.href.length) best = tab;
    }
  }
  return best?.href ?? null;
}

/** Where /dashboard sends a signed-in user. */
export function dashboardPath(
  role: string | null,
  accounts: { operatorStatus?: string | null; guideStatus?: string | null } = {},
): string {
  if (role === "admin") return "/tours/admin";
  if (role === "operator" || role === "guide") {
    const { operatorStatus, guideStatus } = accounts;
    if (operatorStatus) return operatorStatus === "approved" ? "/tours/operator/dashboard" : operatorStatus === "rejected" ? "/tours/operator/register" : "/tours/operator/pending";
    if (guideStatus) return guideStatus === "approved" ? "/tours/guide/dashboard" : guideStatus === "rejected" ? "/tours/guide/register" : "/tours/guide/pending";
    return role === "operator" ? "/tours/operator/register" : "/tours/guide/register";
  }
  return "/tours/me";
}

// ---------------------------------------------------------------------------
// Calendars and occupancy
// ---------------------------------------------------------------------------

export type DayLoad = { bookings: number; pax: number };

/** Active bookings per tour date (cancelled/rejected left out). */
export function bookingsByDay(rows: Array<{ tour_date: string; status: string; number_of_pax: number | null }>): Map<string, DayLoad> {
  const days = new Map<string, DayLoad>();
  for (const row of rows) {
    if (row.status === "cancelled" || row.status === "rejected") continue;
    const day = days.get(row.tour_date) ?? { bookings: 0, pax: 0 };
    day.bookings += 1;
    day.pax += Number(row.number_of_pax ?? 0);
    days.set(row.tour_date, day);
  }
  return days;
}

export type Occupancy = { seats: number; booked: number; percent: number | null; openDays: number };

/** Seats sold vs. seats offered across availability rows (null percent when nothing was offered). */
export function occupancy(rows: Array<{ capacity_total: number | null; capacity_booked: number | null }>): Occupancy {
  let seats = 0;
  let booked = 0;
  let openDays = 0;
  for (const row of rows) {
    const total = Math.max(0, Number(row.capacity_total ?? 0));
    if (total === 0) continue;
    openDays += 1;
    seats += total;
    booked += Math.min(total, Math.max(0, Number(row.capacity_booked ?? 0)));
  }
  return { seats, booked, openDays, percent: seats > 0 ? Math.round((booked / seats) * 100) : null };
}

/** A guide's day: not set, available or not available. */
export type AvailabilityState = "unset" | "available" | "unavailable";
/** Tapping a day with the chosen mark: it gets the mark, or loses it if it already had it. */
export function markDay(state: AvailabilityState, mark: Exclude<AvailabilityState, "unset">): AvailabilityState {
  return state === mark ? "unset" : mark;
}

// ---------------------------------------------------------------------------
// Admin analytics
// ---------------------------------------------------------------------------

export type AnalyticsRange = { from: string; to: string; preset: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const RANGE_PRESETS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "365d", label: "12 months", days: 365 },
] as const;

/** ?range=30d or ?from=&to= (max 366 days); defaults to the last 30 days ending today. */
export function parseAnalyticsRange(params: Record<string, string | string[] | undefined>, today: string): AnalyticsRange {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const from = one(params.from);
  const to = one(params.to);
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to && to <= today) {
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (span <= 366) return { from, to, preset: "custom" };
  }
  const preset = RANGE_PRESETS.find((p) => p.key === one(params.range)) ?? RANGE_PRESETS[1];
  return { from: addDays(today, -(preset.days - 1)), to: today, preset: preset.key };
}

/** One entry per day in the range, zero-filled, for the arrivals chart. */
export function fillDays(points: Array<{ day: string; checkins: number }>, from: string, to: string): Array<{ day: string; checkins: number }> {
  const byDay = new Map(points.map((p) => [p.day, p.checkins]));
  const out: Array<{ day: string; checkins: number }> = [];
  for (let day = from; day <= to && out.length < 400; day = addDays(day, 1)) out.push({ day, checkins: byDay.get(day) ?? 0 });
  return out;
}

export type Analytics = {
  arrivals: Array<{ day: string; checkins: number }>;
  bookings: { total: number; pending: number; confirmed: number; completed: number; cancelled: number; rejected: number; pax: number };
  operators: Array<{ id: string; business_name: string; bookings: number; revenue: number; refunded: number }>;
  topPackages: Array<{ id: string; title: string; bookings: number; pax: number }>;
  topAttractions: Array<{ id: string; name: string; slug: string; planned: number }>;
  queue: Array<{ kind: "operator" | "guide"; id: string; name: string; waiting_days: number }>;
  ratings: Array<{ stars: number; count: number }>;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/** Defensive read of the tours_admin_analytics JSON. */
export function parseAnalytics(json: unknown): Analytics {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const b = (j.bookings && typeof j.bookings === "object" ? j.bookings : {}) as Record<string, unknown>;
  return {
    arrivals: arr(j.arrivals).map((r) => ({ day: String(r.day), checkins: num(r.checkins) })),
    bookings: {
      total: num(b.total),
      pending: num(b.pending),
      confirmed: num(b.confirmed),
      completed: num(b.completed),
      cancelled: num(b.cancelled),
      rejected: num(b.rejected),
      pax: num(b.pax),
    },
    operators: arr(j.operators).map((r) => ({ id: String(r.id), business_name: String(r.business_name ?? "Operator"), bookings: num(r.bookings), revenue: num(r.revenue), refunded: num(r.refunded) })),
    topPackages: arr(j.top_packages).map((r) => ({ id: String(r.id), title: String(r.title ?? "Package"), bookings: num(r.bookings), pax: num(r.pax) })),
    topAttractions: arr(j.top_attractions).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), slug: String(r.slug ?? ""), planned: num(r.planned) })),
    queue: arr(j.queue).map((r) => ({ kind: r.kind === "guide" ? "guide" : "operator", id: String(r.id), name: String(r.name ?? ""), waiting_days: num(r.waiting_days) })),
    ratings: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: num(arr(j.ratings).find((r) => num(r.stars) === stars)?.count) })),
  };
}

/** Cancelled share of bookings that the operator accepted or could still accept (rejections excluded). */
export function cancellationRate(b: Analytics["bookings"]): number | null {
  const base = b.total - b.rejected;
  return base > 0 ? Math.round((b.cancelled / base) * 1000) / 10 : null;
}

/** Queue ageing buckets for the accreditation backlog. */
export function queueBuckets(queue: Analytics["queue"]): Array<{ label: string; count: number }> {
  const buckets = [
    { label: "Under 3 days", count: 0 },
    { label: "3–7 days", count: 0 },
    { label: "Over 7 days", count: 0 },
  ];
  for (const item of queue) buckets[item.waiting_days < 3 ? 0 : item.waiting_days <= 7 ? 1 : 2].count += 1;
  return buckets;
}

