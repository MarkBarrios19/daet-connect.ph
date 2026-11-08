"use server";

/**
 * The bookings board's two money-and-people flows, in one place:
 *
 *   approveBooking        confirm a request and (optionally) name its guide in
 *                         the same update, then email the voucher.
 *   approvePendingBookings the same thing for the rows ticked in the list.
 *   processRefund         send money back through PayMongo, or record a manual
 *                         refund, on a booking that is already closed.
 */

import { emailBookingConfirmed, emailGuideAssigned, emailRefundSent } from "@/lib/email/notify-booking";
import { formatPeso } from "@/lib/money";
import { createRefund, getPaymongoConfig } from "@/lib/paymongo/client";
import {
  isRefundReason,
  planRefund,
  REFUND_NOTES_MAX,
  REFUND_REASONS,
  refundNotes,
  type OnlinePayment,
} from "@/lib/paymongo/refunds";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkTransition, isBookingStatus } from "@/lib/tours/booking-lifecycle";
import { parseRefundForm } from "@/lib/tours/cancellation";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";
import { capacityCheck } from "@/lib/tours/booking-board";

export type BoardActionResult = { success: boolean; message?: string; error?: string };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function revalidateBookings(bookingId?: string) {
  revalidatePath("/tours/operator/bookings");
  revalidatePath("/tours/operator/payments");
  if (bookingId) revalidatePath(`/tours/bookings/${bookingId}`);
}

/** The signed-in person's approved operator row, or the message to show. */
async function requireOperator(supabase: Supabase): Promise<{ ok: true; operatorId: string } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage bookings." };
  const { data: operator } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!operator) return { ok: false, error: "Operator profile not found." };
  if (operator.accreditation_status !== "approved") {
    return { ok: false, error: "Your operator account must be approved to manage bookings." };
  }
  return { ok: true, operatorId: operator.id };
}

/** Turns "not the operator" into the board's own result shape. */
const asResult = (failure: { error: string }): BoardActionResult => ({ success: false, error: failure.error });

type BookingForBoard = {
  id: string;
  status: string;
  tour_date: string;
  number_of_pax: number;
  total_amount: number | string;
  total_paid: number | string | null;
  booking_reference: string;
  contact_name: string | null;
  contact_phone: string | null;
  special_requests: string | null;
  assigned_guide_id: string | null;
  package_id: string;
  tours_packages: { operator_id: string } | Array<{ operator_id: string }> | null;
};

