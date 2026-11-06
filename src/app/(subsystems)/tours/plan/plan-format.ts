export const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export { formatPeso as peso } from "@/lib/money";

/** Swaps the item at `index` with its neighbour `by` places away; out-of-range moves change nothing. */
export function move(ids: string[], index: number, by: number): string[] {
  const next = [...ids];
  const target = index + by;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** "Daet trip, Nov 10–11" from the plan's own dates. */
export function defaultTitle(days: Array<{ date: string }>): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { ...opts, timeZone: "UTC" });
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!first) return "Daet trip";
  if (first === last) return `Daet trip, ${fmt(first, { month: "short", day: "numeric" })}`;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return `Daet trip, ${fmt(first, { month: "short", day: "numeric" })}–${sameMonth ? fmt(last, { day: "numeric" }) : fmt(last, { month: "short", day: "numeric" })}`;
}
