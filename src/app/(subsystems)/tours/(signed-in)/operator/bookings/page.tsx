import { Suspense } from "react";
import { LiveCount } from "@/components/live/live-count";
import { badgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageBody } from "@/components/ui/signed-in-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { timed } from "@/lib/server-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/tours/server-auth";
import { FREE_CANCELLATION_HOURS } from "@/lib/tours/cancellation";
import { manilaDayStartUtc, toManilaDateKey } from "@/lib/tours/events-calendar";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { BookingActionButtons } from "@/app/(subsystems)/tours/operator/bookings/booking-action-buttons";
import { CallOffButton } from "@/app/(subsystems)/tours/operator/bookings/call-off-button";
import { callOffState, canCallOff } from "@/lib/tours/call-off";
import { CancellationReview, RefundPanel, type CancellationRequest } from "@/app/(subsystems)/tours/operator/bookings/cancellation-review";
import { isBusyReason, type BusyReason } from "@/lib/tours/guide-swap";
import { SwapReview, type PendingSwap } from "@/app/(subsystems)/tours/operator/bookings/swap-review";
import { GuideAssignment } from "@/app/(subsystems)/tours/operator/bookings/guide-assignment";
import { PaymentRecorder } from "@/app/(subsystems)/tours/operator/bookings/payment-recorder";
import { ProofReview, type ReviewableProof } from "@/app/(subsystems)/tours/operator/bookings/proof-review";


type SearchParams = Promise<{
  status?: string;
}>;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Approved guides for assignment, with their full names from profiles. */
async function loadAvailableGuides(supabase: Supabase) {
  const { data: guidesData, error: guidesError } = await supabase
    .from("tours_guides")
    .select("id, profile_id, contact_phone")
    .eq("accreditation_status", "approved")
    .order("id", { ascending: true });
  if (guidesError) {
    console.error("Guides fetch error:", guidesError);
    console.error("Guides error details:", JSON.stringify(guidesError, null, 2));
  }

  const profileIds = guidesData?.map((g) => g.profile_id).filter(Boolean) || [];
  let profilesData: Array<{ id: string; full_name: string | null }> | null = null;
  if (profileIds.length > 0) {
    const { data, error: profilesError } = await supabase.from("profiles").select("id, full_name").in("id", profileIds);
    profilesData = data;
    if (profilesError) console.error("Profiles fetch error:", profilesError);
  }

  return (
    guidesData?.map((guide) => ({
      id: guide.id,
      full_name: profilesData?.find((p) => p.id === guide.profile_id)?.full_name || "Unknown Guide",
      contact_phone: guide.contact_phone,
    })) || []
  );
}

export default function OperatorBookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // The heading is the same for everyone, so it is in the prerendered shell;
  // the filters and the list wait for the operator.
  return (
    <PageBody>
      <div className="mx-auto max-w-7xl">
        <h1 className="display-2 text-daet-ink">Bookings</h1>
        <Suspense fallback={<BookingsSkeleton />}>
          <BookingsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageBody>
  );
}

function BookingsSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading bookings
      </p>
      <div aria-hidden="true" className="animate-pulse">
        <div className="mt-2 h-6 w-1/2 max-w-sm rounded-full bg-daet-ink/10" />
        <div className="mb-6 mt-6 flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 w-28 rounded-full bg-daet-ink/10" />
          ))}
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 rounded-2xl card-edge bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}

