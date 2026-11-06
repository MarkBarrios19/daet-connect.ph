"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { MAX_PENDING_PROOFS_PER_BOOKING, parseProofForm, PROOF_BUCKET } from "@/lib/tours/payment-proof";
import { buildCheckoutSessionBody, checkPayable, remainingBalance, type PayableBooking } from "@/lib/paymongo/checkout";
import { createCheckoutSession, getPaymongoConfig, PaymongoApiError } from "@/lib/paymongo/client";
import { checkoutCookieName } from "@/lib/paymongo/return";

export type CheckoutActionState = { error: string | null };

/**
 * Starts a PayMongo Checkout for the signed-in tourist's booking and redirects
 * to the hosted payment page. The amount is the booking's remaining balance
 * read from the database; nothing from the browser decides what is charged.
 */
export async function startOnlinePayment(_prev: CheckoutActionState, formData: FormData): Promise<CheckoutActionState> {
  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string" || !isUuid(bookingId)) return { error: "Booking not found." };

  const config = getPaymongoConfig();
  if (!config) return { error: "Online payment is not available yet. Please use the GCash or bank transfer details." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/bookings/${bookingId}`)}`);

  const { data: booking, error } = await supabase
    .from("tours_bookings")
    .select("id, booking_reference, status, total_amount, total_paid, payment_status, contact_name, contact_email, contact_phone, tours_packages ( title )")
    .eq("id", bookingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !booking) return { error: "Booking not found." };

  const payable = checkPayable(booking as PayableBooking);
  if (!payable.ok) return { error: payable.reason };

  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;

  let checkoutUrl: string | undefined;
  try {
    const session = await createCheckoutSession(
      config,
      buildCheckoutSessionBody({
        booking,
        packageTitle: (pkg as { title?: string } | null)?.title ?? "Daet tour booking",
        amountPesos: payable.amountPesos,
        appUrl: config.appUrl,
        methods: config.methods,
        customer: { name: booking.contact_name, email: booking.contact_email, phone: booking.contact_phone },
      }),
    );
    checkoutUrl = session.attributes.checkout_url;
    // The success page confirms this session with PayMongo when the tourist returns.
    (await cookies()).set(checkoutCookieName(booking.id), session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/tours/bookings/${booking.id}`,
      maxAge: 60 * 60 * 24,
    });
    // Also keep it in the database: the return can land on another address or
    // browser, where this cookie isn't sent.
    const { error: keepError } = await createSupabaseAdminClient().from("tours_checkout_sessions").insert({ booking_id: booking.id, session_id: session.id });
    if (keepError) console.error("Checkout session not saved:", keepError.message);
  } catch (cause) {
    console.error("PayMongo checkout error:", cause instanceof PaymongoApiError ? cause.details : cause);
    return { error: "We couldn't start the online payment. Please try again in a moment." };
  }

  if (!checkoutUrl) return { error: "We couldn't start the online payment. Please try again in a moment." };
  redirect(checkoutUrl);
}

export type ProofActionState = { message: string | null; errors: Record<string, string>; submitted?: boolean };

/** Tourist uploads a GCash/bank receipt for the operator to verify. */
export async function submitPaymentProof(_prev: ProofActionState, formData: FormData): Promise<ProofActionState> {
  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string" || !isUuid(bookingId)) return { message: "Booking not found.", errors: {} };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/bookings/${bookingId}`)}`);

  const { data: booking } = await supabase
    .from("tours_bookings")
    .select("id, booking_reference, status, total_amount, total_paid, payment_status")
    .eq("id", bookingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!booking) return { message: "Booking not found.", errors: {} };

  if (booking.status !== "confirmed" || booking.payment_status === "paid" || booking.payment_status === "refunded") {
    return { message: "This booking is not waiting for a payment.", errors: {} };
  }

  const { count: pendingCount } = await supabase
    .from("tours_payment_proofs")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("verification_status", "pending");
  if ((pendingCount ?? 0) >= MAX_PENDING_PROOFS_PER_BOOKING) {
    return { message: "You already have receipts waiting for review. The operator will check them soon.", errors: {} };
  }

  const parsed = parseProofForm(formData, remainingBalance(booking));
  if (!parsed.ok) return { message: "Please fix the highlighted fields.", errors: parsed.errors };

  const path = `${bookingId}/${crypto.randomUUID()}.${parsed.data.extension}`;
  const { error: uploadError } = await supabase.storage.from(PROOF_BUCKET).upload(path, parsed.data.file, {
    contentType: parsed.data.file.type,
    upsert: false,
  });
  if (uploadError) {
    console.error("Payment proof upload error:", uploadError);
    return { message: "The receipt could not be uploaded. Please try again.", errors: {} };
  }

  const { error: insertError } = await supabase.from("tours_payment_proofs").insert({
    booking_id: bookingId,
    amount: parsed.data.amount,
    payment_method: parsed.data.paymentMethod,
    reference_number: parsed.data.referenceNumber,
    proof_image_url: path,
    submitted_by: user.id,
  });
  if (insertError) {
    console.error("Payment proof insert error:", insertError);
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
    return { message: "The receipt could not be saved. Please try again.", errors: {} };
  }

  revalidatePath(`/tours/bookings/${bookingId}`);
  revalidatePath("/tours/operator/bookings");
  return { message: null, errors: {}, submitted: true };
}
