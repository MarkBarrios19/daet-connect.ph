import type { DateOption } from "@/lib/tours/availability";

/**
 * Starting values for the booking form when the trip planner links here
 * (?date=2026-11-10&pax=3). Only a date the tour is actually open on, and a
 * group size the price option allows, are used; anything else falls back to
 * the form's usual defaults.
 */
export function bookingPrefill(
  query: { date?: string | string[]; pax?: string | string[] },
  dateOptions: DateOption[] | null,
  minDate: string,
  variant: { min_pax: number; max_pax: number | null } | undefined,
): { date: string; pax: number } {
  const date = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : null;
  const firstOpen = dateOptions?.find((o) => !o.full)?.date ?? "";
  const chosenDate = dateOptions
    ? (date && dateOptions.some((o) => o.date === date && !o.full) ? date : firstOpen)
    : date && date >= minDate
      ? date
      : "";
  const raw = typeof query.pax === "string" ? Number.parseInt(query.pax, 10) : NaN;
  const min = Math.max(1, variant?.min_pax ?? 1);
  const max = variant?.max_pax ?? 50;
  const pax = Number.isFinite(raw) ? Math.min(Math.max(raw, min), max) : 1;
  return { date: chosenDate, pax };
}
