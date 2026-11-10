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
import { createRefund, getPaymongoConfig, listPaymentRefunds, PaymongoApiError, retrieveRefund } from "@/lib/paymongo/client";
import {
  isRefundReason,
  planRefund,
  REFUND_NOTES_MAX,
  REFUND_REASONS,
  refundNotes,
  refundHistoryMatches,
  type OnlinePayment,
} from "@/lib/paymongo/refunds";
import {
  isMissingRefundReservationsTable,
  REFUND_RESERVATIONS_NOT_INSTALLED,
} from "@/lib/paymongo/refund-reservations";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

/** Non-sensitive, bounded provider identifiers help diagnose validation failures. */
function paymongoErrorIdentifiers(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const errors = (details as { errors?: unknown }).errors;
  const first = Array.isArray(errors) ? errors[0] : null;
  if (!first || typeof first !== "object") return "";
  const entry = first as { code?: unknown; source?: { pointer?: unknown } };
  const safe = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : null;
  const code = safe(entry.code);
  const field = typeof entry.source?.pointer === "string" && /^\/?[a-zA-Z0-9_.\/-]{1,80}$/.test(entry.source.pointer) ? entry.source.pointer : null;
  const parts = [code ? `code: ${code}` : null, field ? `field: ${field}` : null].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

type OnlineRefundCheck =
  | { ok: true; payments: OnlinePayment[]; available: number }
  | { ok: false; error: string };

/** Pending operations are rechecked from PayMongo, never trusted from the browser.
 * An operation without a provider reference is ambiguous and stays blocked. */
async function reconcilePendingRefund(supabase: Supabase, bookingId: string): Promise<string | null> {
  const { data: operation, error } = await supabase.from("tours_refund_operations")
    .select("id, state, provider_ref").eq("booking_id", bookingId)
    .in("state", ["reserved", "sending", "pending"]).maybeSingle();
  if (error) {
    console.error("Refund reservations check failed:", error.code, error.message);
    // A missing table used to read as a permission problem. Say which
    // migration is missing instead: the operator can hand that to an admin.
    if (isMissingRefundReservationsTable(error)) return REFUND_RESERVATIONS_NOT_INSTALLED;
    return "Refund reservations could not be checked. Ask an administrator to check the database setup.";
  }
  if (!operation) return null;
  if (operation.state !== "pending" || !operation.provider_ref)
    return "A PayMongo refund is in progress or its outcome is uncertain. Do not retry; ask an administrator to reconcile it.";
  const config = getPaymongoConfig();
  if (!config) return "PayMongo is not configured; the pending refund cannot be checked.";
  try {
    const refund = await retrieveRefund(config, operation.provider_ref);
    if (!refund || refund.id !== operation.provider_ref || !["pending", "processing", "succeeded", "failed"].includes(refund.attributes?.status))
      throw new Error("Invalid refund response");
    if (["pending", "processing"].includes(refund.attributes.status)) return "A PayMongo refund is still processing. Check again later.";
    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin.rpc("tours_update_refund_operation", {
      p_id: operation.id, p_state: refund.attributes.status, p_ref: refund.id,
      p_payment_ref: refund.attributes.payment_id, p_centavos: refund.attributes.amount,
    });
    if (updateError) throw new Error("Refund reconciliation failed");
    revalidateBookings(bookingId);
    return null;
  } catch (error) {
    console.error("Pending refund reconciliation failed:", error);
    return "The pending PayMongo refund could not be reconciled. Do not retry; ask an administrator to check it.";
  }
}

/** Check the ledger and PayMongo together. Never guess if the histories differ. */
async function checkOnlineRefunds(supabase: Supabase, bookingId: string): Promise<OnlineRefundCheck> {
  const config = getPaymongoConfig();
  if (!config) return { ok: false, error: "PayMongo is not configured." };
  const pendingError = await reconcilePendingRefund(supabase, bookingId);
  if (pendingError) return { ok: false, error: pendingError };
  const { data: payments, error: paymentError } = await supabase
    .from("tours_payments").select("id, provider_ref, amount")
    .eq("booking_id", bookingId).eq("provider", "paymongo").eq("payment_status", "completed")
    .order("payment_date", { ascending: true });
  if (paymentError) return { ok: false, error: "The online payments could not be checked." };
  if (!payments?.length) return { ok: true, payments: [], available: 0 };
  if (payments.some((p) => !p.provider_ref)) return { ok: false, error: "An online payment is missing its PayMongo reference. Check the payment ledger before refunding." };
  const { data: refunds, error: refundError } = await supabase.from("tours_payments")
    .select("refund_of, provider_ref, amount, payment_status")
    .in("refund_of", payments.map((p) => p.id)).eq("payment_status", "refunded");
  if (refundError) {
    console.error("Refund ledger check failed:", refundError.code, refundError.message);
    if ((refundError.code === "42703" || refundError.code === "PGRST204") && refundError.message.includes("refund_of")) {
      return { ok: false, error: "PayMongo refunds are not set up in the database yet. Ask an administrator to apply the operator online refunds migration before retrying." };
    }
    return { ok: false, error: "The refund ledger could not be checked. Ask an administrator to check the server logs before retrying." };
  }
  try {
    const online: OnlinePayment[] = [];
    for (const payment of payments) {
      const ref = payment.provider_ref!;
      const ledger = (refunds ?? []).filter((r) => r.refund_of === payment.id);
      const provider = await listPaymentRefunds(config, ref);
      if (!refundHistoryMatches(provider, ledger, ref)) {
        return { ok: false, error: "PayMongo's refund history differs from the booking ledger. Check the PayMongo dashboard and reconcile the refund records before retrying. Do not send another refund until they match." };
      }
      online.push({ id: payment.id, provider_ref: ref, amount: payment.amount, refunded: ledger.reduce((sum, row) => sum + Number(row.amount), 0) });
    }
    const available = online.reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.refunded ?? 0)), 0);
    return { ok: true, payments: online, available: Math.round(available * 100) / 100 };
  } catch (error) {
    console.error("PayMongo refund history check failed:", error instanceof PaymongoApiError ? `HTTP ${error.status}${paymongoErrorIdentifiers(error.details)}` : "Unexpected provider response or network error");
    if (error instanceof PaymongoApiError) {
      if (error.status === 401 || error.status === 403) {
        return { ok: false, error: `PayMongo refused the refund history check (HTTP ${error.status}). Ask an administrator to check the PayMongo key and its permissions.` };
      }
      if (error.status === 429 || error.status >= 500) {
        return { ok: false, error: `PayMongo could not check refund history (HTTP ${error.status}). Try again later and check the PayMongo dashboard before retrying.` };
      }
      const identifiers = paymongoErrorIdentifiers(error.details);
      return { ok: false, error: `PayMongo rejected the refund history check (HTTP ${error.status})${identifiers}. Check the payment and refund history in the PayMongo dashboard and ask an administrator to check the server logs.` };
    }
    return { ok: false, error: "PayMongo refund history could not be verified. Check the PayMongo dashboard and ask an administrator to check the server logs before retrying." };
  }
}