async function loadOwnBooking(supabase: Supabase, bookingId: string, operatorId: string) {
  const { data, error } = await supabase
    .from("tours_bookings")
    .select(
      "id, status, tour_date, number_of_pax, total_amount, total_paid, booking_reference, contact_name, contact_phone, special_requests, assigned_guide_id, package_id, tours_packages!inner ( operator_id )",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as BookingForBoard;
  const pkg = Array.isArray(row.tours_packages) ? row.tours_packages[0] : row.tours_packages;
  if (pkg?.operator_id !== operatorId) return null;
  return row;
}

/**
 * Approves one pending request: the status change and the guide go in one
 * update, so the booking never reads as "confirmed, nobody to lead it" and
 * the schedule guard in the database checks the guide against this date.
 */
export async function approveBooking(
  bookingId: string,
  guideId: string | null = null,
): Promise<BoardActionResult> {
  if (!isUuid(bookingId) || (guideId && !isUuid(guideId))) {
    return { success: false, error: "Booking not found." };
  }
  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return asResult(operator);

  const booking = await loadOwnBooking(supabase, bookingId, operator.operatorId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (!isBookingStatus(booking.status)) return { success: false, error: "This booking cannot be approved." };

  const check = checkTransition(booking.status, "confirmed", "operator", {
    tourDate: booking.tour_date,
    today: toManilaDateKey(new Date()),
    totalPaid: Number(booking.total_paid ?? 0),
  });
  if (!check.ok) return { success: false, error: check.reason };

  // What the dialog shows before confirming is checked again here: a seat
  // could have gone while the dialog was open.
  const { data: slot } = await supabase
    .from("tours_package_availability")
    .select("capacity_total, capacity_booked")
    .eq("package_id", booking.package_id)
    .eq("available_date", booking.tour_date)
    .maybeSingle();
  const capacity = capacityCheck({ tourDate: booking.tour_date, pax: booking.number_of_pax, capacity: slot ?? null });
  if (!capacity.ok) return { success: false, error: capacity.text };

  if (guideId) {
    const { data: guide } = await supabase
      .from("tours_guides")
      .select("id, accreditation_status")
      .eq("id", guideId)
      .maybeSingle();
    if (!guide) return { success: false, error: "That guide was not found." };
    if (guide.accreditation_status !== "approved") return { success: false, error: "That guide is not accredited yet." };
  }

  const { error } = await supabase
    .from("tours_bookings")
    .update({ status: "confirmed", ...(guideId ? { assigned_guide_id: guideId } : {}) })
    .eq("id", bookingId);
  if (error) {
    console.error("Approve booking error:", error);
    return { success: false, error: userFacingDbError(error, "The booking could not be approved.") };
  }

  revalidateBookings(bookingId);
  emailBookingConfirmed(bookingId);
  if (guideId) emailGuideAssigned(bookingId, guideId);

  const name = guideId ? await guideFirstName(supabase, guideId) : null;
  return {
    success: true,
    message: name
      ? `Booking ${booking.booking_reference} confirmed with guide ${name}!`
      : `Booking ${booking.booking_reference} confirmed.`,
  };
}

async function guideFirstName(supabase: Supabase, guideId: string): Promise<string | null> {
  const { data: guide } = await supabase.from("tours_guides").select("profile_id").eq("id", guideId).maybeSingle();
  if (!guide?.profile_id) return null;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", guide.profile_id).maybeSingle();
  const full = profile?.full_name?.trim();
  return full ? full.split(/\s+/)[0] : null;
}

/** Declines one pending request. The reason is shown to the tourist. */
export async function declineBooking(bookingId: string, reason: string): Promise<BoardActionResult> {
  if (!isUuid(bookingId)) return { success: false, error: "Booking not found." };
  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return asResult(operator);
  const booking = await loadOwnBooking(supabase, bookingId, operator.operatorId);
  if (!booking) return { success: false, error: "Booking not found." };

  const trimmed = String(reason ?? "").trim();
  if (trimmed.length < 5) return { success: false, error: "Tell the tourist why (at least 5 characters)." };
  if (trimmed.length > 500) return { success: false, error: "Reason must be 500 characters or fewer." };

  const { error } = await supabase
    .from("tours_bookings")
    .update({ status: "rejected", cancellation_reason: trimmed })
    .eq("id", bookingId);
  if (error) return { success: false, error: userFacingDbError(error, "The booking could not be declined.") };

  revalidateBookings(bookingId);
  return { success: true, message: `Booking ${booking.booking_reference} marked as declined.` };
}

/**
 * Cancels a live booking without returning money (the tourist agreed, or
 * nothing was paid). Refunds go through processRefund, which closes the
 * booking itself so money and status never disagree.
 */
export async function cancelBooking(bookingId: string, reason: string): Promise<BoardActionResult> {
  if (!isUuid(bookingId)) return { success: false, error: "Booking not found." };
  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return asResult(operator);
  const booking = await loadOwnBooking(supabase, bookingId, operator.operatorId);
  if (!booking) return { success: false, error: "Booking not found." };

  const trimmed = String(reason ?? "").trim();
  if (trimmed.length < 5) return { success: false, error: "Tell the tourist why (at least 5 characters)." };
  if (trimmed.length > 500) return { success: false, error: "Reason must be 500 characters or fewer." };

  if (!isBookingStatus(booking.status)) return { success: false, error: "This booking cannot be cancelled." };
  const check = checkTransition(booking.status, "cancelled", "operator", {
    tourDate: booking.tour_date,
    today: toManilaDateKey(new Date()),
    totalPaid: Number(booking.total_paid ?? 0),
  });
  if (!check.ok) return { success: false, error: check.reason };

  const { error } = await supabase
    .from("tours_bookings")
    .update({ status: "cancelled", cancellation_reason: trimmed })
    .eq("id", bookingId);
  if (error) return { success: false, error: userFacingDbError(error, "The booking could not be cancelled.") };

  revalidateBookings(bookingId);
  return { success: true, message: `Booking ${booking.booking_reference} cancelled.` };
}

/** Approves the ticked rows, keeping going when one of them fails. */
export async function approvePendingBookings(bookingIds: string[]): Promise<BoardActionResult> {
  const ids = [...new Set(bookingIds.filter((id) => isUuid(id)))].slice(0, 50);
  if (ids.length === 0) return { success: false, error: "Tick at least one booking to approve." };

  let approved = 0;
  const failures: string[] = [];
  for (const id of ids) {
    const result = await approveBooking(id, null);
    if (result.success) approved += 1;
    else failures.push(result.error ?? "One booking could not be approved.");
  }
  if (approved === 0) return { success: false, error: failures[0] ?? "Nothing could be approved." };
  return {
    success: true,
    message: `${approved} booking${approved === 1 ? "" : "s"} confirmed.${failures.length ? ` ${failures.length} could not be: ${failures[0]}` : ""}`,
  };
}

/**
 * Process Refund, from the board.
 *
 * PayMongo (Auto): the app refunds the payments that came in through PayMongo
 * (oldest first, never past what each still has), then records one ledger row
 * per refund so the booking's totals update and the tourist's page shows it.
 * Manual GCash: the operator has sent the money themselves and is recording it.
 *
 * A booking that is still live is cancelled or declined first, because money
 * only comes back once the tour is off.
 */
export async function processRefund(input: {
  bookingId: string;
  method: "paymongo" | "manual";
  /** Pesos. Defaults to everything the tourist can still get back. */
  amount?: number | null;
  reason?: string;
  /** For a manual refund: the wallet or bank the money went to, and its reference. */
  manualMethod?: string;
  reference?: string | null;
  closeAs?: "cancelled" | "rejected" | null;
  closeReason?: string | null;
}): Promise<BoardActionResult> {
  if (!isUuid(input.bookingId)) return { success: false, error: "Booking not found." };
  if (input.method !== "paymongo" && input.method !== "manual") return { success: false, error: "Choose how to refund." };
  const reasonKey = isRefundReason(input.reason) ? input.reason : "guest";
  const reasonLabel = REFUND_REASONS[reasonKey].label;

  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return asResult(operator);
  const booking = await loadOwnBooking(supabase, input.bookingId, operator.operatorId);
  if (!booking) return { success: false, error: "Booking not found." };

  // Money only goes back once the tour is off. A live booking is closed here,
  // in the same step, so the operator does not have to cancel and then refund.
  if (booking.status === "pending" || booking.status === "confirmed") {
    const nextStatus = input.closeAs === "rejected" && booking.status === "pending" ? "rejected" : "cancelled";
    const check = checkTransition(booking.status, nextStatus, "operator", {
      tourDate: booking.tour_date,
      today: toManilaDateKey(new Date()),
      totalPaid: Number(booking.total_paid ?? 0),
    });
    if (!check.ok) return { success: false, error: check.reason };
    const trimmed = String(input.closeReason ?? "").trim();
    const closeReason = trimmed.length >= 5 ? trimmed.slice(0, 500) : `Refunded before the tour: ${reasonLabel}.`;
    const { error } = await supabase
      .from("tours_bookings")
      .update({ status: nextStatus, cancellation_reason: closeReason })
      .eq("id", booking.id);
    if (error) return { success: false, error: userFacingDbError(error, "The booking could not be closed for the refund.") };
  } else if (booking.status !== "cancelled" && booking.status !== "rejected") {
    return { success: false, error: "This booking has already been completed; refund it from the ledger instead." };
  }

  if (input.method === "manual") {
    const formData = new FormData();
    formData.set("amount", input.amount != null ? input.amount.toFixed(2) : "");
    formData.set("method", input.manualMethod ?? "gcash");
    formData.set("reference", input.reference ?? "");
    const { data: refundable } = await supabase.rpc("tours_refundable_amount", { p_booking_id: booking.id });
    const available = Number(refundable ?? 0);
    if (input.amount == null) formData.set("amount", available.toFixed(2));
    const parsed = parseRefundForm(formData, available);
    if (!parsed.ok) return { success: false, error: parsed.error };
    const { data: left, error } = await supabase.rpc("tours_record_refund", {
      p_booking_id: booking.id,
      p_amount: parsed.data.amount,
      p_method: parsed.data.method,
      p_reference: parsed.data.reference ?? "",
    });
    if (error) {
      console.error("Record refund error:", error);
      return { success: false, error: userFacingDbError(error, "The refund could not be recorded.") };
    }
    revalidateBookings(booking.id);
    emailRefundSent(booking.id, parsed.data.amount);
    const remaining = Number(left ?? 0);
    return {
      success: true,
      message:
        remaining > 0
          ? `Refund of ${formatPeso(parsed.data.amount)} recorded. ${formatPeso(remaining)} can still be refunded.`
          : `Refund of ${formatPeso(parsed.data.amount)} recorded. Everything paid has been returned.`,
    };
  }

  // ---- PayMongo ----------------------------------------------------------
  const config = getPaymongoConfig();
  if (!config) return { success: false, error: "PayMongo is not configured, so an automatic refund cannot be sent. Use Manual GCash." };

  const { data: paymentRows, error: paymentsError } = await supabase
    .from("tours_payments")
    .select("id, provider, provider_ref, amount, payment_status")
    .eq("booking_id", booking.id)
    .eq("provider", "paymongo")
    .eq("payment_status", "completed")
    .order("payment_date", { ascending: true });
  if (paymentsError) return { success: false, error: "The payments on this booking could not be read." };
  if (!paymentRows || paymentRows.length === 0) {
    return { success: false, error: "Nothing was paid online on this booking. Use Manual GCash to record what you sent back." };
  }

  // Refunds already linked to each payment, so a second refund only asks for
  // what that payment still has left.
  const paymentIds = paymentRows.map((row) => row.id);
  const { data: earlierRefunds } = await supabase
    .from("tours_payments")
    .select("refund_of, amount, payment_status")
    .in("refund_of", paymentIds);
  const refundedByPayment = new Map<string, number>();
  for (const row of earlierRefunds ?? []) {
    if (row.payment_status !== "refunded" || !row.refund_of) continue;
    refundedByPayment.set(row.refund_of, (refundedByPayment.get(row.refund_of) ?? 0) + Number(row.amount ?? 0));
  }

  const online: OnlinePayment[] = paymentRows
    .filter((row) => row.provider_ref)
    .map((row) => ({ id: row.id, provider_ref: row.provider_ref as string, amount: row.amount, refunded: refundedByPayment.get(row.id) ?? 0 }));

  const { data: refundableRow } = await supabase.rpc("tours_refundable_amount", { p_booking_id: booking.id });
  const refundable = Number(refundableRow ?? 0);
  // Without an amount, refund everything paid that has not come back yet.
  // (remainingBalance is the *tourist's* outstanding balance — the wrong direction here.)
  const onlineLeft = online.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const amount = input.amount != null ? Math.round(input.amount * 100) / 100 : Math.min(refundable, Math.round(onlineLeft * 100) / 100);
  if (amount <= 0) return { success: false, error: "There is nothing left to refund on this booking." };
  if (amount > refundable + 0.001) {
    return { success: false, error: `You can refund at most ${formatPeso(refundable)}.` };
  }

  const plan = planRefund(online, amount);
  if (!plan.ok) return { success: false, error: plan.reason };

  const recorded: Array<{ payment_id: string; provider_ref: string; amount: number }> = [];
  for (const slice of plan.slices) {
    const payment = paymentRows.find((row) => row.provider_ref === slice.paymentId);
    if (!payment) return { success: false, error: "A payment on this booking could not be matched." };
    try {
      const refund = await createRefund(config, {
        paymentId: slice.paymentId,
        amountCentavos: slice.amountCentavos,
        reason: REFUND_REASONS[reasonKey].paymongo,
        notes: refundNotes(booking.booking_reference, reasonLabel).slice(0, REFUND_NOTES_MAX),
      });
      recorded.push({ payment_id: payment.id, provider_ref: refund.id, amount: slice.amountCentavos / 100 });
    } catch (error) {
      console.error("PayMongo refund error:", error);
      const message = error instanceof Error ? error.message : "PayMongo did not accept the refund.";
      if (recorded.length > 0) {
        // Record what did go through, so the ledger never disagrees with PayMongo.
        await supabase.rpc("tours_record_online_refund", { p_booking_id: booking.id, p_rows: recorded });
        revalidateBookings(booking.id);
      }
      return {
        success: false,
        error: `${message}${recorded.length ? ` ${formatPeso(recorded.reduce((sum, row) => sum + row.amount, 0))} of it went through and was recorded.` : ""}`,
      };
    }
  }

  const { data: left, error: recordError } = await supabase.rpc("tours_record_online_refund", {
    p_booking_id: booking.id,
    p_rows: recorded,
  });
  if (recordError) {
    console.error("Record online refund error:", recordError);
    return {
      success: false,
      error: `PayMongo sent ${formatPeso(amount)}, but the ledger could not be updated. Record it by hand: ${userFacingDbError(recordError, "please try again.")}`,
    };
  }

  revalidateBookings(booking.id);
  emailRefundSent(booking.id, amount);
  const remaining = Number(left ?? 0);
  const channel = config.mode === "live" ? "PayMongo" : "PayMongo Sandbox";
  return {
    success: true,
    message:
      remaining > 0
        ? `${channel}: ${formatPeso(amount)} refunded. ${formatPeso(remaining)} can still be refunded.`
        : `${channel}: ${formatPeso(amount)} successfully refunded.`,
  };
}
