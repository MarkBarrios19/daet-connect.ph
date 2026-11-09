"use server";

import { scheduleErrorMessage } from "@/lib/tours/guide-swap";
import { parseGuideNotNeededNote } from "@/lib/tours/guide-not-needed";
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

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type OwnedBooking = {
  id: string;
  status: string;
  tour_date: string;
  assigned_guide_id: string | null;
};

/**
 * The signed-in operator, with the booking checked to be on one of their own
 * packages. Every action below starts here, so no action trusts a booking id
 * from the browser.
 */
async function requireOwnedBooking(
  supabase: Supabase,
  bookingId: string,
): Promise<{ ok: true; operatorId: string; booking: OwnedBooking } | { ok: false; error: string }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Authentication required" };
  }

  const { data: operator, error: operatorError } = await supabase
    .from("tours_operators")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (operatorError || !operator) {
    return { ok: false, error: "Operator profile not found" };
  }

  const { data: booking, error: bookingFetchError } = await supabase
    .from("tours_bookings")
    .select(
      `
      id,
      status,
      tour_date,
      assigned_guide_id,
      tours_packages!inner (
        operator_id
      )
    `,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError || !booking) {
    return { ok: false, error: "Booking not found" };
  }

  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;

  if (pkg?.operator_id !== operator.id) {
    return { ok: false, error: "Unauthorized" };
  }

  return { ok: true, operatorId: operator.id, booking: booking as OwnedBooking };
}

/** The board and the tourist's own page both read what happens here. */
function revalidateBooking(bookingId: string) {
  revalidatePath("/tours/operator/bookings");
  revalidatePath("/tours/operator/dashboard");
  revalidatePath("/tours/operator/live");
  revalidatePath(`/tours/bookings/${bookingId}`);
}

export async function assignGuideToBooking(
  bookingId: string,
  guideId: string | null
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();

    const owned = await requireOwnedBooking(supabase, bookingId);
    if (!owned.ok) {
      return { success: false, error: owned.error };
    }

    // If guideId provided, verify the guide exists and is approved
    if (guideId) {
      if (!isUuid(guideId)) return { success: false, error: "Guide not found" };

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

    // Assign or unassign guide. Naming a guide answers any "we don't need one"
    // request, so the flag goes with it (the database guards this too).
    const { error: updateError } = await supabase
      .from("tours_bookings")
      .update(
        guideId
          ? { assigned_guide_id: guideId, guide_not_needed_at: null, guide_not_needed_note: null }
          : { assigned_guide_id: null },
      )
      .eq("id", bookingId);

    if (updateError) {
      // R6: the schedule rule (available that day, not double-booked) is enforced in the database.
      const scheduleError = scheduleErrorMessage(updateError);
      if (scheduleError) return { success: false, error: scheduleError };
      console.error("Guide assignment error:", updateError);
      return { success: false, error: "Failed to assign guide" };
    }

    if (guideId) emailGuideAssigned(bookingId, guideId);

    revalidateBooking(bookingId);

    return { success: true };
  } catch (err) {
    console.error("Unexpected error in assignGuideToBooking:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Records that this tour goes ahead without a guide, or goes back to needing
 * one.
 *
 * The guest usually asks in chat ("di namin kailangan ng tour guide"). Setting
 * this clears whoever was assigned — the database cancels their pending swap
 * request and tells them and the guest — and leaves the booking visibly
 * guideless on purpose, so the board, the dashboard and the live page stop
 * asking for a guide. Clearing it puts the booking back in the "needs a guide"
 * queue; the operator then picks one with assignGuideToBooking.
 */
export async function setGuideNotNeeded(
  bookingId: string,
  notNeeded: boolean,
  note?: string,
): Promise<ActionResult> {
  if (!isUuid(bookingId)) return { success: false, error: "Booking not found" };

  const parsed = parseGuideNotNeededNote(note);
  if (!parsed.ok) return { success: false, error: parsed.error };

  try {
    const supabase = await createSupabaseServerClient();

    const owned = await requireOwnedBooking(supabase, bookingId);
    if (!owned.ok) {
      return { success: false, error: owned.error };
    }

    if (owned.booking.status !== "pending" && owned.booking.status !== "confirmed") {
      return { success: false, error: "Only a pending or confirmed booking can change its guide." };
    }

    const { error: updateError } = await supabase
      .from("tours_bookings")
      .update(
        notNeeded
          ? {
              assigned_guide_id: null,
              guide_not_needed_at: new Date().toISOString(),
              guide_not_needed_note: parsed.note,
            }
          : { guide_not_needed_at: null, guide_not_needed_note: null },
      )
      .eq("id", bookingId);

    if (updateError) {
      console.error("Guide-not-needed error:", updateError);
      return {
        success: false,
        error: userFacingDbError(updateError, "Could not save the guest's guide request. Please try again."),
      };
    }

    revalidateBooking(bookingId);
    return { success: true };
  } catch (err) {
    console.error("Unexpected error in setGuideNotNeeded:", err);
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

    const { error: updateError } = await supabase
      .from("tours_bookings")
      .update(update)
      .eq("id", bookingId);

    if (updateError) {
      console.error("Booking update error:", updateError);
      return { success: false, error: userFacingDbError(updateError, "Failed to update booking") };
    }

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
