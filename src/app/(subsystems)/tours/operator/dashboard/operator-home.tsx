import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageFrame } from "@/components/ui/page-frame";
import { MonthCalendar } from "@/components/tours/month-calendar";
import { QrVerifyScanner } from "@/components/tours/qr-verify-scanner";
import { RatingBadge } from "@/components/tours/star-rating";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bookingsByDay, occupancy } from "@/lib/tours/dashboards";
import { guideCoverageNote } from "@/lib/tours/guide-not-needed";
import { loadGuideNotNeeded } from "@/lib/tours/guide-not-needed-server";
import { currentManilaMonth, formatDayHeading, isDateKey, monthKey, parseMonthParam, shiftMonth, toManilaDateKey } from "@/lib/tours/events-calendar";
import { summarizeLedger } from "@/lib/tours/ledger";
import { toSummary } from "@/lib/tours/reviews";
import { loadOperatorLedger } from "../payments/load-ledger";

const peso = formatPeso;

type DayBooking = {
  id: string;
  booking_reference: string;
  tour_date: string;
  status: string;
  number_of_pax: number;
  contact_name: string;
  assigned_guide_id: string | null;
  /** Filled in from loadGuideNotNeeded(): set when the guest asked to go without a guide. */
  guide_not_needed_at?: string | null;
  tours_packages: { title: string; operator_id: string } | { title: string; operator_id: string }[] | null;
};

