import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPeso } from "@/lib/money";
import { bookHref, type DatedPackage } from "@/lib/tours/itinerary/bookable";
import type { BookablePackage } from "@/lib/tours/itinerary/data";

export const WEATHER_RULE = "If the operator calls this trip off for weather, you pick a new date or get a full refund.";

/** What booking a tour costs this group, from the database price; null when no price is listed. */
export function groupPrice(pkg: BookablePackage, group: number): number | null {
  if (!pkg.price) return null;
  return pkg.price.perPerson ? pkg.price.amount * group : pkg.price.amount;
}

/**
 * Each bookable tour with its own Book button (each is booked and paid
 * separately), and the total for the group. Without a group (a shared,
 * view-only plan) each viewer books for themselves, so there is no total.
 */
export function BookEachTrip({ packages, group, title = "Book each trip" }: { packages: DatedPackage[]; group: number | null; title?: string }) {
  if (!packages.length) return null;
  const prices = group ? packages.map((p) => groupPrice(p, group)) : [];
  const known = prices.filter((p): p is number => p !== null);
  return (
    <div className="space-y-2">
      <h3 className="font-bold text-daet-ink">{title}</h3>
      {packages.map((p) => (
        <BookableCard key={p.id} pkg={p} group={group} bookHref={bookHref(p.id, p.date, group)} />
      ))}
      {group && packages.length > 1 && known.length ? (
        <p className="text-sm font-semibold text-daet-ink">
          {known.length < prices.length ? "At least " : "About "}
          {formatPeso(known.reduce((a, b) => a + b, 0))} for all {packages.length} trips. Each one is booked and paid separately.
        </p>
      ) : null}
    </div>
  );
}

export function BookableCard({ pkg, group, bookHref: href }: { pkg: BookablePackage; group: number | null; bookHref?: string }) {
  const price = pkg.price
    ? pkg.price.perPerson
      ? `from ${formatPeso(pkg.price.amount)} per person${group ? ` · about ${formatPeso(pkg.price.amount * group)} for ${group}` : ""}`
      : `from ${formatPeso(pkg.price.amount)} per group`
    : null;
  return (
    <div className="rounded-2xl bg-blue-50 p-3 dark:bg-blue-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">Bookable</Badge>
        {pkg.verified ? <span className="text-xs font-bold text-green-800 dark:text-green-300">Verified by the Tourism Office</span> : null}
      </div>
      <p className="mt-1 font-bold text-daet-ink">{pkg.title}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{[pkg.operatorName, `passes ${pkg.matched.slice(0, 2).join(", ")}`].filter(Boolean).join(" · ")}</p>
      {price ? <p className="mt-1 text-sm font-semibold text-daet-ink">{price}</p> : null}
      {pkg.notIncluded.length ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Not included: {pkg.notIncluded.join(", ")}</p> : null}
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{WEATHER_RULE}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {href ? (
          <Link href={href} className="inline-flex min-h-11 items-center rounded-full bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
            {group ? `Book for ${group}` : "Book this tour"}
          </Link>
        ) : null}
        <Link href={`/tours/packages/${pkg.id}`} className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-bold text-blue-700 hover:bg-muted dark:text-blue-300">
          View tour
        </Link>
      </div>
    </div>
  );
}
