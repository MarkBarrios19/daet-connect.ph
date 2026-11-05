import Link from "next/link";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import { bookHref, type DatedPackage } from "@/lib/tours/itinerary/bookable";
import type { BookablePackage } from "@/lib/tours/itinerary/data";

export const WEATHER_RULE = "If the operator calls off the trip for weather, you pick a new date or get a full refund.";

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
      ? `from ${formatPeso(pkg.price.amount)} per person${group && group > 1 ? ` · about ${formatPeso(pkg.price.amount * group)} for ${group}` : ""}`
      : `from ${formatPeso(pkg.price.amount)} per group`
    : null;
  const phone = pkg.operatorPhone?.replace(/[^\d+]/g, "");
  return (
    <div className="space-y-2 rounded-xl bg-blue-50 p-3 dark:bg-blue-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full bg-green-500 px-2.5 text-sm font-bold text-slate-900">
          <LineIcon name="check" className="h-4 w-4" /> Bookable
        </span>
        {pkg.verified ? <span className="text-sm text-slate-700 dark:text-slate-300">Verified by the Tourism Office</span> : null}
      </div>
      <p className="font-bold text-daet-ink">{pkg.title}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{[pkg.duration, price].filter(Boolean).join(" · ") || "Price on the tour page"}</p>
      {pkg.operatorName ? <p className="text-sm text-slate-600 dark:text-slate-400">By {pkg.operatorName}</p> : null}
      <p className="text-sm text-daet-ink">{WEATHER_RULE}</p>
      {pkg.notIncluded.length ? <p className="text-sm text-slate-600 dark:text-slate-400">Not included: {pkg.notIncluded.join(", ")}.</p> : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {href ? (
          <Link href={href} className="inline-flex min-h-11 items-center rounded-full bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">
            Book this trip
          </Link>
        ) : null}
        <Link href={`/tours/packages/${pkg.id}`} className="inline-flex min-h-11 items-center rounded-full border border-slate-500 bg-surface px-5 text-sm font-bold text-daet-ink hover:bg-muted">
          See details
        </Link>
        {phone ? (
          <a href={`tel:${phone}`} className="inline-flex min-h-11 items-center px-3 text-sm font-bold text-blue-700 hover:underline dark:text-blue-300">
            Call operator
          </a>
        ) : null}
      </div>
    </div>
  );
}

const tourDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The saved trip's booking summary (Desktop-Trip board): each tour with its
 * day and group price, the total, and one Book button per tour, because each
 * operator is booked and paid separately.
 */
export function BookSummary({ packages, group }: { packages: DatedPackage[]; group: number | null }) {
  if (!packages.length) return null;
  const rows = packages.map((p) => ({ p, price: group ? groupPrice(p, group) : null }));
  const known = rows.flatMap((r) => (r.price === null ? [] : [r.price]));
  const who = group ? `${group} traveler${group === 1 ? "" : "s"}` : null;
  return (
    <section aria-labelledby="book-summary" className="space-y-3 rounded-2xl bg-surface p-5">
      <h2 id="book-summary" className="font-[family-name:var(--font-display)] text-[1.75rem] font-semibold leading-8 text-daet-ink">
        Book each trip
      </h2>
      <ul className="space-y-3">
        {rows.map(({ p, price }) => (
          <li key={p.id} className="flex justify-between gap-3">
            <span className="min-w-0">
              <Link href={`/tours/packages/${p.id}`} className="font-semibold text-daet-ink hover:underline">
                {p.title}
              </Link>
              <span className="block text-sm text-slate-600 dark:text-slate-400">{[who, p.date ? tourDay(p.date) : null].filter(Boolean).join(" · ")}</span>
            </span>
            <strong className="shrink-0 text-daet-ink">{price !== null ? formatPeso(price) : "See price"}</strong>
          </li>
        ))}
      </ul>
      {group && packages.length > 1 && known.length ? (
        <p className="flex items-baseline justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3 dark:bg-blue-950/40">
          <span className="text-sm font-bold text-blue-800 dark:text-blue-300">{known.length < rows.length ? "At least, if you book all" : packages.length === 2 ? "Total if you book both" : "Total if you book all"}</span>
          <strong className="text-xl text-daet-ink">{formatPeso(known.reduce((a, b) => a + b, 0))}</strong>
        </p>
      ) : null}
      <div className="space-y-2">
        {rows.map(({ p, price }) => (
          <Link key={p.id} href={bookHref(p.id, p.date, group)} className="flex min-h-12 items-center justify-center rounded-full bg-blue-600 px-5 text-center font-bold text-white hover:bg-blue-700">
            Book {p.title}
            {price !== null ? ` · ${formatPeso(price)}` : ""}
          </Link>
        ))}
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">You pay each operator separately. {WEATHER_RULE}</p>
    </section>
  );
}