const STATUS_TONE: Record<string, "success" | "warning" | "info"> = { confirmed: "success", pending: "warning", completed: "info" };
const STATUS_LABEL: Record<string, string> = { pending: "To confirm", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", rejected: "Declined" };

/** Operator dashboard body: today's tours, booking calendar, month revenue, occupancy, ratings. */
export async function OperatorHome({ operatorId, searchParams }: { operatorId: string; searchParams: Record<string, string | string[] | undefined> }) {
  const supabase = await createSupabaseServerClient();
  const today = toManilaDateKey(new Date());
  const month = parseMonthParam(searchParams.month);
  const key = monthKey(month);
  const nextKey = monthKey(shiftMonth(month, 1));
  const dayParam = Array.isArray(searchParams.day) ? searchParams.day[0] : searchParams.day;
  const selectedDay = isDateKey(dayParam) && dayParam.startsWith(key) ? dayParam : key === today.slice(0, 7) ? today : null;
  const thisMonth = currentManilaMonth();

  const [{ data: operator }, { data: monthBookings }, { data: todays }, { count: pendingCount }, { data: availability }, { data: ratingRow }, { count: unreplied }, ledger] = await Promise.all([
    supabase.from("tours_operators").select("business_name").eq("id", operatorId).maybeSingle(),
    supabase
      .from("tours_bookings")
      .select("id, booking_reference, tour_date, status, number_of_pax, contact_name, assigned_guide_id, tours_packages!inner ( title, operator_id )")
      .eq("tours_packages.operator_id", operatorId)
      .gte("tour_date", `${key}-01`)
      .lt("tour_date", `${nextKey}-01`)
      .order("tour_date"),
    supabase
      .from("tours_bookings")
      .select("id, booking_reference, tour_date, status, number_of_pax, contact_name, assigned_guide_id, tours_packages!inner ( title, operator_id )")
      .eq("tours_packages.operator_id", operatorId)
      .eq("tour_date", today)
      .in("status", ["pending", "confirmed", "completed"]),
    supabase
      .from("tours_bookings")
      .select("id, tours_packages!inner ( operator_id )", { count: "exact", head: true })
      .eq("tours_packages.operator_id", operatorId)
      .eq("status", "pending"),
    supabase
      .from("tours_package_availability")
      .select("capacity_total, capacity_booked, tours_packages!inner ( operator_id )")
      .eq("tours_packages.operator_id", operatorId)
      .gte("available_date", `${key}-01`)
      .lt("available_date", `${nextKey}-01`),
    supabase.from("tours_operator_ratings").select("review_count, average_rating").eq("operator_id", operatorId).maybeSingle(),
    supabase.from("tours_reviews").select("id", { count: "exact", head: true }).eq("operator_id", operatorId).is("operator_reply", null).eq("is_hidden", false),
    loadOperatorLedger(month),
  ]);

  const monthRows = (monthBookings ?? []) as unknown as DayBooking[];
  const todayRows = (todays ?? []) as unknown as DayBooking[];
  // Its own read, so a database that is a migration behind still draws the page.
  const guideNotNeeded = await loadGuideNotNeeded(supabase, [...monthRows, ...todayRows].map((b) => b.id));
  const withGuideRequest = (rows: DayBooking[]): DayBooking[] =>
    rows.map((row) => ({ ...row, guide_not_needed_at: guideNotNeeded.get(row.id)?.at ?? null }));
  const bookings = withGuideRequest(monthRows);
  const load = bookingsByDay(bookings);
  const occ = occupancy(availability ?? []);
  const revenue = ledger.ok ? summarizeLedger(ledger.rows) : null;
  const rating = toSummary(ratingRow);
  const todayList = withGuideRequest(todayRows);
  const dayList = selectedDay ? bookings.filter((b) => b.tour_date === selectedDay && b.status !== "rejected") : [];
  const title = (b: DayBooking) => (Array.isArray(b.tours_packages) ? b.tours_packages[0]?.title : b.tours_packages?.title) ?? "Tour";
  const monthHref = (m: string) => `/tours/operator/dashboard?month=${m}`;

  return (
    <PageFrame>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display-2 text-daet-ink">{operator?.business_name ?? "Your business"}</h1>
        </div>
        {/* Bookings and Packages live in the header and tab bar; only what has no other home is here. */}
        <div className="flex flex-wrap gap-2">
          <OpenChatButton target={{ kind: "operator_admin" }} label="Contact Tourism Office" variant="ghost" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">Waiting for you</p>
          <p className="mt-1 text-2xl font-bold text-yellow-800 dark:text-yellow-200">{pendingCount ?? 0}</p>
          <Link href="/tours/operator/bookings?status=pending" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 hover:underline">
            {pendingCount === 1 ? "Booking to confirm →" : "Bookings to confirm →"}
          </Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">Received in {key === monthKey(thisMonth) ? "this month" : key}</p>
          <p className="mt-1 text-2xl font-bold text-daet-forest dark:text-blue-300">{revenue ? peso(revenue.received) : "—"}</p>
          <Link href={`/tours/operator/payments?month=${key}`} className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 hover:underline">
            Revenue report →
          </Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">Occupancy</p>
          <p className="mt-1 text-2xl font-bold text-daet-ink">{occ.percent === null ? "—" : `${occ.percent}%`}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{occ.seats ? `${occ.booked} of ${occ.seats} seats · ${occ.openDays} open days` : "No open dates this month"}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">Rating</p>
          <div className="mt-1">
            <RatingBadge summary={rating} />
          </div>
          <Link href="/tours/operator/reviews" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 hover:underline">
            {unreplied ? `${unreplied} to reply →` : "Reviews →"}
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Tours by date" />
          <MonthCalendar
            month={month}
            today={today}
            prevHref={monthHref(monthKey(shiftMonth(month, -1)))}
            nextHref={monthHref(nextKey)}
            renderDay={(cell, isToday) => {
              const day = load.get(cell.dateKey);
              const selected = cell.dateKey === selectedDay;
              return (
                <Link
                  href={`/tours/operator/dashboard?month=${key}&day=${cell.dateKey}`}
                  scroll={false}
                  aria-current={selected ? "date" : undefined}
                  className={`flex h-12 flex-col items-center justify-center rounded-2xl text-sm transition ${selected ? "bg-daet-forest text-white" : day ? "bg-daet-sand font-bold text-daet-ink hover:bg-daet-sand/70" : "text-daet-ink/70 hover:bg-daet-sand/50"} ${isToday && !selected ? "ring-2 ring-daet-forest/40" : ""}`}
                >
                  <span>{cell.day}</span>
                  {day ? <span className={`text-[10px] leading-none ${selected ? "text-white" : "text-daet-forest dark:text-blue-300"}`}>{day.pax} pax</span> : null}
                  <span className="sr-only">
                    {` ${formatDayHeading(cell.dateKey)}${day ? `, ${day.bookings} booking${day.bookings === 1 ? "" : "s"}` : ""}`}
                  </span>
                </Link>
              );
            }}
          />
          {selectedDay ? (
            <div className="mt-4 border-t border-daet-ink/10 pt-4">
              <p className="mb-2 text-sm font-bold text-daet-ink">{formatDayHeading(selectedDay)}</p>
              {dayList.length === 0 ? (
                <p className="text-sm text-daet-ink/70">No bookings on this day.</p>
              ) : (
                <BookingLines bookings={dayList} title={title} />
              )}
            </div>
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader description={formatDayHeading(today)} title="Today's tours" />
            {todayList.length === 0 ? (
              <EmptyState icon={<LineIcon name="calendar" />} title="No tours today" className="p-5" />
            ) : (
              <BookingLines bookings={todayList} title={title} />
            )}
          </Card>

          <Card>
            <QrVerifyScanner expectedType="booking" />
          </Card>

          {revenue && revenue.byPackage.length > 0 ? (
            <Card>
              <CardHeader title="Revenue by package" action={<Link href={`/tours/operator/payments/export?month=${key}`} prefetch={false} className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 hover:underline">Download CSV</Link>} />
              <ul className="space-y-2">
                {revenue.byPackage.slice(0, 5).map((entry) => (
                  <li key={entry.title}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate font-bold text-daet-ink">{entry.title}</span>
                      <span className="shrink-0 text-daet-ink/70">{peso(entry.amount)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-daet-sand" aria-hidden="true">
                      <div className="h-2 rounded-full bg-daet-forest" style={{ width: `${Math.max(2, (entry.amount / revenue.received) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Manage" />
            <div className="grid grid-cols-2 gap-2">
              {[
                ["/tours/operator/live", "Live now"],
                ["/tours/operator/reviews", "Reviews"],
                ["/tours/operator/merch", "Merchandise"],
                ["/tours/operator/settings", "Payment settings"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="flex min-h-12 items-center justify-between rounded-2xl bg-canvas px-4 font-bold text-daet-ink transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-[0.98]">
                  {label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}

function BookingLines({ bookings, title }: { bookings: DayBooking[]; title: (b: DayBooking) => string }) {
  return (
    <ul className="divide-y divide-daet-ink/10">
      {bookings.map((b) => (
        <li key={b.id} className="flex items-start justify-between gap-2 py-2">
          <div className="min-w-0 flex-1">
            {/* Names wrap rather than being cut mid-word. */}
            <Link href={`/tours/operator/bookings?status=${b.status}#booking-${b.id}`} className="flex min-h-11 items-center font-bold leading-snug text-daet-ink hover:underline">
              {title(b)}
            </Link>
            <p className="truncate text-sm text-slate-600 dark:text-slate-400">
              {b.booking_reference} · {b.contact_name} · {b.number_of_pax} guest{b.number_of_pax === 1 ? "" : "s"}
              {guideCoverageNote(b)}
            </p>
          </div>
          <Badge tone={STATUS_TONE[b.status] ?? "neutral"} className="mt-3 shrink-0">{STATUS_LABEL[b.status] ?? b.status}</Badge>
        </li>
      ))}
    </ul>
  );
}
