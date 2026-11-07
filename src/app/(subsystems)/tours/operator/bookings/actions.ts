"use server";

import { scheduleErrorMessage } from "@/lib/tours/guide-swap";
import { emailBookingConfirmed, emailGuideAssigned, emailTripCalledOff } from "@/lib/email/notify-booking";
import { parseCallOffReason } from "@/lib/tours/call-off";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkTransition, isBookingStatus, type BookingStatus } from "@/lib/tours/booking-lifecycle";
import { parseStaffReason } from "@/lib/tours/cancellation";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";

type ActionResult = {
  success: boolean;
  error?: string;
};

export async function assignGuideToBooking(
  bookingId: string,
  guideId: string | null
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Authentication required" };
    }

    // Get operator profile
    const { data: operator, error: operatorError } = await supabase
      .from("tours_operators")
      .select("id, accreditation_status")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (operatorError || !operator) {
      return { success: false, error: "Operator profile not found" };
    }

    if (operator.accreditation_status !== "approved") {
      return { success: false, error: "Your operator account must be approved to manage bookings." };
    }

    // Verify the booking belongs to this operator's package
    const { data: booking, error: bookingFetchError } = await supabase
      .from("tours_bookings")
      .select(
        `
        id,
        tours_packages!inner (
          operator_id
        )
      `
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingFetchError || !booking) {
      return { success: false, error: "Booking not found" };
    }

    // Check ownership
    const pkg = Array.isArray(booking.tours_packages)
      ? booking.tours_packages[0]
      : booking.tours_packages;

    if (pkg?.operator_id !== operator.id) {
      return { success: false, error: "Unauthorized" };
    }

    // If guideId provided, verify the guide exists and is approved
    if (guideId) {
      const { data: guide, error: guideError } = await supabase
        .from("tours_guides")
        .select("id, accreditation_status")
        .eq("id", guideId)
        .maybeSingle();

      if (guideError || !guide) {
        return { success: false, error: "Guide not found" };
      }

      if (guide.accreditation_status !== "approved") {
        return { success: false, error: "Guide is not approved" };
      }
    }

    // Assign or unassign guide
    const { data: updated, error: updateError } = await supabase
      .from("tours_bookings")
      .update({ assigned_guide_id: guideId })
      .eq("id", bookingId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      // R6: the schedule rule (available that day, not double-booked) is enforced in the database.
      const scheduleError = scheduleErrorMessage(updateError);
      if (scheduleError) return { success: false, error: scheduleError };
      console.error("Guide assignment error:", updateError);
      return { success: false, error: "Failed to assign guide" };
    }

    if (!updated) return { success: false, error: "Failed to assign guide" };

    if (guideId) emailGuideAssigned(bookingId, guideId);

    // Revalidate the bookings page
    revalidatePath("/tours/operator/bookings");

    return { success: true };
  } catch (err) {
    console.error("Unexpected error in assignGuideToBooking:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Moves a booking along the lifecycle (booking-lifecycle.ts). The database
 * trigger tours_bookings_status_guard enforces the same rules; checking here
 * first gives a clear message. Declining or cancelling needs a reason, which
 * the tourist sees.
 */
export async function updateBookingStatus(
  bookingId: string,
  newStatus: string,
  reason?: string
): Promise<ActionResult> {
  try {
    if (!isUuid(bookingId) || !isBookingStatus(newStatus)) {
      return { success: false, error: "Invalid status" };
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Authentication required" };
    }

    const { data: operator, error: operatorError } = await supabase
      .from("tours_operators")
      .select("id, accreditation_status")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (operatorError || !operator) {
      return { success: false, error: "Operator profile not found" };
    }
    if (operator.accreditation_status !== "approved") {
      return { success: false, error: "Your operator account must be approved to manage bookings." };
    }

    const { data: booking, error: bookingFetchError } = await supabase
      .from("tours_bookings")
      .select("id, status, tour_date, total_paid, tours_packages!inner ( operator_id )")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingFetchError || !booking) {
      return { success: false, error: "Booking not found" };
    }

    const pkg = Array.isArray(booking.tours_packages)
      ? booking.tours_packages[0]
      : booking.tours_packages;

    if (pkg?.operator_id !== operator.id || !isBookingStatus(booking.status)) {
      return { success: false, error: "Unauthorized" };
    }

    const check = checkTransition(booking.status, newStatus, "operator", {
      tourDate: booking.tour_date,
      today: toManilaDateKey(new Date()),
      totalPaid: Number(booking.total_paid ?? 0),
    });
    if (!check.ok) return { success: false, error: check.reason };

    const update: { status: BookingStatus; cancellation_reason?: string } = { status: newStatus };
    if (newStatus === "rejected" || newStatus === "cancelled") {
      const parsed = parseStaffReason(reason);
      if (!parsed.ok) return { success: false, error: parsed.error };
      update.cancellation_reason = parsed.reason;
    }

    const { data: updated, error: updateError } = await supabase
      .from("tours_bookings")
      .update(update)
      .eq("id", bookingId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("Booking update error:", updateError);
      return { success: false, error: userFacingDbError(updateError, "Failed to update booking") };
    }

    if (!updated) return { success: false, error: "Failed to update booking" };
    revalidatePath("/tours/operator/bookings");
    revalidatePath(`/tours/bookings/${bookingId}`);
    // "Confirmed, please pay": once, on the pending → confirmed change.
    if (newStatus === "confirmed" && booking.status === "pending") emailBookingConfirmed(bookingId);

    return { success: true };
  } catch (err) {
    console.error("Unexpected error in updateBookingStatus:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Calls a confirmed trip off (weather or safety). The database checks that
 * this operator runs the tour, tells the traveller and the guide in the app
 * and by push, and the traveller gets an email; they then pick a new date
 * or a full refund.
 */
export async function callOffBooking(bookingId: string, reason: string): Promise<ActionResult> {
  if (!isUuid(bookingId)) return { success: false, error: "Booking not found." };
  const parsed = parseCallOffReason(reason);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_call_off_booking", { p_booking_id: bookingId, p_reason: parsed.reason });
  if (error) {
    console.error("Call off booking error:", error.message);
    return { success: false, error: userFacingDbError(error, "The trip could not be called off. Please try again.") };
  }
  revalidatePath("/tours/operator/bookings");
  revalidatePath(`/tours/bookings/${bookingId}`);
  emailTripCalledOff(bookingId, parsed.reason);
  return { success: true };
}
