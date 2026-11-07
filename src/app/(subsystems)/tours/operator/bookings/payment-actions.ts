"use server";

import { emailPaymentReceived } from "@/lib/email/notify-booking";
import { formatPeso } from "@/lib/money";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { parseProofDecision, PROOF_BUCKET } from "@/lib/tours/payment-proof";

interface RecordPaymentInput {
  bookingId: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  paymentDate: string;
  notes: string | null;
}

export async function recordPayment(input: RecordPaymentInput) {
  try {
    const supabase = await createSupabaseServerClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const { data: operatorProfile, error: operatorError } = await supabase
      .from("tours_operators")
      .select("id, accreditation_status")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (operatorError || !operatorProfile || operatorProfile.accreditation_status !== "approved") {
      return { success: false, error: "Only approved operators can record payments." };
    }
    const { data: booking } = await supabase.from("tours_bookings")
      .select("id, tours_packages!inner ( operator_id )")
      .eq("id", input.bookingId).single();
    const pkg = booking && (Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages);
    if (!booking || pkg?.operator_id !== operatorProfile.id) {
      return { success: false, error: "Not authorized to record payments for this booking" };
    }

    if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(Math.round(input.amount * 100) - input.amount * 100) > 1e-7) {
      return { success: false, error: "Enter an amount greater than zero with at most two decimal places" };
    }

    const { data: result, error } = await supabase.rpc("tours_record_operator_payment", {
      p_booking_id: input.bookingId, p_amount: input.amount, p_method: input.paymentMethod,
      p_reference: input.referenceNumber, p_payment_date: input.paymentDate, p_notes: input.notes,
      p_proof_id: null,
    });
    if (error || !result) {
      console.error("Payment insert error:", error);
      return { success: false, error: "Failed to record payment" };
    }
    if (result.status === "exceeds_balance") {
      return { success: false, error: `Amount exceeds remaining balance of ${formatPeso(Number(result.remaining))}` };
    }

    // The trigger will automatically update booking payment status
    emailPaymentReceived(input.bookingId, input.amount);
    revalidatePath("/tours/operator/bookings");

    const remaining = Number(result.remaining);
    const statusMessage = remaining <= 0
      ? "Booking is now fully paid!"
      : `Remaining balance: ${formatPeso(remaining)}`;

    return {
      success: true,
      message: statusMessage,
    };
  } catch (error) {
    console.error("Record payment error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Operator approves or rejects a tourist's uploaded receipt. Approval first
 * records the proof and ledger entry atomically under the booking lock.
 */
export async function reviewPaymentProof(formData: FormData): Promise<{ success: boolean; error?: string; message?: string }> {
  const proofId = formData.get("proofId");
  if (typeof proofId !== "string" || !isUuid(proofId)) return { success: false, error: "Receipt not found." };

  const decision = parseProofDecision(formData);
  if (!decision.ok) return { success: false, error: decision.error };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: operator } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!operator || operator.accreditation_status !== "approved") {
    return { success: false, error: "Only approved operators can verify payments." };
  }

  // RLS limits this to proofs on the operator's own bookings.
  const { data: proof } = await supabase
    .from("tours_payment_proofs")
    .select("id, booking_id, verification_status, tours_bookings!inner ( tours_packages!inner ( operator_id ) )")
    .eq("id", proofId)
    .maybeSingle();
  if (!proof) return { success: false, error: "Receipt not found." };
  const proofBooking = Array.isArray(proof.tours_bookings) ? proof.tours_bookings[0] : proof.tours_bookings;
  const proofPackage = proofBooking && (Array.isArray(proofBooking.tours_packages) ? proofBooking.tours_packages[0] : proofBooking.tours_packages);
  if (proofPackage?.operator_id !== operator.id) return { success: false, error: "Receipt not found." };
  if (proof.verification_status !== "pending") return { success: false, error: "This receipt was already reviewed." };

  const reviewedAt = new Date().toISOString();

  if (decision.value.decision === "reject") {
    const { data: rejected, error } = await supabase
      .from("tours_payment_proofs")
      .update({ verification_status: "rejected", rejection_reason: decision.value.reason, verified_by: user.id, verified_at: reviewedAt })
      .eq("id", proofId)
      .eq("verification_status", "pending")
      .select("id")
      .maybeSingle();
    if (error || !rejected) return { success: false, error: "This receipt was already reviewed." };
    revalidatePath("/tours/operator/bookings");
    revalidatePath(`/tours/bookings/${proof.booking_id}`);
    return { success: true, message: "Receipt rejected. The tourist will see your reason." };
  }

  const { data: result, error: paymentError } = await supabase.rpc("tours_record_operator_payment", {
    p_booking_id: proof.booking_id, p_amount: null, p_method: null, p_reference: null,
    p_payment_date: null, p_notes: null, p_proof_id: proofId,
  });
  if (paymentError || !result) {
    console.error("Verified proof ledger insert error:", paymentError);
    return { success: false, error: paymentError?.code === "P0002"
      ? "This receipt was already reviewed." : "The payment could not be recorded. Please try again." };
  }
  if (result.status === "exceeds_balance") {
    return { success: false, error: `This receipt (${formatPeso(Number(result.amount))}) is more than the remaining balance (${formatPeso(Number(result.remaining))}). Reject it or record the correct amount manually.` };
  }
  const amount = Number(result.amount);
  emailPaymentReceived(proof.booking_id, amount);

  revalidatePath("/tours/operator/bookings");
  revalidatePath("/tours/operator/payments");
  revalidatePath(`/tours/bookings/${proof.booking_id}`);
  return { success: true, message: "Payment verified and added to the ledger." };
}

/** Short-lived link for the operator to view an uploaded receipt (private bucket). */
export async function getProofViewUrl(proofId: string): Promise<{ url?: string; error?: string }> {
  if (!isUuid(proofId)) return { error: "Receipt not found." };
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data: operator, error: operatorError } = await supabase
    .from("tours_operators").select("id, accreditation_status").eq("profile_id", user.id).maybeSingle();
  if (operatorError || !operator || operator.accreditation_status !== "approved") {
    return { error: "Only approved operators can view receipts." };
  }
  const { data: proof } = await supabase
    .from("tours_payment_proofs")
    .select("proof_image_url, tours_bookings!inner ( tours_packages!inner ( operator_id ) )")
    .eq("id", proofId)
    .maybeSingle();
  if (!proof) return { error: "Receipt not found." };
  const booking = Array.isArray(proof.tours_bookings) ? proof.tours_bookings[0] : proof.tours_bookings;
  const pkg = booking && (Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages);
  if (pkg?.operator_id !== operator.id) return { error: "Receipt not found." };
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(proof.proof_image_url, 180);
  if (error || !data) return { error: "The receipt could not be opened." };
  return { url: data.signedUrl };
}
