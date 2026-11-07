"use server";

import { emailPaymentReceived } from "@/lib/email/notify-booking";
import { formatPeso } from "@/lib/money";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { isProofMethod, parseProofDecision, PROOF_BUCKET, proofLedgerMethod } from "@/lib/tours/payment-proof";
import { remainingBalance } from "@/lib/paymongo/checkout";

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

    // Verify user is an operator and owns this booking's package
    const { data: booking, error: bookingError } = await supabase
      .from("tours_bookings")
      .select(
        `
        id,
        total_amount,
        total_paid,
        payment_status,
        tours_packages!inner (
          id,
          tours_operators!inner (
            id,
            profile_id
          )
        )
      `
      )
      .eq("id", input.bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: "Booking not found" };
    }

    // Type guard for tours_packages
    const pkg = Array.isArray(booking.tours_packages)
      ? booking.tours_packages[0]
      : booking.tours_packages;

    if (!pkg) {
      return { success: false, error: "Package not found" };
    }

    const operator = Array.isArray(pkg.tours_operators)
      ? pkg.tours_operators[0]
      : pkg.tours_operators;

    if (!operator || operator.profile_id !== user.id || operator.id !== operatorProfile.id) {
      return { success: false, error: "Not authorized to record payments for this booking" };
    }

    // Validate amount
    if (input.amount <= 0) {
      return { success: false, error: "Amount must be greater than zero" };
    }

    const remaining = booking.total_amount - (booking.total_paid || 0);
    if (input.amount > remaining) {
      return {
        success: false,
        error: `Amount exceeds remaining balance of ${formatPeso(remaining)}`,
      };
    }

    // Insert payment record
    const { error: insertError } = await supabase.from("tours_payments").insert({
      booking_id: input.bookingId,
      amount: input.amount,
      payment_method: input.paymentMethod,
      payment_status: "completed",
      reference_number: input.referenceNumber,
      payment_date: input.paymentDate,
      notes: input.notes,
      recorded_by: user.id,
    });

    if (insertError) {
      console.error("Payment insert error:", insertError);
      return { success: false, error: "Failed to record payment" };
    }

    // The trigger will automatically update booking payment status
    emailPaymentReceived(input.bookingId, input.amount);
    revalidatePath("/tours/operator/bookings");

    // Calculate new status for message
    const newTotalPaid = (booking.total_paid || 0) + input.amount;
    const statusMessage =
      newTotalPaid >= booking.total_amount
        ? "Booking is now fully paid!"
        : `Remaining balance: ${formatPeso((booking.total_amount - newTotalPaid))}`;

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
 * claims the proof (pending -> verified, so a double click cannot record it
 * twice), then writes the manual ledger row; if that fails the claim is undone.
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
    .select("id, booking_id, amount, payment_method, reference_number, submitted_at, verification_status, tours_bookings!inner ( total_amount, total_paid, tours_packages!inner ( operator_id ) )")
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

  const booking = Array.isArray(proof.tours_bookings) ? proof.tours_bookings[0] : proof.tours_bookings;
  const remaining = remainingBalance(booking ?? { total_amount: 0, total_paid: 0 });
  const amount = Number(proof.amount);
  if (amount > remaining + 0.001) {
    return { success: false, error: `This receipt (${formatPeso(amount)}) is more than the remaining balance (${formatPeso(remaining)}). Reject it or record the correct amount manually.` };
  }

  const { data: claimed, error: claimError } = await supabase
    .from("tours_payment_proofs")
    .update({ verification_status: "verified", verified_by: user.id, verified_at: reviewedAt, rejection_reason: null })
    .eq("id", proofId)
    .eq("verification_status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return { success: false, error: "This receipt was already reviewed." };

  const { data: payment, error: paymentError } = await supabase
    .from("tours_payments")
    .insert({
      booking_id: proof.booking_id,
      amount,
      payment_method: proofLedgerMethod(isProofMethod(proof.payment_method) ? proof.payment_method : "other"),
      payment_status: "completed",
      reference_number: proof.reference_number,
      payment_date: proof.submitted_at,
      notes: "Verified from uploaded receipt",
      recorded_by: user.id,
    })
    .select("id")
    .single();

  if (paymentError || !payment) {
    console.error("Verified proof ledger insert error:", paymentError);
    await supabase
      .from("tours_payment_proofs")
      .update({ verification_status: "pending", verified_by: null, verified_at: null })
      .eq("id", proofId);
    return { success: false, error: "The payment could not be recorded. Please try again." };
  }

  await supabase.from("tours_payment_proofs").update({ payment_id: payment.id }).eq("id", proofId);
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