async function BookingsContent({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured()) {
    return (
      <Notice variant="warning" title="Supabase setup needed">
        Configure Supabase to view bookings.
      </Notice>
    );
  }

  const params = await searchParams;
  const user = await getAuthUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/tours/operator/bookings")}`);
  }
  const supabase = await createSupabaseServerClient();

  const { data: operator } = await timed("page:bookings-operator", async () =>
    await supabase.from("tours_operators").select("id, business_name, accreditation_status").eq("profile_id", user.id).maybeSingle(),
  );

  if (!operator || operator.accreditation_status !== "approved") {
    return (
      <Notice variant="error" title="Approved operator account required">
        You need an approved operator account to view bookings.
      </Notice>
    );
  }
  const availableGuides = await loadAvailableGuides(supabase);

  // Build query for bookings
  let query = supabase
    .from("tours_bookings")
    .select(
      `
      *,
      tours_packages!inner (
        id,
        title,
        cover_image_url,
        operator_id
      )
    `
    )
    .eq("tours_packages.operator_id", operator.id)
    .order("created_at", { ascending: false });

  // Filter by status if provided
  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  // The list and the chip counts are separate reads; neither waits for the other.
  // Counts cover every booking, not just the selected filter, so the chips
  // read the same whichever one is open.
  const [{ data: bookings, error }, { data: statusRows }] = await timed("page:bookings-list", () =>
    Promise.all([
      query,
      supabase
        .from("tours_bookings")
        .select("status, tours_packages!inner(operator_id)")
        .eq("tours_packages.operator_id", operator.id),
    ]),
  );

  // Everything below hangs off the bookings and the guides already in hand, and
  // none of it depends on anything else here, so it is asked for all at once.
  const bookingIds = (bookings ?? []).map((b) => b.id);
  const today = toManilaDateKey(new Date());
  const tourDates = [...new Set((bookings ?? []).map((b) => b.tour_date))];
  const upcomingDates = tourDates.filter((d) => d >= today);
  const refundCandidates = (bookings ?? []).filter(
    (b) => (b.status === "cancelled" || b.status === "rejected") && Number(b.total_paid ?? 0) > 0,
  );

  const [
    { data: pendingProofRows },
    { data: requestRows },
    { data: availabilityRows },
    busyRows,
    refundableRows,
    { data: swapRows },
  ] = await timed("page:bookings-details", () => Promise.all([
    // Receipts waiting for verification on these bookings (RLS: operator's own bookings only)
    bookingIds.length
      ? supabase
          .from("tours_payment_proofs")
          .select("id, booking_id, amount, payment_method, reference_number, submitted_at")
          .in("booking_id", bookingIds)
          .eq("verification_status", "pending")
          .order("submitted_at", { ascending: true })
      : { data: [] as Array<ReviewableProof & { booking_id: string }> },
    // Open cancellation requests.
    bookingIds.length
      ? supabase
          .from("tours_cancellations")
          .select("id, booking_id, reason, requested_at, status")
          .in("booking_id", bookingIds)
          .eq("status", "requested")
      : { data: [] as Array<CancellationRequest & { booking_id: string }> },
    // Guides' own availability for the dates on this page (F9), shown in the picker.
    tourDates.length && availableGuides.length
      ? supabase
          .from("tours_guide_availability")
          .select("guide_id, available_date, is_available")
          .in("available_date", tourDates)
          .in("guide_id", availableGuides.map((g) => g.id))
      : { data: [] as { guide_id: string; available_date: string; is_available: boolean }[] },
    // R6: who can take each upcoming date (approved, marked available, not on another tour that day).
    Promise.all(
      upcomingDates.map(async (date) => {
        const { data } = await supabase.rpc("tours_guides_free_on", { p_date: date });
        return [date, (data ?? []) as Array<{ guide_id: string; full_name: string; reason: string | null }>] as const;
      }),
    ),
    // Money still to return on cancelled/declined bookings.
    Promise.all(
      refundCandidates.map(async (b) => {
        const { data } = await supabase.rpc("tours_refundable_amount", { p_booking_id: b.id });
        return [b.id, Number(data ?? 0)] as const;
      }),
    ),
    // R6: guides' pending swap requests on these bookings.
    bookingIds.length
      ? supabase
          .from("tours_guide_swap_requests")
          .select("id, booking_id, from_guide_id, to_guide_id, reason, created_at")
          .in("booking_id", bookingIds)
          .eq("status", "pending")
      : { data: [] as Array<{ id: string; booking_id: string; from_guide_id: string; to_guide_id: string | null; reason: string; created_at: string }> },
  ]));

  const proofsByBooking = new Map<string, ReviewableProof[]>();
  for (const proof of pendingProofRows ?? []) {
    const list = proofsByBooking.get(proof.booking_id) ?? [];
    list.push(proof);
    proofsByBooking.set(proof.booking_id, list);
  }
  const requestByBooking = new Map<string, CancellationRequest>(
    (requestRows ?? []).map((row) => [row.booking_id, row]),
  );
  const refundableByBooking = new Map<string, number>(refundableRows.filter(([, amount]) => amount > 0));

  if (error) {
    console.error("Bookings fetch error:", error);
    console.error("Bookings error details:", JSON.stringify(error, null, 2));
  }

  const availabilityFor = (date: string): Record<string, boolean> =>
    Object.fromEntries((availabilityRows ?? []).filter((r) => r.available_date === date).map((r) => [r.guide_id, r.is_available]));
  const busyByDate = new Map(busyRows.map(([date, rows]) => [date, rows]));
  const busyFor = (date: string): Record<string, BusyReason | null> =>
    Object.fromEntries((busyByDate.get(date) ?? []).map((r) => [r.guide_id, isBusyReason(r.reason) ? r.reason : null]));
  const pickerFor = (date: string) =>
    (busyByDate.get(date) ?? []).map((r) => ({ id: r.guide_id, full_name: r.full_name, reason: isBusyReason(r.reason) ? r.reason : null }));

  const guideName = (id: string | null) => (id ? availableGuides.find((g) => g.id === id)?.full_name ?? "A guide" : null);
  const swapByBooking = new Map<string, PendingSwap>(
    (swapRows ?? []).map((row) => [
      row.booking_id,
      { id: row.id, fromGuideId: row.from_guide_id, fromGuideName: guideName(row.from_guide_id) ?? "A guide", toGuideId: row.to_guide_id, toGuideName: guideName(row.to_guide_id), reason: row.reason, createdAt: row.created_at },
    ]),
  );

  const statusColors: Record<string, string> = {
    pending: badgeTone("warning"),
    confirmed: badgeTone("success"),
    cancelled: badgeTone("neutral"),
    completed: badgeTone("info"),
    rejected: badgeTone("danger"),
  };

  const statusLabels: Record<string, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
    rejected: "Declined",
  };

  // Calculate stats
  const allBookings = statusRows ?? [];
  const stats = {
    total: allBookings.length,
    pending: allBookings.filter((b) => b.status === "pending").length,
    confirmed: allBookings.filter((b) => b.status === "confirmed").length,
    completed: allBookings.filter((b) => b.status === "completed").length,
    rejected: allBookings.filter((b) => b.status === "rejected").length,
  };

  return (
    <>
        <p className="mb-6 mt-2 text-lg text-daet-ink">Every booking for {operator.business_name}, newest first.</p>

        {/* Chips wrap on phones so none is cut off at the edge. */}
        <nav aria-label="Filter by status" className="mb-6">
          <ul className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All", stats.total],
                ["pending", "To confirm", stats.pending],
                ["confirmed", "Confirmed", stats.confirmed],
                ["completed", "Completed", stats.completed],
                ["rejected", "Declined", stats.rejected],
              ] as const
            ).map(([value, label, count]) => {
              const active = (params.status ?? "all") === value;
              return (
                <li key={value}>
                  <Link
                    href={`/tours/operator/bookings?status=${value}`}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${active ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`}
                  >
                    {label}
                    <span className={`rounded-full px-2 text-sm ${active ? "bg-white/20" : value === "pending" && count > 0 ? badgeTone("warning") : "bg-muted"}`}>{value === "pending" ? <LiveCount name="operatorPending" initial={count} /> : count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bookings List */}
        {!bookings || bookings.length === 0 ? (
          <EmptyState
            icon={<LineIcon name="calendar" />}
            title="No bookings here"
            description={params.status && params.status !== "all" ? "Nothing with this status right now." : "Bookings appear here as soon as tourists request a date."}
          />
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const pkg = Array.isArray(booking.tours_packages)
                ? booking.tours_packages[0]
                : booking.tours_packages;

              return (
                <div
                  key={booking.id}
                  id={`booking-${booking.id}`}
                  className="scroll-mt-6 overflow-hidden rounded-2xl bg-surface p-4 target:ring-2 target:ring-daet-forest/50 sm:p-6"
                >
                  {/* Phones: photo on top, details full width. Wider: side by side. */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                    {/* Package Image */}
                    {pkg?.cover_image_url && (
                      <img
                        src={pkg.cover_image_url}
                        alt={pkg.title}
                        className="h-36 w-full rounded-2xl object-cover sm:h-32 sm:w-40 sm:shrink-0"
                      />
                    )}

                    {/* Booking Details */}
                    <div className="flex min-w-0 flex-1 flex-col">
                      {/* Top Row: Package + Status */}
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-xl font-bold text-daet-ink">
                            {pkg?.title || "Package"}
                          </h3>
                          <p className="mt-1 break-words text-sm font-bold text-daet-forest dark:text-blue-300">
                            {booking.booking_reference}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${statusColors[booking.status] || "bg-muted text-slate-800 dark:text-slate-100"}`}
                        >
                          {statusLabels[booking.status] || booking.status}
                        </span>
                      </div>

                      {/* Details Grid */}
                      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:gap-x-8 md:grid-cols-4 [&>div]:min-w-0 [&_p]:break-words">
                        <div>
                          <p className="text-daet-ink/70">Tour date</p>
                          <p className="font-bold text-daet-ink">
                            {new Date(booking.tour_date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-daet-ink/70">Guests</p>
                          <p className="font-bold text-daet-ink">{booking.number_of_pax} guest{booking.number_of_pax === 1 ? "" : "s"}</p>
                        </div>
                        <div>
                          <p className="text-daet-ink/70">Contact</p>
                          <p className="font-bold text-daet-ink">{booking.contact_name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{booking.contact_phone}</p>
                        </div>
                        <div>
                          <p className="text-daet-ink/70">Total</p>
                          <p className="text-lg font-bold text-daet-forest dark:text-blue-300">
                            {formatPeso(booking.total_amount)}
                          </p>
                        </div>
                      </div>

                      {/* Special Requests */}
                      {booking.special_requests && (
                        <div className="mb-4 rounded-2xl bg-canvas p-3">
                          <p className="text-sm text-slate-600 dark:text-slate-400">Special requests</p>
                          <p className="mt-1 text-sm text-daet-ink">{booking.special_requests}</p>
                        </div>
                      )}

                      {/* Guide and payment fold into one-line summaries; they open when something needs doing. */}
                      {booking.status === "confirmed" && (
                        <>
                          <details
                            className="group mb-3 rounded-2xl bg-canvas"
                            open={!booking.assigned_guide_id || swapByBooking.has(booking.id)}
                          >
                            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm">
                              <span className="min-w-0">
                                <span className="text-slate-600 dark:text-slate-400">Guide </span>
                                <span className="font-bold text-daet-ink">
                                  {booking.assigned_guide_id ? guideName(booking.assigned_guide_id) : "None yet"}
                                </span>
                                {swapByBooking.has(booking.id) ? <span className="font-bold text-yellow-800 dark:text-yellow-200"> · swap requested</span> : null}
                              </span>
                              <LineIcon name="chevron-down" className="h-5 w-5 shrink-0 text-daet-ink/70 transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="px-4 pb-4">
                              {swapByBooking.get(booking.id) ? (
                                <SwapReview swap={swapByBooking.get(booking.id)!} guides={pickerFor(booking.tour_date)} />
                              ) : null}
                              <GuideAssignment
                                bookingId={booking.id}
                                currentGuideId={booking.assigned_guide_id}
                                availableGuides={availableGuides || []}
                                availability={availabilityFor(booking.tour_date)}
                                busy={busyFor(booking.tour_date)}
                              />
                            </div>
                          </details>

                          <ProofReview proofs={proofsByBooking.get(booking.id) ?? []} />

                          <details className="group mb-4 rounded-2xl bg-canvas">
                            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm">
                              <span className="min-w-0">
                                <span className="text-slate-600 dark:text-slate-400">Payment </span>
                                <span className="font-bold text-daet-ink">
                                  {formatPeso(Number(booking.total_paid ?? 0))} of {formatPeso(booking.total_amount)} paid
                                </span>
                              </span>
                              <LineIcon name="chevron-down" className="h-5 w-5 shrink-0 text-daet-ink/70 transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="px-1 pb-1">
                              <PaymentRecorder
                                bookingId={booking.id}
                                bookingReference={booking.booking_reference}
                                totalAmount={booking.total_amount}
                                totalPaid={booking.total_paid || 0}
                                paymentStatus={booking.payment_status || "unpaid"}
                              />
                            </div>
                          </details>
                        </>
                      )}

                      {callOffState(booking) === "awaiting" ? (
                        <p className="mb-4 rounded-2xl bg-yellow-50 p-3 text-sm text-daet-ink dark:bg-yellow-950/30">
                          <span className="font-bold">Called off:</span> {booking.called_off_reason} The traveller is choosing a new date or a full refund.
                        </p>
                      ) : callOffState(booking) === "rescheduled" ? (
                        <p className="mb-4 rounded-2xl bg-canvas p-3 text-sm text-daet-ink">
                          <span className="font-bold">Moved after a call-off</span>
                          {booking.rescheduled_from ? ` from ${new Date(`${booking.rescheduled_from}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}. The traveller picked this date.
                        </p>
                      ) : null}

                      {(booking.status === "cancelled" || booking.status === "rejected") && booking.cancellation_reason ? (
                        <p className="mb-4 rounded-2xl bg-canvas p-3 text-sm text-daet-ink">
                          <span className="font-bold">{booking.status === "cancelled" ? "Cancellation reason" : "Declined because"}:</span>{" "}
                          {booking.cancellation_reason}
                        </p>
                      ) : null}

                      {requestByBooking.has(booking.id) ? (
                        <CancellationReview
                          bookingId={booking.id}
                          request={requestByBooking.get(booking.id)!}
                          late={
                            manilaDayStartUtc(booking.tour_date).getTime() -
                              new Date(requestByBooking.get(booking.id)!.requested_at).getTime() <
                            FREE_CANCELLATION_HOURS * 3600 * 1000
                          }
                        />
                      ) : null}

                      {refundableByBooking.has(booking.id) ? (
                        <RefundPanel bookingId={booking.id} refundable={refundableByBooking.get(booking.id)!} />
                      ) : null}

                      {/* The next step first, messages beside it, Decline and Cancel under More. */}
                      <BookingActionButtons
                        bookingId={booking.id}
                        currentStatus={booking.status}
                        tourDate={booking.tour_date}
                        totalPaid={Number(booking.total_paid ?? 0)}
                        today={today}
                        bookingReference={booking.booking_reference}
                        contactName={booking.contact_name}
                      >
                        {booking.status !== "cancelled" && booking.status !== "rejected" ? (
                          <>
                            <OpenChatButton bookingId={booking.id} label="Message tourist" variant="ghost" />
                            {canCallOff(booking, today) ? (
                              <CallOffButton
                                bookingId={booking.id}
                                bookingReference={booking.booking_reference}
                                contactName={booking.contact_name}
                                tourDay={new Date(`${booking.tour_date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                              />
                            ) : null}
                            {booking.assigned_guide_id ? (
                              <OpenChatButton target={{ kind: "operator_guide", guideId: booking.assigned_guide_id }} label="Message guide" variant="ghost" />
                            ) : null}
                          </>
                        ) : null}
                      </BookingActionButtons>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </>
  );
}
