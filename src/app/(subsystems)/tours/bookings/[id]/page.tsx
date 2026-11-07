import { maskEmail } from "@/lib/tours/mask-email";
import { hasTicket } from "@/lib/tours/ticket";
import Image from "next/image";
import { LineIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PHOTOS } from "@/lib/photo-credits";
import { placePhoto } from "@/lib/tours/trip-board";
import { formatPeso } from "@/lib/money";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isUuid } from "@/lib/tours/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPaymongoConfigured } from "@/lib/paymongo/client";
import { cancellationOption } from "@/lib/tours/cancellation";
import { PushOptIn } from "@/components/tours/push-opt-in";
import { LiveShareCard } from "@/components/tours/live/live-share-card";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { CancelBookingPanel, type MyCancellation } from "./cancel-booking-panel";
import { CalledOffAlert } from "./called-off-alert";
import { refundCalledOff, rescheduleCalledOff } from "./call-off-actions";
import { callOffState } from "@/lib/tours/call-off";
import { bookableDates, type AvailabilityRow } from "@/lib/tours/availability";
import { BookingPaymentPanel, PaymentNextStep, owesBalance, type PanelPayment, type PanelProof } from "./booking-payment-panel";
import { ReviewForm } from "./review-form";
import { ReviewList } from "@/components/tours/review-list";
import type { Review } from "@/lib/tours/reviews";
import { getAuthUser } from "@/lib/tours/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking" };

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookingDetailPage({ params, searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view bookings.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  const { payment } = await searchParams;
  // Checkouts started before the success page existed still return with ?payment=success.
  if (payment === "success" && isUuid(id)) redirect(`/tours/bookings/${id}/paid`);
  const paymentReturn = payment === "cancelled" ? payment : null;
  const supabase = await createSupabaseServerClient();

  // Get current user
  const user = await getAuthUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/tours/bookings/${id}`)}`);
  }

  // Fetch booking details
  const { data: booking, error } = await supabase
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
        meeting_point_name,
        meeting_lat,
        meeting_lng,
        tours_operators (
          business_name,
          contact_phone,
          gcash_number,
          gcash_name,
          bank_name,
          bank_account_number,
          bank_account_name,
          payment_instructions
        )
      )
    `
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !booking) {
    console.error("Booking fetch error:", error);
    notFound();
  }

  const pkg = Array.isArray(booking.tours_packages)
    ? booking.tours_packages[0]
    : booking.tours_packages;

  const operator = Array.isArray(pkg?.tours_operators)
    ? pkg.tours_operators[0]
    : pkg?.tours_operators;

  // A trip the operator called off: open dates with enough seats for this group, for "Pick a new date".
  const calledOff = callOffState(booking);
  let openDates: ReturnType<typeof bookableDates> | null = null;
  if (calledOff === "awaiting" && pkg?.id) {
    const { data: slots } = await supabase.from("tours_package_availability").select("available_date, capacity_total, capacity_booked").eq("package_id", pkg.id);
    openDates = (slots ?? []).length
      ? bookableDates((slots ?? []) as AvailabilityRow[], toManilaDateKey(new Date())).filter((o) => !o.full && o.seatsLeft >= Number(booking.number_of_pax ?? 1) && o.date !== booking.tour_date)
      : null;
  }

  const [{ data: paymentRows }, { data: proofRows }, { data: cancellation }, { data: myReview }] = await Promise.all([
    supabase
      .from("tours_payments")
      .select("id, amount, payment_method, provider, provider_method, reference_number, payment_date, payment_status")
      .eq("booking_id", booking.id)
      .order("payment_date", { ascending: false }),
    supabase
      .from("tours_payment_proofs")
      .select("id, amount, payment_method, reference_number, verification_status, rejection_reason, submitted_at")
      .eq("booking_id", booking.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("tours_cancellations")
      .select("status, reason, admin_notes")
      .eq("booking_id", booking.id)
      .maybeSingle(),
    supabase
      .from("tours_reviews")
      .select("id, rating, comment, created_at, operator_reply, replied_at, is_hidden, hidden_reason")
      .eq("booking_id", booking.id)
      .maybeSingle(),
  ]);

  const closed = booking.status === "cancelled" || booking.status === "rejected";
  const owes = owesBalance(booking);
  const proofs = (proofRows ?? []) as PanelProof[];
  const photoKey = placePhoto(pkg?.title, pkg?.location_name);
  const photo = PHOTOS[photoKey];
  const steps = [
    { label: "Requested", done: true },
    { label: "Confirmed by the operator", done: booking.status === "confirmed" || booking.status === "completed" },
    { label: "Paid in full", done: booking.payment_status === "paid" },
    { label: "Trip done", done: booking.status === "completed" },
  ];
  const statusLabel: Record<string, string> = {
    pending: "Waiting for the operator",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
    rejected: "Declined by the operator",
  };
  const longTourDate = new Date(`${booking.tour_date}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });

  // "Find your guide" from two days before the tour until its last day.
  const todayKey = toManilaDateKey(new Date());
  const dayOffset = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const lastDay = dayOffset(booking.tour_date, pkg?.duration_type === "days" ? Math.max(1, pkg.duration_value ?? 1) - 1 : 0);
  const showLive = booking.status === "confirmed" && Boolean(booking.assigned_guide_id) && todayKey >= dayOffset(booking.tour_date, -2) && todayKey <= lastDay;

  return (
    <PageFrame credits={pkg?.cover_image_url ? [] : [photoKey]}>
      <div className="mx-auto max-w-4xl">
        <Link href="/tours/my-bookings" className="mb-4 inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 dark:text-blue-300 hover:underline">
          <LineIcon name="arrowRight" className="h-4 w-4 rotate-180" /> My bookings
        </Link>

        <header className="mb-6 grid overflow-hidden rounded-2xl card-edge bg-surface md:grid-cols-[1fr_1.1fr]">
          <div className="relative min-h-28 bg-blue-100 dark:bg-blue-900/40 sm:min-h-48 md:min-h-full">
            {pkg?.cover_image_url ? (
              <img src={pkg.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <Image src={photo.src} alt="" fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" priority />
            )}
          </div>
          <div className="p-5 sm:p-8">
            <Badge tone={closed ? (booking.status === "rejected" ? "danger" : "neutral") : booking.status === "pending" ? "neutral" : "success"}>
              {booking.status === "pending" ? <LineIcon name="clock" className="h-3.5 w-3.5" /> : null}
              {statusLabel[booking.status] ?? booking.status}
            </Badge>
            <h1 className="display-2 mt-3 text-daet-ink">{pkg?.title ?? "Your booking"}</h1>
            <p className="mt-2 text-daet-ink sm:text-lg">{longTourDate}</p>
            <p className="text-daet-ink">
              {booking.number_of_pax} guest{booking.number_of_pax === 1 ? "" : "s"}
              {pkg?.location_name ? ` · ${pkg.location_name}` : ""}
              {operator ? ` · by ${operator.business_name}` : ""}
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 sm:mt-4">Booking reference</p>
            <p className="font-mono text-lg font-bold tracking-wide text-daet-ink sm:text-2xl">{booking.booking_reference}</p>
            {maskEmail(booking.contact_email) ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">We email updates about this booking to {maskEmail(booking.contact_email)}. Check spam if you don&apos;t see them.</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
              {/* The ticket QR appears once the booking is paid in full; until then paying is the next step. */}
              {hasTicket(booking) && booking.status === "confirmed" ? (
                <ButtonLink href={`/tours/bookings/${booking.id}/ticket`}>
                  <LineIcon name="ticket" className="h-4 w-4" /> Show my ticket QR
                </ButtonLink>
              ) : null}
              {!closed ? <OpenChatButton bookingId={booking.id} label="Message operator" variant={owes ? "ghost" : "secondary"} /> : null}
              {!closed && booking.assigned_guide_id ? (
                <OpenChatButton target={{ kind: "guide_tourist", bookingId: booking.id }} label="Message guide" variant="ghost" />
              ) : null}
            </div>
          </div>
        </header>

        {calledOff === "awaiting" ? (
          <CalledOffAlert
            bookingId={booking.id}
            title={pkg?.title ?? "your trip"}
            tourDate={booking.tour_date}
            reason={booking.called_off_reason ?? ""}
            openDates={openDates}
            minDate={toManilaDateKey(new Date(Date.now() + 86_400_000))}
            paid={Number(booking.total_paid ?? 0)}
            operatorPhone={operator?.contact_phone ?? null}
            messageButton={<OpenChatButton bookingId={booking.id} label="Message operator" variant="ghost" />}
            actions={{ reschedule: rescheduleCalledOff, refund: refundCalledOff }}
          />
        ) : null}
        {calledOff === "rescheduled" && booking.status === "confirmed" ? (
          <Notice variant="success" className="mb-6" title="Your trip has a new date">
            The operator called off the first date{booking.called_off_reason ? ` (${booking.called_off_reason})` : ""}. You moved it to this date; your payment and ticket carry over.
          </Notice>
        ) : null}

        {booking.status === "pending" ? (
          <Notice variant="success" className="mb-6" title="Booking sent">
            The operator will confirm it here and in your notifications. You can pay once it is confirmed.
          </Notice>
        ) : null}

        {owes ? (
          <PaymentNextStep booking={booking} proofs={proofs} onlinePaymentEnabled={isPaymongoConfigured()} paymentReturn={paymentReturn} />
        ) : null}

        {booking.status === "pending" || booking.status === "confirmed" ? <PushOptIn variant="prompt" /> : null}

        {showLive ? (
          <LiveShareCard
            bookingId={booking.id}
            operatorName={operator?.business_name ?? null}
            operatorPhone={operator?.contact_phone ?? null}
            meetingPoint={
              pkg?.meeting_lat != null && pkg?.meeting_lng != null
                ? { name: pkg.meeting_point_name ?? "Meeting point", lat: Number(pkg.meeting_lat), lng: Number(pkg.meeting_lng) }
                : null
            }
          />
        ) : null}

        {closed ? (
          <Notice variant={booking.status === "rejected" ? "warning" : "info"} className="mb-6" title={booking.status === "rejected" ? "The operator declined this booking" : calledOff === "refund_requested" ? "Cancelled after the operator called the trip off" : "This booking was cancelled"}>
            {booking.cancellation_reason ?? ""}
            {Number(booking.total_paid ?? 0) > 0 ? " Any amount you paid will be refunded by the operator." : ""}
          </Notice>
        ) : (
          <section aria-labelledby="progress" className="mb-6 rounded-2xl card-edge bg-surface p-5 sm:p-6">
            <h2 id="progress" className="text-xl font-bold text-daet-ink">
              Where it stands
            </h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step.label} className="flex items-center gap-3 sm:flex-col sm:items-start">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${step.done ? "bg-green-500 text-slate-950 dark:bg-green-500/20 dark:text-green-300" : "bg-muted text-slate-600 dark:text-slate-400"}`}
                    aria-hidden="true"
                  >
                    {step.done ? <LineIcon name="check" className="h-5 w-5" /> : i + 1}
                  </span>
                  <span className={step.done ? "font-bold text-daet-ink" : "text-slate-600 dark:text-slate-400"}>
                    {step.label}
                    <span className="sr-only">{step.done ? " (done)" : " (not yet)"}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {booking.status === "completed" ? (
          <section id="review" aria-labelledby="review-title" className="mb-6 rounded-2xl card-edge bg-surface p-5 sm:p-6">
            <h2 id="review-title" className="text-xl font-bold text-daet-ink">
              {myReview ? "Your review" : "Rate your tour"}
            </h2>
            <div className="mt-4">
              {myReview ? (
                <>
                  <ReviewList reviews={[myReview as Review]} operatorName={operator?.business_name ?? "the operator"} />
                  {myReview.is_hidden ? (
                    <Notice variant="warning" className="mt-3" title="Hidden by the Tourism Office">
                      {myReview.hidden_reason || "This review is not shown publicly."}
                    </Notice>
                  ) : null}
                </>
              ) : (
                <ReviewForm bookingId={booking.id} />
              )}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="cost" className="mb-6 rounded-2xl card-edge bg-surface p-5 sm:p-6">
          <h2 id="cost" className="text-xl font-bold text-daet-ink">
            What it costs
          </h2>
          <dl className="mt-4 space-y-2 text-daet-ink">
            <div className="flex justify-between gap-4">
              <dt>Guests</dt>
              <dd className="font-bold">{booking.number_of_pax}</dd>
            </div>
            {booking.price_per_pax ? (
              <div className="flex justify-between gap-4">
                <dt>Price per person</dt>
                <dd className="font-bold">{formatPeso(booking.price_per_pax)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4 rounded-2xl bg-canvas px-4 py-3">
              <dt className="text-lg font-bold">Total</dt>
              <dd className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatPeso(booking.total_amount)}</dd>
            </div>
          </dl>
        </section>

        {booking.status !== "cancelled" && booking.status !== "rejected" ? (
          <BookingPaymentPanel
            booking={booking}
            operator={operator ?? null}
            payments={(paymentRows ?? []) as PanelPayment[]}
            proofs={proofs}
            onlinePaymentEnabled={isPaymongoConfigured()}
          />
        ) : null}

        <CancelBookingPanel
          bookingId={booking.id}
          option={cancellationOption(booking)}
          cancellation={(cancellation as MyCancellation | null) ?? null}
        />

        <section aria-labelledby="contact" className="mb-6 rounded-2xl card-edge bg-surface p-5 sm:p-6">
          <h2 id="contact" className="text-xl font-bold text-daet-ink">
            Your contact details
          </h2>
          <dl className="mt-4 grid gap-3 text-daet-ink sm:grid-cols-3">
            <div>
              <dt className="text-sm text-slate-600 dark:text-slate-400">Name</dt>
              <dd className="font-bold">{booking.contact_name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-slate-600 dark:text-slate-400">Email</dt>
              <dd className="break-words font-bold">{booking.contact_email}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600 dark:text-slate-400">Phone</dt>
              <dd className="font-bold">{booking.contact_phone}</dd>
            </div>
          </dl>
          {booking.special_requests ? (
            <div className="mt-4 rounded-2xl bg-canvas p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Special requests</p>
              <p className="mt-1 text-daet-ink">{booking.special_requests}</p>
            </div>
          ) : null}
        </section>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/tours/my-bookings">View my bookings</ButtonLink>
          <ButtonLink href="/tours/browse" variant="secondary">
            Find another trip
          </ButtonLink>
        </div>
      </div>
    </PageFrame>
  );
}
