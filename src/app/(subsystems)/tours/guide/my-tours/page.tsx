import type React from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isBusyReason } from "@/lib/tours/guide-swap";
import { SwapRequest, type MySwap } from "./swap-request";
import { getAuthUser } from "@/lib/tours/server-auth";

export const dynamic = "force-dynamic";

export default async function GuideMyToursPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view assigned tours.
        </Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();

  // Get current user
  const user = await getAuthUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/tours/guide/my-tours")}`);
  }

  // Get guide profile with full_name from profiles
  const { data: guide, error: guideError } = await supabase
    .from("tours_guides")
    .select("id, accreditation_status, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (guideError || !guide) {
    return (
      <PageFrame>
        <Notice variant="error" title="Guide profile not found">
          You need an approved guide account to view assigned tours.
        </Notice>
      </PageFrame>
    );
  }

  if (guide.accreditation_status !== "approved") {
    return (
      <PageFrame>
        <Notice variant="warning" title="Account pending approval">
          Your guide account is pending approval. You'll be able to view assigned tours once
          approved.
        </Notice>
      </PageFrame>
    );
  }

  // Get full_name from profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const guideName = profile?.full_name || "Guide";

  // Fetch assigned tours
  const { data: assignedTours, error } = await supabase
    .from("tours_bookings")
    .select(
      `
      *,
      tours_packages (
        id,
        title,
        location_name,
        duration_value,
        duration_type,
        cover_image_url,
        tours_operators (
          business_name,
          contact_phone
        )
      )
    `
    )
    .eq("assigned_guide_id", guide.id)
    .in("status", ["confirmed", "completed"])
    .order("tour_date", { ascending: true });

  if (error) {
    console.error("Assigned tours fetch error:", error);
  }


  // Separate upcoming and completed
  // Compare Manila calendar days so today's tours stay under "Upcoming".
  const today = toManilaDateKey(new Date());
  const upcomingTours =
    assignedTours?.filter((t) => t.status === "confirmed" && t.tour_date >= today) || [];
  const completedTours =
    assignedTours?.filter((t) => t.status === "completed" || t.tour_date < today) || [];

  // R6: other guides free on each upcoming date, and this guide's latest swap request per tour.
  const pickers = new Map(
    await Promise.all(
      [...new Set(upcomingTours.map((t) => t.tour_date))].map(async (date) => {
        const { data } = await supabase.rpc("tours_guides_free_on", { p_date: date });
        const rows = ((data ?? []) as Array<{ guide_id: string; full_name: string; reason: string | null }>)
          .filter((r) => r.guide_id !== guide.id)
          .map((r) => ({ id: r.guide_id, full_name: r.full_name, reason: isBusyReason(r.reason) ? r.reason : null }));
        return [date, rows] as const;
      }),
    ),
  );
  const { data: swapRows } = upcomingTours.length
    ? await supabase
        .from("tours_guide_swap_requests")
        .select("id, booking_id, status, to_guide_id, reason, decision_note, created_at")
        .eq("from_guide_id", guide.id)
        .in("booking_id", upcomingTours.map((t) => t.id))
        .order("created_at", { ascending: false })
    : { data: [] as Array<{ id: string; booking_id: string; status: string; to_guide_id: string | null; reason: string; decision_note: string | null; created_at: string }> };
  const latestSwap = new Map<string, MySwap>();
  for (const row of swapRows ?? []) {
    if (latestSwap.has(row.booking_id)) continue;
    const toName = row.to_guide_id ? [...pickers.values()].flat().find((g) => g.id === row.to_guide_id)?.full_name ?? null : null;
    latestSwap.set(row.booking_id, { id: row.id, status: row.status, toGuideName: toName, reason: row.reason, decisionNote: row.decision_note });
  }

  const todayTours = upcomingTours.filter((t) => t.tour_date === today);
  const laterTours = upcomingTours.filter((t) => t.tour_date > today);

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <Link href="/tours/guide/dashboard" className="mb-4 inline-flex min-h-11 items-center text-sm font-bold text-daet-ink/70 hover:text-daet-ink">
          ← Dashboard
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display-2 text-daet-ink">My tours</h1>
            <p className="mt-1 text-sm text-daet-ink/70">Assigned to {guideName}</p>
          </div>
          <ButtonLink href="/tours/guide/check-in">Scan tickets</ButtonLink>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { label: "Today", value: todayTours.length },
            { label: "Upcoming", value: upcomingTours.length },
            { label: "Completed", value: completedTours.length },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse rounded-2xl card-edge bg-surface p-3 text-center sm:p-4">
              {/* dt before dd for valid markup; flex-col-reverse shows the number on top. */}
              <dt className="text-sm text-daet-ink/70">{stat.label}</dt>
              <dd className="text-2xl font-bold tabular-nums text-daet-ink sm:text-3xl">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {todayTours.length > 0 ? (
          <section aria-labelledby="today-tours" className="mt-8">
            <h2 id="today-tours" className="mb-3 text-xl font-bold text-daet-ink">
              Today
            </h2>
            <div className="space-y-4">
              {todayTours.map((booking) => (
                <TourCard key={booking.id} booking={booking} today={today} swap={<SwapRequest bookingId={booking.id} reference={booking.booking_reference} guides={pickers.get(booking.tour_date) ?? []} latest={latestSwap.get(booking.id) ?? null} />} />
              ))}
            </div>
          </section>
        ) : null}

        {laterTours.length > 0 ? (
          <section aria-labelledby="upcoming-tours" className="mt-8">
            <h2 id="upcoming-tours" className="mb-3 text-xl font-bold text-daet-ink">
              Upcoming
            </h2>
            <div className="space-y-4">
              {laterTours.map((booking) => (
                <TourCard key={booking.id} booking={booking} today={today} swap={<SwapRequest bookingId={booking.id} reference={booking.booking_reference} guides={pickers.get(booking.tour_date) ?? []} latest={latestSwap.get(booking.id) ?? null} />} />
              ))}
            </div>
          </section>
        ) : null}

        {completedTours.length > 0 ? (
          <section aria-labelledby="completed-tours" className="mt-8">
            <h2 id="completed-tours" className="mb-3 text-xl font-bold text-daet-ink">
              Completed
            </h2>
            <ul className="space-y-3">
              {completedTours.map((booking) => {
                const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;
                return (
                  <li key={booking.id} className="flex items-center gap-3 rounded-2xl card-edge bg-surface p-3">
                    {pkg?.cover_image_url ? <img src={pkg.cover_image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-daet-ink">{pkg?.title || "Tour"}</p>
                      <p className="break-words text-sm text-daet-ink/70">
                        {shortDate(booking.tour_date, true)} · {booking.number_of_pax} guest{booking.number_of_pax === 1 ? "" : "s"} · {booking.booking_reference}
                      </p>
                    </div>
                    <Badge tone="info" className="shrink-0">Completed</Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {!assignedTours || assignedTours.length === 0 ? (
          <div className="mt-8 rounded-2xl card-edge bg-surface p-8 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-daet-sand text-daet-ink">
              <LineIcon name="calendar" className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-daet-ink">No assigned tours yet</h2>
            <p className="mt-2 text-sm text-daet-ink/70">Operators assign you to tours once bookings are confirmed.</p>
          </div>
        ) : null}
      </div>
    </PageFrame>
  );
}

const shortDate = (dateKey: string, withYear = false) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: withYear ? undefined : "short", month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" });

type AssignedBooking = {
  id: string;
  tour_date: string;
  status: string;
  number_of_pax: number;
  booking_reference: string;
  tours_packages:
    | { title: string | null; location_name: string | null; cover_image_url: string | null; tours_operators: { business_name: string | null; contact_phone: string | null } | Array<{ business_name: string | null; contact_phone: string | null }> | null }
    | Array<{ title: string | null; location_name: string | null; cover_image_url: string | null; tours_operators: { business_name: string | null; contact_phone: string | null } | Array<{ business_name: string | null; contact_phone: string | null }> | null }>
    | null;
};

/** One assigned tour. On phones the photo sits on top so the details get the full width. */
function TourCard({ booking, today, swap }: { booking: AssignedBooking; today: string; swap: React.ReactNode }) {
  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;
  const operator = Array.isArray(pkg?.tours_operators) ? pkg?.tours_operators[0] : pkg?.tours_operators;
  const isToday = booking.tour_date === today;
  return (
    <article className="overflow-hidden rounded-2xl card-edge bg-surface sm:flex">
      {pkg?.cover_image_url ? <img src={pkg.cover_image_url} alt="" className="h-36 w-full object-cover sm:h-auto sm:w-44 sm:shrink-0" /> : null}
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-lg font-bold text-daet-ink">{pkg?.title || "Tour"}</h3>
          <Badge tone={isToday ? "brand" : "success"} className="shrink-0">
            {isToday ? "Today" : "Upcoming"}
          </Badge>
        </div>
        {pkg?.location_name ? (
          <p className="mt-1 flex items-center gap-1 text-sm text-daet-ink/70">
            <LineIcon name="pin" className="h-4 w-4 shrink-0" /> {pkg.location_name}
          </p>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {[
            ["Date", shortDate(booking.tour_date)],
            ["Guests", `${booking.number_of_pax} guest${booking.number_of_pax === 1 ? "" : "s"}`],
            ["Operator", operator?.business_name || "—"],
            ["Reference", booking.booking_reference],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-daet-ink/70">{label}</dt>
              <dd className="break-words font-bold text-daet-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {operator?.contact_phone ? (
          <p className="mt-2 text-sm text-daet-ink/70">
            Operator contact:{" "}
            <a href={`tel:${operator.contact_phone}`} className="font-bold text-blue-700 underline dark:text-blue-300">
              {operator.contact_phone}
            </a>
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {isToday && booking.status === "confirmed" ? <ButtonLink href={`/tours/guide/tours/${booking.id}/live`}>Live map</ButtonLink> : null}
          <ButtonLink href={`/tours/guide/tours/${booking.id}/roster`} variant="secondary">
            {isToday ? "Guest list & check-in" : "Guest list"}
          </ButtonLink>
        </div>
        {swap}
      </div>
    </article>
  );
}
