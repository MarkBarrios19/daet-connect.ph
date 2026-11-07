import { LiveCount } from "@/components/live/live-count";
import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { canAccessGuideDashboard } from "@/lib/tours/guide-access";
import { GUIDE_OWN_STATUS_SELECT, GUIDE_TABLE, GUIDE_USER_ID_COLUMN } from "@/lib/tours/guide-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { RatingBadge } from "@/components/tours/star-rating";
import { formatDayHeading, monthKey, parseMonthParam, shiftMonth, toManilaDateKey } from "@/lib/tours/events-calendar";
import { toSummary } from "@/lib/tours/reviews";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { chatOperators } from "@/lib/tours/messaging";
import { AvailabilityCalendar } from "./availability-calendar";


export default async function GuideDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParamsValue = await searchParams;
  if (!isSupabaseConfigured()) return <PageFrame><Notice variant="warning" title="Supabase setup is needed">Configure Supabase before opening the guide dashboard.</Notice></PageFrame>;

  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/guide/dashboard")}`);
  if (session.role === "admin") redirect("/tours/admin/guides");
  if (session.error || !session.role) return <PageFrame><Notice variant="error" title="We could not verify your account">{session.error ?? "Your role could not be verified."}</Notice></PageFrame>;

  const supabase = await createSupabaseServerClient();
  const { data: guide, error } = await supabase
    .from(GUIDE_TABLE)
    .select(GUIDE_OWN_STATUS_SELECT)
    .eq(GUIDE_USER_ID_COLUMN, session.user.id)
    .maybeSingle();
  if (error) return <PageFrame><Notice variant="error" title="Guide accreditation could not be checked">Access is paused until status can be verified.</Notice></PageFrame>;
  if (!guide) redirect("/tours/guide/register");
  if (guide.accreditation_status !== "approved") {
    if (guide.accreditation_status === "rejected") redirect("/tours/guide/register");
    redirect("/tours/guide/pending");
  }
  if (!canAccessGuideDashboard(session.role, guide.accreditation_status)) {
    return <PageFrame><Notice variant="error" title="Guide access is not enabled">Your application is approved, but your account role does not match. Contact the Tourism Office administrator.</Notice></PageFrame>;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", session.user.id)
    .maybeSingle();
  if (profileError || !profile?.full_name) {
    return <PageFrame><Notice variant="error" title="Your guide profile name is unavailable">Contact the Tourism Office so your public profile can be checked.</Notice></PageFrame>;
  }

  const today = toManilaDateKey(new Date());
  const month = parseMonthParam(searchParamsValue.month);
  const key = monthKey(month);
  const nextKey = monthKey(shiftMonth(month, 1));
  const [{ data: monthTours }, { data: availability }, { data: upcoming }, { data: ratingRow }, { data: packageLinks }, { data: assignedTours }] = await Promise.all([
    supabase
      .from("tours_bookings")
      .select("tour_date")
      .eq("assigned_guide_id", guide.id)
      .in("status", ["confirmed", "completed"])
      .gte("tour_date", `${key}-01`)
      .lt("tour_date", `${nextKey}-01`),
    supabase
      .from("tours_guide_availability")
      .select("available_date, is_available")
      .eq("guide_id", guide.id)
      .gte("available_date", `${key}-01`)
      .lt("available_date", `${nextKey}-01`),
    supabase
      .from("tours_bookings")
      .select("id, booking_reference, tour_date, number_of_pax, contact_name, tours_packages ( title, location_name )")
      .eq("assigned_guide_id", guide.id)
      .eq("status", "confirmed")
      .gte("tour_date", today)
      .order("tour_date")
      .limit(5),
    supabase.from("tours_guide_ratings").select("review_count, average_rating").eq("guide_id", guide.id).maybeSingle(),
    supabase.from("tours_package_guides").select("tours_packages ( tours_operators ( id, business_name ) )").eq("guide_id", guide.id).eq("is_active", true).limit(50),
    supabase.from("tours_bookings").select("tours_packages ( tours_operators ( id, business_name ) )").eq("assigned_guide_id", guide.id).order("tour_date", { ascending: false }).limit(50),
  ]);
  const operators = chatOperators([...(packageLinks ?? []), ...(assignedTours ?? [])]);
  const tourCounts: Record<string, number> = {};
  for (const t of monthTours ?? []) tourCounts[t.tour_date] = (tourCounts[t.tour_date] ?? 0) + 1;
  const availabilityMap = Object.fromEntries((availability ?? []).map((a) => [a.available_date, a.is_available]));
  const upcomingTours = (upcoming ?? []) as unknown as Array<{ id: string; booking_reference: string; tour_date: string; number_of_pax: number; contact_name: string; tours_packages: { title: string; location_name: string } | { title: string; location_name: string }[] | null }>;
  const todays = upcomingTours.filter((t) => t.tour_date === today);
  const later = upcomingTours.filter((t) => t.tour_date !== today);
  const pkgTitle = (t: (typeof upcomingTours)[number]) => (Array.isArray(t.tours_packages) ? t.tours_packages[0]?.title : t.tours_packages?.title) ?? "Tour";

  return (
    <PageFrame>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display-2 text-daet-ink">Welcome, {profile.full_name}.</h1>
          <div className="mt-2">
            <RatingBadge summary={toSummary(ratingRow)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/tours/guide/check-in"><LineIcon name="camera" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Scan tickets</ButtonLink>
          <ButtonLink href="/tours/guide/my-qr" variant="secondary">
            <LineIcon name="idcard" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> My QR badge
          </ButtonLink>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader description={formatDayHeading(today)} title="Today" />
            <p className="mb-3 text-sm text-daet-ink/70">
              <LiveCount name="guideToday" initial={todays.length} className="font-bold" /> today · <LiveCount name="guideUpcoming" initial={upcomingTours.length} className="font-bold" /> upcoming
            </p>
            {todays.length === 0 ? (
              <p className="text-sm text-daet-ink/70">No tours assigned to you today.</p>
            ) : (
              <ul className="space-y-3">
                {todays.map((t) => (
                  <li key={t.id} className="rounded-2xl bg-daet-sand/40 p-3">
                    <p className="font-bold text-daet-ink">{pkgTitle(t)}</p>
                    <p className="break-words text-sm text-slate-600 dark:text-slate-400">
                      {t.booking_reference} · {t.contact_name} · {t.number_of_pax} guest{t.number_of_pax === 1 ? "" : "s"}
                    </p>
                    {/* Scanning lives in the Scan tickets button above and the Scan tab, so the row stays on one line. */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ButtonLink href={`/tours/guide/tours/${t.id}/live`} className="px-5">
                        <LineIcon name="pin" className="h-4 w-4" /> Live map
                      </ButtonLink>
                      <ButtonLink href={`/tours/guide/tours/${t.id}/roster`} variant="secondary" className="px-5">
                        Guest list
                      </ButtonLink>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Your operators" />
            {operators.length === 0 ? (
              <p className="text-sm text-daet-ink/70">Operators who add you to a package or assign you a tour appear here so you can message them.</p>
            ) : (
              <ul className="divide-y divide-daet-ink/10">
                {operators.map((operator) => (
                  <li key={operator.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <p className="font-bold text-daet-ink">{operator.business_name}</p>
                    <OpenChatButton target={{ kind: "operator_guide", operatorId: operator.id }} label="Message operator" variant="ghost" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Next tours" action={<Link href="/tours/guide/my-tours" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 hover:underline">All tours</Link>} />
            {later.length === 0 ? (
              <p className="text-sm text-daet-ink/70">No upcoming assignments yet. Mark the days you can work so operators can assign you.</p>
            ) : (
              <ul className="divide-y divide-daet-ink/10">
                {later.map((t) => (
                  <li key={t.id} className="py-2">
                    <p className="font-bold text-daet-ink">{pkgTitle(t)}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {formatDayHeading(t.tour_date)} · {t.number_of_pax} guest{t.number_of_pax === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Your availability" />
          <p className="mb-3 text-sm text-daet-ink/70">Choose what a tap marks, then tap days. Tap a marked day again to clear it. Operators can only assign you on days marked available. To give up a day you're already booked on, use “Suggest another guide” on that tour.</p>
          <AvailabilityCalendar
            key={key}
            month={month}
            today={today}
            prevHref={`/tours/guide/dashboard?month=${monthKey(shiftMonth(month, -1))}`}
            nextHref={`/tours/guide/dashboard?month=${nextKey}`}
            initial={availabilityMap}
            tours={tourCounts}
          />
        </Card>
      </div>
    </PageFrame>
  );
}
