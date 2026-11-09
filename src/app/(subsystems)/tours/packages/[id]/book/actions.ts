"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { validateCreateBooking, type CreateBookingInput } from "@/lib/tours/booking-contract";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { emailBookingReceived } from "@/lib/email/notify-booking";

interface CreateBookingResult {
  success: boolean;
  error?: string;
  bookingId?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  try {
    // Writes require a current Supabase Auth session and an authoritative tourist role.
    const session = await getVerifiedSession();
    if (!session.user) {
      return { success: false, error: "You must be logged in to book." };
    }
    if (session.error || session.role !== "tourist") {
      return { success: false, error: session.error ?? "Only tourist accounts can create bookings." };
    }

    // Validate input only after the role gate, so non-tourists cannot reach any booking work.
    const validationError = validateCreateBooking(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const user = session.user;
    const supabase = await createSupabaseServerClient();

    // Get package details to verify it exists and is published
    const { data: pkg, error: pkgError } = await supabase
      .from("tours_packages")
      .select("id, status")
      .eq("id", input.packageId)
      .maybeSingle();

    if (pkgError || !pkg) {
      return { success: false, error: "Package not found." };
    }

    if (pkg.status !== "published") {
      return { success: false, error: "This package is not available for booking." };
    }

    // Get price variant if specified
    let pricePerPax: number | null = null;
    let totalAmount = 0;

    if (input.priceVariantId) {
      const { data: variant, error: variantError } = await supabase
        .from("tours_package_price_variants")
        .select("price_per_pax, flat_price, min_pax, max_pax")
        .eq("id", input.priceVariantId)
        .eq("package_id", input.packageId)
        .maybeSingle();

      if (variantError || !variant) {
        return { success: false, error: "Selected price option is not valid." };
      }

      // Validate pax against variant constraints
      if (input.numberOfPax < variant.min_pax) {
        return {
          success: false,
          error: `Minimum ${variant.min_pax} participants required for this option.`,
        };
      }

      if (variant.max_pax && input.numberOfPax > variant.max_pax) {
        return {
          success: false,
          error: `Maximum ${variant.max_pax} participants allowed for this option.`,
        };
      }

      // Calculate total
      if (variant.price_per_pax) {
        pricePerPax = variant.price_per_pax;
        totalAmount = variant.price_per_pax * input.numberOfPax;
      } else if (variant.flat_price) {
        totalAmount = variant.flat_price;
      }
    }

    if (totalAmount <= 0) {
      return { success: false, error: "Could not calculate booking price." };
    }

    // Generate booking reference
    const { data: refData, error: refError } = await supabase.rpc(
      "generate_booking_reference"
    );

    if (refError || !refData) {
      console.error("Booking reference generation error:", refError);
      return { success: false, error: "Failed to generate booking reference." };
    }

    const bookingReference = refData as string;

    // Create booking
    const { data: booking, error: bookingError } = await supabase
      .from("tours_bookings")
      .insert({
        package_id: input.packageId,
        user_id: user.id,
        price_variant_id: input.priceVariantId || null,
        booking_reference: bookingReference,
        tour_date: input.tourDate,
        number_of_pax: input.numberOfPax,
        price_per_pax: pricePerPax,
        total_amount: totalAmount,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        special_requests: input.specialRequests || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (bookingError || !booking) {
      console.error("Booking creation error:", bookingError);
      // The database checks the date is open and has seats (row-locked), so
      // its messages ("Only 2 seat(s) left on this date.") are shown as-is.
      return { success: false, error: userFacingDbError(bookingError, "Failed to create booking. Please try again.") };
    }

    emailBookingReceived(booking.id);

    return {
      success: true,
      bookingId: booking.id,
    };
  } catch (error) {
    console.error("Create booking error:", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}
