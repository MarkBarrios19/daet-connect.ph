import { ButtonLink } from "@/components/ui/button";
import { hasTicket } from "@/lib/tours/ticket";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { issueBookingTicket } from "@/lib/tours/qr-issue";
import { SaveTicketOffline } from "@/components/tours/save-ticket-offline";
import { MapPinIcon } from "@/components/ui/icons";
import { PrintTicketButton } from "./print-ticket-button";
import { getAuthUser } from "@/lib/tours/server-auth";


type PageProps = { params: Promise<{ id: string }> };

const tourDate = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function BookingTicketPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to view tickets.</Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/bookings/${id}/ticket`)}`);

  const { data: booking } = await supabase
    .from("tours_bookings")
    .select("id, booking_reference, status, payment_status, tour_date, number_of_pax, contact_name, tours_packages ( title, location_name )")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!booking) notFound();

  const back = (
    <Link href={`/tours/bookings/${booking.id}`} className="text-sm font-bold text-daet-ink/70 hover:text-daet-ink print:hidden">
      ← Back to booking
    </Link>
  );

  if (!hasTicket(booking)) {
    const unpaid = booking.status === "confirmed" || booking.status === "completed";
    return (
      <PageFrame>
        <div className="mx-auto max-w-md">
          {back}
          <h1 className="display-2 mt-4 text-daet-ink">Your ticket</h1>
          <Notice variant="info" className="mt-4" title={unpaid ? "Pay to get your ticket" : "Your ticket is not ready yet"}>
            {unpaid
              ? "Your ticket QR appears here once the booking is paid in full. Pay the balance on your booking page."
              : booking.status === "pending"
              ? "The ticket appears here once the operator confirms your booking."
              : "This booking is no longer active, so it has no ticket."}
          </Notice>
          {unpaid ? (
            <ButtonLink href={`/tours/bookings/${booking.id}#payment`} className="mt-4">
              Pay the balance
            </ButtonLink>
          ) : null}
        </div>
      </PageFrame>
    );
  }

  const ticket = await issueBookingTicket(booking.id, booking.tour_date);
  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;

  return (
    <PageFrame>
      <div className="mx-auto max-w-md">
        {back}
        {/* A boarding pass: the trip and date on the blue band, the QR in the middle, the details below. */}
        <section className="mt-4 overflow-hidden rounded-2xl bg-surface print:border print:border-black">
          <div className="bg-blue-600 px-5 py-5 text-white print:bg-white print:text-black">
            <p className="font-semibold">CONNECT-Daet tour ticket</p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{pkg?.title ?? "Tour booking"}</h1>
            <p className="mt-1 text-lg">{tourDate(booking.tour_date)}</p>
          </div>
          <div className="px-5 py-6 text-center">
            {ticket ? (
              <img
                src={ticket.pngDataUrl}
                alt={`Ticket QR code for booking ${booking.booking_reference}`}
                width={720}
                height={720}
                className="mx-auto h-64 w-64 print:h-[2.6in] print:w-[2.6in]"
              />
            ) : (
              <Notice variant="warning" className="text-left">
                The ticket QR is not set up on this site yet. Show your booking reference to the guide instead.
              </Notice>
            )}
            <p className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold text-daet-ink">{booking.booking_reference}</p>
            {ticket ? <p className="mt-2 text-daet-ink/80">Show this QR to your guide on the tour day. Valid until the end of the tour day.</p> : null}
          </div>
          <dl className="grid grid-cols-2 gap-px bg-muted text-left">
            <div className="bg-surface px-5 py-3">
              <dt className="text-sm text-daet-ink/75">Guests</dt>
              <dd className="font-bold text-daet-ink">
                {booking.number_of_pax} guest{booking.number_of_pax === 1 ? "" : "s"}
              </dd>
            </div>
            <div className="bg-surface px-5 py-3">
              <dt className="text-sm text-daet-ink/75">Booked by</dt>
              <dd className="truncate font-bold text-daet-ink">{booking.contact_name}</dd>
            </div>
            {pkg?.location_name ? (
              <div className="col-span-2 bg-surface px-5 py-3">
                <dt className="text-sm text-daet-ink/75">Where</dt>
                <dd className="flex items-center gap-1 font-bold text-daet-ink">
                  <MapPinIcon className="h-4 w-4" /> {pkg.location_name}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
        {ticket ? <PrintTicketButton /> : null}
        {ticket ? <SaveTicketOffline /> : null}
      </div>
    </PageFrame>
  );
}
