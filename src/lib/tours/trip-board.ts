import type { PhotoKey } from "@/lib/photo-credits";

/**
 * Helpers for showing tours the way the redesign does (docs/DESIGN_SYSTEM.md):
 * as a departure board of real trips, grouped by how much time they take, each
 * with a photo even when the operator hasn't uploaded one yet.
 */

export type TripLength = "half" | "day" | "two";

export const TRIP_LENGTHS: Array<{ id: TripLength; label: string }> = [
  { id: "half", label: "Half a day" },
  { id: "day", label: "A full day" },
  { id: "two", label: "Two days or more" },
];

/** Up to 6 hours is half a day; up to a day is a full day; more is two days or more. */
export function tripLength(value: number | null | undefined, type: string | null | undefined): TripLength {
  const n = Number(value) || 0;
  const hours = type === "days" ? n * 24 : n;
  if (hours <= 6) return "half";
  if (hours <= 24) return "day";
  return "two";
}

export function durationLabel(value: number | null | undefined, type: string | null | undefined): string {
  const n = Number(value) || 0;
  const unit = type === "days" ? "day" : "hour";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

type Variant = { price_per_pax: number | string | null; flat_price: number | string | null; is_default?: boolean | null };

/** The default (or lowest) price option: the amount and whether it is per person. */
export function fromPrice(variants: Variant[] | null | undefined): { amount: number; perPerson: boolean } | null {
  const list = (variants ?? []).filter((v) => Number(v.price_per_pax ?? v.flat_price) > 0);
  if (!list.length) return null;
  const chosen = list.find((v) => v.is_default) ?? [...list].sort((a, b) => Number(a.price_per_pax ?? a.flat_price) - Number(b.price_per_pax ?? b.flat_price))[0];
  const perPerson = chosen.price_per_pax != null && Number(chosen.price_per_pax) > 0;
  return { amount: Number(perPerson ? chosen.price_per_pax : chosen.flat_price), perPerson };
}

/**
 * The cheapest amount on any price variant, and whether that amount is per
 * person — "from ₱3,799 per person". Null when the operator has set no price at
 * all, so a card can leave the price out rather than invent one.
 */
export function cheapestPrice(
  variants: Variant[] | null | undefined,
): { price: number; perPerson: boolean } | null {
  const priced = (variants ?? [])
    .map((variant) => ({
      amount: Number(variant.price_per_pax ?? variant.flat_price),
      perPerson: Number(variant.price_per_pax) > 0,
    }))
    .filter((variant) => Number.isFinite(variant.amount) && variant.amount > 0);

  if (priced.length === 0) return null;

  const cheapest = priced.reduce((lowest, variant) => (variant.amount < lowest.amount ? variant : lowest));
  return { price: cheapest.amount, perPerson: cheapest.perPerson };
}

type Slot = { available_date: string; capacity_total: number | null; capacity_booked: number | null };

/** The first date from `today` with a seat left, or null. */
export function nextOpenDate(slots: Slot[] | null | undefined, today: string): string | null {
  const open = (slots ?? [])
    .filter((s) => s.available_date >= today && (s.capacity_total ?? 0) - (s.capacity_booked ?? 0) > 0)
    .map((s) => s.available_date)
    .sort();
  return open[0] ?? null;
}

/** Photos by what they actually show; used for a named place, never for a different one. */
const EXACT_PHOTOS: Array<[RegExp, PhotoKey]> = [
  [/calaguas|tinaga/i, "calaguasBeach"],
  [/apuao/i, "apuao"],
  [/bagasbas/i, "bagasbas"],
  [/rizal/i, "rizal"],
  [/st\.? john/i, "church"], // St John the Baptist Church. Daet's cathedral (Most Holy Trinity) is another church.
  [/mercedes port/i, "mercedesPort"],
];

/** For tours, a photo of the area they visit is enough (the trip starts or ends there). */
const AREA_PHOTOS: Array<[RegExp, PhotoKey]> = [
  ...EXACT_PHOTOS,
  [/paracale|vinzons/i, "calaguasBeach"],
  [/mercedes|canimog|parola/i, "apuao"],
  [/surf/i, "bagasbas"],
  [/heritage|poblacion/i, "rizal"],
];

/** The photo that shows this very place, or null. Places are never shown with another place's photo. */
export function matchPlacePhoto(...texts: Array<string | null | undefined>): PhotoKey | null {
  const text = texts.filter(Boolean).join(" ");
  return EXACT_PHOTOS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** A photo of the area a tour visits, for tours without their own cover photo (the Daet shore by default). */
export function placePhoto(...texts: Array<string | null | undefined>): PhotoKey {
  const text = texts.filter(Boolean).join(" ");
  return AREA_PHOTOS.find(([pattern]) => pattern.test(text))?.[1] ?? "bagasbas";
}

/** "Sat, Nov 7" in Manila terms for a YYYY-MM-DD date. */
export function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
