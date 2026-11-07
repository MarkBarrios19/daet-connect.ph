import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { formatClock } from "@/lib/tours/live-tracking";
import { getAuthUser } from "@/lib/tours/server-auth";


const shiftDay = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Today's tours (and yesterday's multi-day ones still running) with their live state. */
export default async function OperatorLivePage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to use the live board.</Notice>
      </PageFrame>
    );
  }
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/operator/live")}`);

  const { data: operator } = await supabase.from("tours_operators").select("id, accreditation_status").eq("profile_id", user.id).maybeSingle();
  if (!operator || operator.accreditation_status !== "approved") {
    return (
      <PageFrame>
        <Notice variant="error" title="Approved operator account required">You need an approved operator account to see live tours.</Notice>
      </PageFrame>
    );
  }

  const today = toManilaDateKey(new Date());
  const { data: bookings } = await supabase
    .from("tours_bookings")
    .select("id, tour_date, booking_reference, contact_name, number_of_pax, assigned_guide_id, tours_packages!inner ( title, operator_id, meeting_time )")
    .eq("tours_packages.operator_id", operator.id)
    .eq("status", "confirmed")
    .gte("tour_date", shiftDay(today, -1))
    .lte("tour_date", shiftDay(today, 1))
    .order("tour_date");
  const ids = (bookings ?? []).map((b) => b.id);
  const [{ data: sessions }, { data: flares }, { data: positions }] = ids.length
    ? await Promise.all([
        supabase.from("tours_live_sessions").select("booking_id, started_at, ended_at, stops_reached").in("booking_id", ids),
        supabase.from("tours_live_flares").select("booking_id").in("booking_id", ids).is("resolved_at", null),
        supabase.from("tours_live_positions").select("booking_id, role").in("booking_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const sessionBy = new Map((sessions ?? []).map((s) => [s.booking_id, s]));
  const alertCount = (id: string) => (flares ?? []).filter((f) => f.booking_id === id).length;
  const sharing = (id: string) => (positions ?? []).some((p) => p.booking_id === id && p.role === "tourist");

  const rows = (bookings ?? []).map((b) => {
    const pkg = Array.isArray(b.tours_packages) ? b.tours_packages[0] : b.tours_packages;
    const s = sessionBy.get(b.id);
    const state = s && !s.ended_at ? "live" : s?.ended_at ? "ended" : "waiting";
    return { b, pkg, s, state, alerts: alertCount(b.id) };
  });
  // Alerts first, then live tours, then the rest.
  rows.sort((x, y) => y.alerts - x.alerts || Number(y.state === "live") - Number(x.state === "live"));

  return (
    <PageFrame>
      <DashboardHeader backHref="/tours/operator/dashboard" backLabel="Dashboard" title="Live now" description="Your tours from yesterday to tomorrow. Open one to see the guide and, if they share, the guest on the map." />
      {rows.length === 0 ? (
        <EmptyState title="No tours around today" description="Confirmed tours for yesterday, today and tomorrow show here." />
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {rows.map(({ b, pkg, s, state, alerts }) => (
            <li key={b.id}>
              <Link href={`/tours/operator/live/${b.id}`} className={`block rounded-2xl p-4 hover:ring-2 hover:ring-blue-600 ${alerts ? "bg-red-50 dark:bg-red-950/40" : "bg-surface"}`}>
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-bold text-daet-ink">{pkg?.title ?? "Tour"}</span>
                  {alerts ? (
                    <Badge tone="danger">{alerts === 1 ? "1 alert" : `${alerts} alerts`}</Badge>
                  ) : state === "live" ? (
                    <Badge tone="danger">Live</Badge>
                  ) : state === "ended" ? (
                    <Badge>Ended</Badge>
                  ) : (
                    <Badge tone="info">{b.tour_date === today ? "Today" : b.tour_date < today ? "Yesterday" : "Tomorrow"}</Badge>
                  )}
                </span>
                <span className="mt-1 block text-sm text-daet-ink/75">
                  {b.contact_name} · {b.number_of_pax} guest{b.number_of_pax === 1 ? "" : "s"} · {b.booking_reference}
                </span>
                <span className="mt-1 block text-sm text-daet-ink/75">
                  {!b.assigned_guide_id
                    ? "No guide assigned yet."
                    : state === "live"
                      ? `Live since ${formatClock(s!.started_at)} · ${s!.stops_reached} stop${s!.stops_reached === 1 ? "" : "s"} reached · ${sharing(b.id) ? "guest sharing" : "guest not sharing"}`
                      : state === "ended"
                        ? `Ended ${formatClock(s!.ended_at!)}`
                        : pkg?.meeting_time
                          ? `Meets at ${pkg.meeting_time.slice(0, 5)}`
                          : "Not started"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