/** Current online availability for the dialog, restricted to the booking's operator. */
export async function getOnlineRefundAvailability(bookingId: string): Promise<{ available: number; error?: string }> {
  if (!isUuid(bookingId)) return { available: 0, error: "Booking not found." };
  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return { available: 0, error: operator.error };
  if (!await loadOwnBooking(supabase, bookingId, operator.operatorId)) return { available: 0, error: "Booking not found." };
  const check = await checkOnlineRefunds(supabase, bookingId);
  return check.ok ? { available: check.available } : { available: 0, error: check.error };
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

  // Do not cancel a live booking until the refund request has passed validation.
  let closedForRefund = false;
  async function closeForRefund(): Promise<BoardActionResult | null> {
    if (booking!.status === "pending" || booking!.status === "confirmed") {
      const nextStatus = input.closeAs === "rejected" && booking!.status === "pending" ? "rejected" : "cancelled";
      const check = checkTransition(booking!.status, nextStatus, "operator", {
        tourDate: booking!.tour_date, today: toManilaDateKey(new Date()), totalPaid: Number(booking!.total_paid ?? 0),
      });
      if (!check.ok) return { success: false, error: check.reason };
      const trimmed = String(input.closeReason ?? "").trim();
      const closeReason = trimmed.length >= 5 ? trimmed.slice(0, 500) : `Refunded before the tour: ${reasonLabel}.`;
      const { data: closed, error } = await supabase.from("tours_bookings")
        .update({ status: nextStatus, cancellation_reason: closeReason }).eq("id", booking!.id).eq("status", booking!.status).select("id").maybeSingle();
      if (error) return { success: false, error: userFacingDbError(error, "The booking could not be closed for the refund.") };
      if (!closed) return { success: false, error: "The booking changed. Refresh and check its status before refunding." };
      closedForRefund = true;
    } else if (booking!.status !== "cancelled" && booking!.status !== "rejected") {
      return { success: false, error: "This booking has already been completed; refund it from the ledger instead." };
    }
    return null;
  }

  if (input.method === "manual") {
    const formData = new FormData();
    formData.set("amount", input.amount != null ? input.amount.toFixed(2) : "");
    formData.set("method", input.manualMethod ?? "gcash");
    formData.set("reference", input.reference ?? "");
    const { data: refundable, error: refundableError } = await supabase.rpc("tours_refundable_amount", { p_booking_id: booking.id });
    if (refundableError) return { success: false, error: "The refundable amount could not be checked." };
    const available = Number(refundable ?? 0);
    if (input.amount == null) formData.set("amount", available.toFixed(2));
    const parsed = parseRefundForm(formData, available);
    if (!parsed.ok) return { success: false, error: parsed.error };
    const closeError = await closeForRefund();
    if (closeError) return closeError;
    const { data: left, error } = await supabase.rpc("tours_record_refund", {
      p_booking_id: booking.id,
      p_amount: parsed.data.amount,
      p_method: parsed.data.method,
      p_reference: parsed.data.reference ?? "",
    });
    if (error) {
      console.error("Record refund error:", error);
      return { success: false, error: `${userFacingDbError(error, "The refund could not be recorded.")}${closedForRefund ? " The booking was cancelled." : ""}` };
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

  const onlineCheck = await checkOnlineRefunds(supabase, booking.id);
  if (!onlineCheck.ok) return { success: false, error: onlineCheck.error };
  const { data: refundableRow, error: refundableError } = await supabase.rpc("tours_refundable_amount", { p_booking_id: booking.id });
  if (refundableError) return { success: false, error: "The refundable amount could not be checked." };
  const refundable = Number(refundableRow ?? 0);
  const amount = input.amount != null ? Math.round(input.amount * 100) / 100 : Math.min(refundable, onlineCheck.available);
  if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: "There is nothing left to refund on this booking." };
  if (amount > refundable + 0.001) return { success: false, error: `You can refund at most ${formatPeso(refundable)}.` };
  const plan = planRefund(onlineCheck.payments, amount);
  if (!plan.ok) return { success: false, error: plan.reason };
  if (plan.slices.some((slice) => slice.amountCentavos < 100)) return { success: false, error: "Each PayMongo refund must be at least ₱1.00. Adjust the amount or record a manual refund." };
  // Reserve under the booking lock before any provider call. Multi-payment
  // refunds must be submitted one payment at a time until split operations
  // have their own durable per-slice recovery.
  if (plan.slices.length !== 1) return { success: false, error: `This refund spans multiple payments. Refund one payment at a time: up to ${formatPeso(plan.slices[0].amountCentavos / 100)} for the first payment.` };
  const slice = plan.slices[0];
  const payment = onlineCheck.payments.find((row) => row.provider_ref === slice.paymentId);
  if (!payment) return { success: false, error: "A payment on this booking could not be matched." };
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try { admin = createSupabaseAdminClient(); } catch {
    return { success: false, error: "Refund processing is not configured. Ask an administrator to configure the server." };
  }
  const closeError = await closeForRefund();
  if (closeError) return closeError;
  const { data: operationId, error: reserveError } = await supabase.rpc("tours_reserve_online_refund", {
    p_booking_id: booking.id, p_payment_id: payment.id, p_amount: slice.amountCentavos / 100,
  });
  if (reserveError || !operationId) return { success: false, error: `${userFacingDbError(reserveError, "A refund could not be reserved. Check for a refund in progress.")}${closedForRefund ? " The booking was cancelled." : ""}` };
  const { error: startError } = await admin.rpc("tours_update_refund_operation", { p_id: operationId, p_state: "sending" });
  if (startError) return { success: false, error: "The refund reservation could not be started. Ask an administrator to reconcile it; do not retry." };
  try {
    const refund = await createRefund(config, {
      paymentId: slice.paymentId, amountCentavos: slice.amountCentavos,
      reason: REFUND_REASONS[reasonKey].paymongo,
      notes: refundNotes(booking.booking_reference, reasonLabel).slice(0, REFUND_NOTES_MAX),
      idempotencyKey: operationId,
    });
    const status = refund?.attributes?.status;
    if (!refund?.id || !["pending", "processing", "succeeded", "failed"].includes(status)) throw new Error("Invalid PayMongo refund response");
    const { error: updateError } = await admin.rpc("tours_update_refund_operation", {
      p_id: operationId, p_state: status === "processing" ? "pending" : status, p_ref: refund.id,
      p_payment_ref: refund.attributes.payment_id, p_centavos: refund.attributes.amount,
    });
    if (updateError) throw new Error("Could not record the verified refund response");
    revalidateBookings(booking.id);
    if (status === "failed") return { success: false, error: "PayMongo reported that the refund failed. Check the dashboard before trying again." };
    if (status !== "succeeded") return { success: true, message: "PayMongo accepted the refund; it is still processing. Check again later before issuing another refund." };
    emailRefundSent(booking.id, amount);
    return { success: true, message: `${config.mode === "live" ? "PayMongo" : "PayMongo Sandbox"}: ${formatPeso(amount)} refunded.` };
  } catch (error) {
    const providerError = error instanceof PaymongoApiError ? `PayMongo HTTP ${error.status}${paymongoErrorIdentifiers(error.details)}. ` : "";
    console.error("PayMongo refund requires reconciliation:", providerError || "Unexpected provider response or network error");
    revalidateBookings(booking.id);
    return { success: false, error: `${providerError}${closedForRefund ? "The booking was cancelled. " : ""}The refund outcome is uncertain. Do not retry or send a manual refund; ask an administrator to check PayMongo and reconcile the reservation.` };
  }
}
