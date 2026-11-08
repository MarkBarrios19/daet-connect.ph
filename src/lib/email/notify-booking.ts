import "server-only";
import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bookingConfirmedEmail, bookingReceivedEmail, guideAssignedEmail, newBookingForOperatorEmail, paymentReceivedEmail, paymentReceivedForOperatorEmail, refundSentEmail, tripCalledOffEmail, type BookingEmailData } from "@/lib/email/booking-emails";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { meetingPointOf, meetingTimeLabel } from "@/lib/tours/guide/meeting";

/**
 * Booking emails, sent after the response so a slow mail server never holds
 * up the operator or PayMongo. Each trigger already happens once per event:
 * the pending → confirmed change, and a newly recorded payment (the ledger
 * skips duplicates), so the emails don't repeat.
 */

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

type BookingRow = {
  id: string;
  booking_reference: string;
  contact_name: string | null;
  contact_email: string | null;
  tour_date: string;
  number_of_pax: number;
  total_amount: number | string;
  total_paid: number | string | null;
  tours_packages: {
    title: string;
    location_name: string;
    meeting_point_name?: string | null;
    meeting_lat?: number | string | null;
    meeting_lng?: number | string | null;
    meeting_time?: string | null;
    tours_operators: { business_name: string; contact_email?: string | null } | Array<{ business_name: string; contact_email?: string | null }> | null;
  } | null;
};

async function loadBooking(bookingId: string): Promise<{ to: string; data: BookingEmailData; operatorEmail: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("tours_bookings")
    .select("id, booking_reference, contact_name, contact_email, tour_date, number_of_pax, total_amount, total_paid, tours_packages ( title, location_name, meeting_point_name, meeting_lat, meeting_lng, meeting_time, tours_operators ( business_name, contact_email ) )")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as BookingRow;
  const pkg = one(row.tours_packages);
  if (!row.contact_email || !pkg) return null;
  const meeting = meetingPointOf(pkg);
  const base = appUrl();
  return {
    to: row.contact_email,
    operatorEmail: one(pkg.tours_operators)?.contact_email ?? null,
    data: {
      reference: row.booking_reference,
      contactName: row.contact_name,
      tourTitle: pkg.title,
      tourDate: row.tour_date,
      pax: row.number_of_pax,
      operatorName: one(pkg.tours_operators)?.business_name ?? null,
      meetingPoint: meeting.name || null,
      meetingTime: meetingTimeLabel(meeting.time),
      totalAmount: Number(row.total_amount ?? 0),
      totalPaid: Number(row.total_paid ?? 0),
      bookingUrl: `${base}/tours/bookings/${row.id}`,
      ticketUrl: `${base}/tours/bookings/${row.id}/ticket`,
    },
  };
}

/** Runs after the response when inside a request; directly otherwise (scripts, tests). */
function later(task: () => Promise<unknown>) {
  const run = () => task().catch((error) => console.error("Booking email error:", error instanceof Error ? error.message : error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** A new request: tell the tourist it was received and the operator to review it. */
export function emailBookingReceived(bookingId: string) {
  if (!isEmailConfigured()) return;
  later(async () => {
    const booking = await loadBooking(bookingId);
    if (!booking) return;
    await sendEmail({ to: booking.to, ...bookingReceivedEmail(booking.data) });
    if (booking.operatorEmail) {
      await sendEmail({ to: booking.operatorEmail, ...newBookingForOperatorEmail(booking.data, `${appUrl()}/tours/operator/bookings?status=pending`) });
    }
  });
}

export function emailBookingConfirmed(bookingId: string) {
  if (!isEmailConfigured()) return;
  later(async () => {
    const booking = await loadBooking(bookingId);
    if (booking) await sendEmail({ to: booking.to, ...bookingConfirmedEmail(booking.data) });
  });
}

export function emailPaymentReceived(bookingId: string, amount: number) {
  if (!isEmailConfigured()) return;
  later(async () => {
    const booking = await loadBooking(bookingId);
    if (!booking) return;
    await sendEmail({ to: booking.to, ...paymentReceivedEmail(booking.data, amount) });
    if (booking.operatorEmail) {
      await sendEmail({ to: booking.operatorEmail, ...paymentReceivedForOperatorEmail(booking.data, amount, `${appUrl()}/tours/operator/bookings`) });
    }
  });
}

/** Tells a guide they were assigned a tour. The address is the guide's sign-in email. */
export function emailGuideAssigned(bookingId: string, guideId: string) {
  if (!isEmailConfigured()) return;
  later(async () => {
    const booking = await loadBooking(bookingId);
    if (!booking) return;
    const admin = createSupabaseAdminClient();
    const { data: guide } = await admin.from("tours_guides").select("profile_id").eq("id", guideId).maybeSingle();
    if (!guide?.profile_id) return;
    const [{ data: authUser }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(guide.profile_id),
      admin.from("profiles").select("full_name").eq("id", guide.profile_id).maybeSingle(),
    ]);
    const to = authUser?.user?.email;
    if (to) await sendEmail({ to, ...guideAssignedEmail(booking.data, profile?.full_name ?? null, `${appUrl()}/tours/guide/my-tours`) });
  });
}

export function emailTripCalledOff(bookingId: string, reason: string) {
  if (!isEmailConfigured()) return;
  later(async () => {
    const booking = await loadBooking(bookingId);
    if (booking) await sendEmail({ to: booking.to, ...tripCalledOffEmail(booking.data, reason) });
  });
}

/** Tells the tourist money was sent back, and how much is still to come. */
export function emailRefundSent(bookingId: string, amount: number) {
  if (!isEmailConfigured()) return;
  later(async () => {
    const booking = await loadBooking(bookingId);
    // The ledger trigger has already added the refund to total_paid's sibling
    // columns by the time this runs; the email quotes what it was sent.
    if (booking) await sendEmail({ to: booking.to, ...refundSentEmail(booking.data, amount) });
  });
}
