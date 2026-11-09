import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { PageBody } from "@/components/ui/signed-in-frame";
import { bookingSearchFilter, bookingSearchPattern } from "@/lib/tours/booking-search";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { timed } from "@/lib/server-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/tours/server-auth";
import { manilaDayStartUtc, toManilaDateKey } from "@/lib/tours/events-calendar";
import { FREE_CANCELLATION_HOURS } from "@/lib/tours/cancellation";
import { isBusyReason, type BusyReason } from "@/lib/tours/guide-swap";
import { canCallOff, callOffState } from "@/lib/tours/call-off";
import { getPaymongoConfig } from "@/lib/paymongo/client";
import {
  boardCounts,
  boardStatus,
  boardUrl,
  matchesBoardFilter,
  paginate,
  parseBoardFilter,
  paymentNote,
  type BoardFilter,
} from "@/lib/tours/booking-board";
import { BoardFilters } from "@/app/(subsystems)/tours/operator/bookings/board-filters";
import { BoardPagination } from "@/app/(subsystems)/tours/operator/bookings/pagination";
import { BookingBoard } from "@/app/(subsystems)/tours/operator/bookings/board";
import type { BoardRow } from "@/app/(subsystems)/tours/operator/bookings/board-types";
import type { ReviewableProof } from "@/app/(subsystems)/tours/operator/bookings/proof-review";

export const metadata = { title: "Bookings" };

const BASE = "/tours/operator/bookings";
const PAGE_SIZE = 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
/** The board only marks the two states worth a note; "none" is silence. */
const awaitableState = (state: string): "awaiting" | "rescheduled" | null =>
  state === "awaiting" || state === "rescheduled" ? state : null;

type SearchParams = Promise<{
  status?: string;
  q?: string;
  package?: string;
  date?: string;
  page?: string;
}>;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Approved guides, with their name and the two specialties the picker shows. */
async function loadGuides(supabase: Supabase) {
  const { data: guideRows, error } = await supabase
    .from("tours_guides")
    .select("id, profile_id, contact_phone, specialties")
    .eq("accreditation_status", "approved")
    .order("id", { ascending: true });
  if (error) console.error("Guides fetch error:", error);

  const profileIds = (guideRows ?? []).map((guide) => guide.profile_id).filter(Boolean);
  let profiles: Array<{ id: string; full_name: string | null }> = [];
  if (profileIds.length > 0) {
    const { data, error: profilesError } = await supabase.from("profiles").select("id, full_name").in("id", profileIds);
    profiles = data ?? [];
    if (profilesError) console.error("Profiles fetch error:", profilesError);
  }

  return (guideRows ?? []).map((guide) => ({
    id: guide.id,
    full_name: profiles.find((profile) => profile.id === guide.profile_id)?.full_name || "Unknown Guide",
    contact_phone: guide.contact_phone,
    specialties: guide.specialties ?? [],
  }));
}

