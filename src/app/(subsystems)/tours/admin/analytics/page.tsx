import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { cancellationRate, fillDays, parseAnalytics, parseAnalyticsRange, queueBuckets, RANGE_PRESETS } from "@/lib/tours/dashboards";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export const metadata = { title: "Tourism analytics" };

const peso = formatPeso;
const shortDay = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" });

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/analytics" />;

  const today = toManilaDateKey(new Date());
  const range = parseAnalyticsRange(await searchParams, today);
  const { data, error } = await admin.supabase.rpc("tours_admin_analytics", { p_from: range.from, p_to: range.to });
  const a = parseAnalytics(data);
  const arrivals = fillDays(a.arrivals, range.from, range.to);
  const checkins = arrivals.reduce((s, p) => s + p.checkins, 0);
  const revenue = a.operators.reduce((s, o) => s + o.revenue, 0);
  const cancelRate = cancellationRate(a.bookings);
  const buckets = queueBuckets(a.queue);
  const oldest = a.queue[0];
  const ratingTotal = a.ratings.reduce((s, r) => s + r.count, 0);

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Analytics" backHref="/tours/admin" backLabel="Admin dashboard" />

      <nav aria-label="Date range" className="mb-6 flex flex-wrap items-center gap-2">
        {/* The four presets share one row, even on a phone. */}
        <div className="grid w-full grid-cols-4 gap-1 rounded-full bg-muted p-1 sm:w-auto">
          {RANGE_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={`/tours/admin/analytics?range=${p.key}`}
              aria-current={range.preset === p.key ? "page" : undefined}
              className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-2 text-sm font-bold sm:px-4 ${range.preset === p.key ? "bg-daet-forest text-white" : "text-daet-ink hover:bg-surface"}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm" action="/tours/admin/analytics">
          <label className="sr-only" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={range.from} max={today} className="min-h-11 rounded-full border border-daet-ink/15 bg-surface px-3" />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={range.to} max={today} className="min-h-11 rounded-full border border-daet-ink/15 bg-surface px-3" />
          <button type="submit" className="min-h-11 rounded-full border border-daet-forest/30 bg-surface px-4 font-bold text-daet-leaf dark:text-blue-300 hover:bg-daet-forest/5">
            Apply
          </button>
        </form>
      </nav>

      {error ? (
        <Notice variant="error" className="mb-6" title="Analytics could not be loaded">
          Please try again in a moment.
        </Notice>
      ) : null}

      <p className="mb-3 text-sm text-daet-ink/70">
        {shortDay(range.from)} – {shortDay(range.to)}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tourist check-ins" value={checkins.toLocaleString("en-PH")} note="arrivals scanned by guides" />
        <Stat label="Bookings" value={a.bookings.total.toLocaleString("en-PH")} note={`${a.bookings.pax.toLocaleString("en-PH")} travellers confirmed`} />
        <Stat label="Revenue received" value={peso(revenue)} note="all operators" />
        <Stat label="Cancellation rate" value={cancelRate === null ? "—" : `${cancelRate}%`} note={`${a.bookings.cancelled} cancelled · ${a.bookings.rejected} declined`} />
      </div>

      <Card className="mb-6">
        <ColumnChart title="Arrivals per day (check-ins)" unit="check-ins" points={arrivals.map((p) => ({ key: p.day, label: shortDay(p.day), value: p.checkins }))} />
      </Card>

      {/* grid-cols-1 (minmax(0,1fr)) keeps the track at the card width: a
          single-line BarList label must not size the track to its content,
          or every card and bar runs off the right edge of a phone. */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by operator" />
          <BarList
            items={a.operators.filter((o) => o.revenue > 0 || o.bookings > 0).map((o) => ({ key: o.id, label: o.business_name, value: o.revenue, display: peso(o.revenue), note: `· ${o.bookings} booking${o.bookings === 1 ? "" : "s"}` }))}
            empty="No bookings or payments in this range."
          />
        </Card>
        <Card>
          <CardHeader title="Top packages" />
          <BarList
            items={a.topPackages.map((p) => ({ key: p.id, label: <Link href={`/tours/packages/${p.id}`} className="hover:underline">{p.title}</Link>, value: p.bookings, note: `bookings · ${p.pax} pax` }))}
            empty="No bookings in this range."
          />
        </Card>
        <Card>
          <CardHeader title="Top attractions in trip plans" />
          <BarList
            items={a.topAttractions.map((t) => ({ key: t.id, label: <Link href={`/tours/attractions/${t.slug}`} className="hover:underline">{t.name}</Link>, value: t.planned, note: "plans" }))}
            empty="No saved trip plans in this range."
          />
        </Card>
        <Card>
          <CardHeader title="Rating distribution" action={<Link href="/tours/admin/reviews" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 hover:underline">Moderate</Link>} />
          <BarList
            items={ratingTotal ? a.ratings.map((r) => ({ key: String(r.stars), label: `${r.stars} ★`, value: r.count })) : []}
            empty="No reviews in this range."
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="Accreditation queue" action={<Link href="/tours/admin/operators" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 hover:underline">Review applications</Link>} />
        <p className="mb-3 text-sm text-daet-ink/65">
          {a.queue.length === 0 ? "No applications are waiting." : `${a.queue.length} waiting now. Oldest: ${oldest.name} (${oldest.kind}), ${oldest.waiting_days} day${oldest.waiting_days === 1 ? "" : "s"}.`}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {buckets.map((b, i) => (
            <div key={b.label} className="bg-canvas rounded-2xl p-3 text-center">
              <p className="text-2xl font-bold text-daet-ink">{b.count}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{b.label}</p>
              {i === 2 && b.count > 0 ? (
                <Badge tone="warning" className="mt-1">
                  <LineIcon name="warning" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Overdue
                </Badge>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </PageFrame>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-daet-ink">{value}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{note}</p>
    </Card>
  );
}
