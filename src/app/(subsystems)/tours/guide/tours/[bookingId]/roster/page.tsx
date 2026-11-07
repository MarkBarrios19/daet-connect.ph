import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";
import { checkInAllowed } from "@/lib/tours/qr-token";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { RosterCheckInButton } from "./roster-check-in-button";
import { getAuthUser } from "@/lib/tours/server-auth";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ bookingId: string }> };

const time = (value: string) => new Date(value).toLocaleTimeString("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });
const tourDate = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function GuideRosterPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to view the guest list.</Notice>
      </PageFrame>
    );
  }

  const { bookingId } = await params;
  if (!isUuid(bookingId)) notFound();
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/guide/tours/${bookingId}/roster`)}`);

  // RLS: the tourist, the operator, the assigned guide and admins can read the booking.
  const { data: booking } = await supabase
    .from("tours_bookings")
    .select("id, user_id, booking_reference, status, payment_status, tour_date, number_of_pax, contact_name, contact_phone, special_requests, tours_packages ( title, location_name )")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.user_id === user.id) notFound();

  const [{ data: participants }, { data: checkins }] = await Promise.all([
    supabase.from("tours_booking_participants").select("id, full_name, age, special_requirements").eq("booking_id", booking.id).order("created_at"),
    supabase.from("tours_checkins").select("participant_id, method, scanned_at").eq("booking_id", booking.id),
  ]);
  const byParticipant = new Map((checkins ?? []).map((row) => [row.participant_id ?? "party", row]));
  const party = byParticipant.get("party");
  const rule = checkInAllowed(booking, toManilaDateKey(new Date()));
  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;
  const guests = participants ?? [];
  const checkedGuests = guests.filter((guest) => byParticipant.has(guest.id)).length;

  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <Link href="/tours/guide/my-tours" className="text-sm font-bold text-daet-ink/70 hover:text-daet-ink">
          ← My tours
        </Link>
        <h1 className="display-2 mt-4 text-daet-ink">Guest list</h1>
        <p className="mt-1 text-sm text-daet-ink/65">
          {pkg?.title ?? "Tour"} · {tourDate(booking.tour_date)}
        </p>

        {!rule.ok ? <Notice variant="info" className="mt-4">{rule.reason}</Notice> : null}

        <section className="mt-6 rounded-2xl card-edge bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-daet-ink">{booking.contact_name}</p>
              <p className="text-sm text-daet-ink/65">
                {booking.booking_reference} · {booking.number_of_pax} guest{booking.number_of_pax === 1 ? "" : "s"}
              </p>
              <a href={`tel:${booking.contact_phone}`} className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest dark:text-blue-300 underline">
                {booking.contact_phone}
              </a>
            </div>
            {party ? (
              <Badge tone="success">Group checked in {time(party.scanned_at)}</Badge>
            ) : (
              <Badge tone="warning">Not checked in</Badge>
            )}
          </div>
          {booking.special_requests ? (
            <p className="mt-3 rounded-2xl bg-daet-sand/40 p-3 text-sm text-daet-ink">
              <span className="font-bold">Requests:</span> {booking.special_requests}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {!party && rule.ok ? <RosterCheckInButton bookingId={booking.id} label="Check in whole group" /> : null}
            {booking.status === "confirmed" && rule.ok ? (
              <Link href={`/tours/guide/tours/${booking.id}/live`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">
                Live map
              </Link>
            ) : null}
            {booking.status === "confirmed" || booking.status === "completed" ? (
              <>
                <OpenChatButton bookingId={booking.id} label="Message group" />
                <OpenChatButton target={{ kind: "guide_tourist", bookingId: booking.id }} label="Message tourist only" variant="ghost" />
              </>
            ) : null}
          </div>
        </section>

        {guests.length > 0 ? (
          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold text-daet-ink">
              Guests <span className="text-sm font-bold text-daet-ink/70">({checkedGuests} of {guests.length} present)</span>
            </h2>
            <ul className="divide-y divide-daet-ink/10 rounded-2xl card-edge bg-surface">
              {guests.map((guest) => {
                const done = byParticipant.get(guest.id);
                return (
                  <li key={guest.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-bold text-daet-ink">{guest.full_name}</p>
                      {guest.special_requirements ? <p className="text-sm text-slate-600 dark:text-slate-400">{guest.special_requirements}</p> : null}
                    </div>
                    {done ? (
                      <Badge tone="success">Present {time(done.scanned_at)}</Badge>
                    ) : rule.ok ? (
                      <RosterCheckInButton bookingId={booking.id} participantId={guest.id} label="Mark present" />
                    ) : (
                      <Badge tone="neutral">Not checked in</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <p className="mt-6 text-sm text-daet-ink/70">The tourist did not list guest names, so check in the group as a whole.</p>
        )}
      </div>
    </PageFrame>
  );
}