export default function OperatorBookingsPage({ searchParams }: { searchParams: SearchParams }) {
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
        <div className="mt-6 h-40 rounded-2xl bg-daet-ink/10" />
        <div className="mb-6 mt-4 flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-11 w-28 rounded-full bg-daet-ink/10" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-2xl card-edge bg-surface" />
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
    redirect(`/login?next=${encodeURIComponent(BASE)}`);
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: operator }, guides] = await timed("page:bookings-operator", () =>
    Promise.all([
      supabase.from("tours_operators").select("id, business_name").eq("profile_id", user.id).maybeSingle(),
      loadGuides(supabase),
    ]),
  );

  if (!operator) {
    return (
      <Notice variant="error" title="Operator profile not found">
        You need an approved operator account to view bookings.
      </Notice>
    );
  }

  const filters = {
    status: parseBoardFilter(params.status),
    q: typeof params.q === "string" ? params.q.trim().slice(0, 200) : "",
    packageId: typeof params.package === "string" ? params.package : "",
    date: typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : "",
    page: Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  };

  // The tour list for the package picker, the search's package ids, and every
  // booking's status for the chips: none of them depends on another.
  let packageIds: string[] = [];
  if (filters.q) {
    const { data, error: packageError } = await supabase
      .from("tours_packages")
      .select("id")
      .eq("operator_id", operator.id)
      .ilike("title", bookingSearchPattern(filters.q));
    if (packageError) {
      console.error("Booking package search error:", packageError);
      return (
        <Notice variant="error" title="Search unavailable">
          Please try again later.
        </Notice>
      );
    }
    packageIds = (data ?? []).map((pkg) => pkg.id);
  }

  // Only the tours that have been booked, so the picker stays short.
  let query = supabase
    .from("tours_bookings")
    .select(
      `
      id, booking_reference, status, tour_date, number_of_pax, total_amount, total_paid, payment_status,
      contact_name, contact_email, contact_phone, special_requests, assigned_guide_id, package_id,
      called_off_at, called_off_reason, call_off_resolution, rescheduled_from, cancellation_reason,
      tours_packages!inner ( id, title, cover_image_url, operator_id )
    `,
    )
    .eq("tours_packages.operator_id", operator.id)
    .order("created_at", { ascending: false });

  if (filters.packageId) query = query.eq("package_id", filters.packageId);
  if (filters.date) query = query.eq("tour_date", filters.date);
  if (filters.q) query = query.or(bookingSearchFilter(filters.q, packageIds));

  const [
    { data: bookings, error },
    { data: statusRows },
    { data: packageRows },
    paymongo,
  ] = await timed("page:bookings-list", () =>
    Promise.all([
      query,
      supabase
        .from("tours_bookings")
        .select("id, status, total_amount, total_paid, tours_packages!inner(operator_id)")
        .eq("tours_packages.operator_id", operator.id),
      supabase
        .from("tours_packages")
        .select("id, title")
        .eq("operator_id", operator.id)
        .order("title", { ascending: true }),
      Promise.resolve(getPaymongoConfig()),
    ]),
  );

  if (error) {
    console.error("Bookings fetch error:", error);
    console.error("Bookings error details:", JSON.stringify(error, null, 2));
    return <Notice variant="error" title="Bookings unavailable">Please try again later.</Notice>;
  }

  const bookingIds = (bookings ?? []).map((booking) => booking.id);
  const tourDates = [...new Set((bookings ?? []).map((booking) => booking.tour_date))];
  const today = toManilaDateKey(new Date());
  const upcomingDates = tourDates.filter((date) => date >= today);
  const moneyBookings = (bookings ?? []).filter((booking) => Number(booking.total_paid ?? 0) > 0);
  const packageIdsForSlots = [...new Set((bookings ?? []).map((booking) => booking.package_id))];

  const [
    { data: proofRows },
    { data: requestRows },
    { data: refundRows },
    { data: availabilityRows },
    { data: allAvailabilityRows },
    busyRows,
    refundableRows,
    { data: swapRows },
  ] = await timed("page:bookings-details", () =>
    Promise.all([
      // Receipts waiting for verification (RLS: the operator's own bookings only).
      bookingIds.length
        ? supabase
            .from("tours_payment_proofs")
            .select("id, booking_id, amount, payment_method, reference_number, submitted_at")
            .in("booking_id", bookingIds)
            .eq("verification_status", "pending")
            .order("submitted_at", { ascending: true })
        : { data: [] as Array<ReviewableProof & { booking_id: string }> },
      bookingIds.length
        ? supabase
            .from("tours_cancellations")
            .select("id, booking_id, reason, requested_at, status")
            .in("booking_id", bookingIds)
            .eq("status", "requested")
        : { data: [] as Array<{ id: string; booking_id: string; reason: string; requested_at: string; status: string }> },
      // Money already sent back: what makes a booking "Refunded", and what the
      // payment line names. The ledger's own rows, so no joined booking here.
      moneyBookings.length
        ? supabase
            .from("tours_payments")
            .select("booking_id, amount, payment_method, provider, provider_method, reference_number, payment_status, payment_date")
            .eq("payment_status", "refunded")
            .order("payment_date", { ascending: true })
        : { data: [] as Array<Record<string, unknown> & { booking_id: string }> },
      // Guides' own availability for the dates on this page, shown in the picker.
      tourDates.length && guides.length
        ? supabase
            .from("tours_guide_availability")
            .select("guide_id, available_date, is_available")
            .in("available_date", tourDates)
            .in("guide_id", guides.map((guide) => guide.id))
        : { data: [] as Array<{ guide_id: string; available_date: string; is_available: boolean }> },
      // The seats left on each date, for the Approve dialog's capacity check.
      // Keyed by booking (package + date), so two tours on the same day both work.
      tourDates.length
        ? supabase
            .from("tours_package_availability")
            .select("package_id, available_date, capacity_total, capacity_booked")
            .in("package_id", packageIdsForSlots)
            .in("available_date", tourDates)
        : { data: [] as Array<{ package_id: string; available_date: string; capacity_total: number; capacity_booked: number }> },
      // R6: who can take each upcoming date (approved, free, not on another tour).
      Promise.all(
        upcomingDates.map(async (date) => {
          const { data } = await supabase.rpc("tours_guides_free_on", { p_date: date });
          return [date, (data ?? []) as Array<{ guide_id: string; full_name: string; reason: string | null }>] as const;
        }),
      ),
      // Money still to return on closed bookings.
      Promise.all(
        moneyBookings.map(async (booking) => {
          const { data } = await supabase.rpc("tours_refundable_amount", { p_booking_id: booking.id });
          return [booking.id, round2(Number(data ?? 0))] as const;
        }),
      ),
      // R6: guides' pending swap requests.
      bookingIds.length
        ? supabase
            .from("tours_guide_swap_requests")
            .select("id, booking_id, from_guide_id, to_guide_id, reason, created_at")
            .in("booking_id", bookingIds)
            .eq("status", "pending")
        : { data: [] as Array<{ id: string; booking_id: string; from_guide_id: string; to_guide_id: string | null; reason: string; created_at: string }> },
    ]),
  );

  const proofsByBooking = new Map<string, ReviewableProof[]>();
  for (const proof of proofRows ?? []) {
    const list = proofsByBooking.get(proof.booking_id) ?? [];
    list.push(proof);
    proofsByBooking.set(proof.booking_id, list);
  }
  const requestByBooking = new Map((requestRows ?? []).map((row) => [row.booking_id, row]));
  // The refunds already returned on a booking (the ledger rows the board reads).
  type RefundRow = {
    booking_id: string;
    amount: number | string;
    payment_method: string;
    provider: string | null;
    provider_method: string | null;
    reference_number: string | null;
    payment_status: string;
  };
  const refundsByBooking = new Map<string, RefundRow[]>();
  for (const row of (refundRows ?? []) as RefundRow[]) {
    const list = refundsByBooking.get(row.booking_id) ?? [];
    list.push(row);
    refundsByBooking.set(row.booking_id, list);
  }
  const refundableByBooking = new Map<string, number>(refundableRows.filter(([, amount]) => amount > 0));
  const availabilityFor = (date: string): Record<string, boolean> =>
    Object.fromEntries(
      (availabilityRows ?? []).filter((row) => row.available_date === date).map((row) => [row.guide_id, row.is_available]),
    );
  const busyByDate = new Map(busyRows.map(([date, rows]) => [date, rows]));
  const busyFor = (date: string): Record<string, BusyReason | null> =>
    Object.fromEntries(
      (busyByDate.get(date) ?? []).map((row) => [row.guide_id, isBusyReason(row.reason) ? row.reason : null]),
    );
  const pickerFor = (date: string) =>
    (busyByDate.get(date) ?? []).map((row) => {
      const guide = guides.find((item) => item.id === row.guide_id);
      return {
        id: row.guide_id,
        full_name: row.full_name,
        contact_phone: guide?.contact_phone ?? null,
        specialties: guide?.specialties ?? null,
        reason: isBusyReason(row.reason) ? row.reason : null,
      };
    });
  const slotFor = (packageId: string, date: string) =>
    (allAvailabilityRows ?? []).find((row) => row.package_id === packageId && row.available_date === date) ?? null;
  const guideName = (id: string | null) => (id ? (guides.find((guide) => guide.id === id)?.full_name ?? "A guide") : null);
  const refundsFor = (id: string) => refundsByBooking.get(id) ?? [];

  // The chips count every booking, whichever filter is open.
  const allRows = (statusRows ?? []) as Array<{
    id: string;
    status: string;
    total_amount: number | string;
    total_paid: number | string | null;
  }>;
  const counts = boardCounts(allRows, refundsByBooking);

  const mapped: BoardRow[] = (bookings ?? []).map((booking) => {
    const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;
    const refunds = refundsFor(booking.id);
    const status = boardStatus(
      { id: booking.id, status: booking.status, total_amount: booking.total_amount, total_paid: booking.total_paid },
      refunds,
    );
    const request = requestByBooking.get(booking.id);
    return {
      id: booking.id,
      reference: booking.booking_reference,
      lifecycleStatus: booking.status,
      status,
      packageId: booking.package_id,
      packageTitle: pkg?.title ?? "Tour package",
      coverImageUrl: pkg?.cover_image_url ?? null,
      tourDate: booking.tour_date,
      pax: booking.number_of_pax,
      totalAmount: round2(Number(booking.total_amount ?? 0)),
      totalPaid: round2(Number(booking.total_paid ?? 0)),
      paymentStatus: booking.payment_status ?? "unpaid",
      contactName: booking.contact_name,
      contactPhone: booking.contact_phone,
      contactEmail: booking.contact_email,
      specialRequests: booking.special_requests,
      guideId: booking.assigned_guide_id,
      guideName: guideName(booking.assigned_guide_id),
      note: paymentNote({
        totalAmount: booking.total_amount,
        totalPaid: booking.total_paid,
        pendingProofs: proofsByBooking.get(booking.id)?.length ?? 0,
        refunds,
      }),
      pendingProofs: proofsByBooking.get(booking.id) ?? [],
      refundable: status === "refunded" ? 0 : (refundableByBooking.get(booking.id) ?? 0),
      capacity: slotFor(booking.package_id, booking.tour_date)
        ? {
            capacity_total: slotFor(booking.package_id, booking.tour_date)!.capacity_total,
            capacity_booked: slotFor(booking.package_id, booking.tour_date)!.capacity_booked,
          }
        : null,
      availability: availabilityFor(booking.tour_date),
      busy: busyFor(booking.tour_date),
      picker: pickerFor(booking.tour_date),
      swap: swapRows?.find((row) => row.booking_id === booking.id)
        ? (() => {
            const row = swapRows.find((item) => item.booking_id === booking.id)!;
            return {
              id: row.id,
              fromGuideId: row.from_guide_id,
              fromGuideName: guideName(row.from_guide_id) ?? "A guide",
              toGuideId: row.to_guide_id,
              toGuideName: guideName(row.to_guide_id),
              reason: row.reason,
              createdAt: row.created_at,
            };
          })()
        : null,
      cancellation: request
        ? {
            id: request.id,
            reason: request.reason,
            requestedAt: request.requested_at,
            late:
              manilaDayStartUtc(booking.tour_date).getTime() - new Date(request.requested_at).getTime() <
              FREE_CANCELLATION_HOURS * 3600 * 1000,
          }
        : null,
      canCallOff: canCallOff(booking as never, today),
      calledOff: awaitableState(callOffState(booking as never)),
      calledOffReason: booking.called_off_reason ?? null,
      rescheduledFrom: booking.rescheduled_from ?? null,
      cancellationReason: booking.cancellation_reason ?? null,
      paymongoConfigured: Boolean(paymongo),
      paymongoLive: paymongo?.mode === "live",
    };
  });

  const visible = mapped.filter((row) => matchesBoardFilter(row.status, filters.status));
  const page = paginate(visible, filters.page, PAGE_SIZE);
  const searchLink = (patch: { status?: BoardFilter; page?: number }) =>
    boardUrl(BASE, filters, patch);

  return (
    <>
      <p className="mb-6 mt-2 text-lg text-daet-ink">
        Every booking for {operator.business_name}, newest first.
      </p>

      <BoardFilters
        filters={{ status: filters.status, q: filters.q, packageId: filters.packageId, date: filters.date }}
        counts={counts}
        packages={packageRows ?? []}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<LineIcon name="calendar" />}
          title={filters.q || filters.packageId || filters.date ? "No matching bookings" : "No bookings here"}
          description={
            filters.q || filters.packageId || filters.date
              ? "Try another search, or clear the filters to see every booking."
              : filters.status !== "all"
                ? "Nothing with this status right now."
                : "Bookings appear here as soon as tourists request a date."
          }
          action={
            filters.q || filters.packageId || filters.date ? (
              <Link href={searchLink({ status: filters.status, page: 1 }).split("?")[0]} className="font-bold text-blue-600 underline dark:text-blue-300">
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <BookingBoard
          rows={page.rows}
          selectableIds={page.rows.filter((row) => row.status === "pending").map((row) => row.id)}
        />
      )}

      <BoardPagination
        page={page.page}
        pageCount={page.pageCount}
        href={(next) => boardUrl(BASE, filters, { page: next })}
      />
    </>
  );
}
