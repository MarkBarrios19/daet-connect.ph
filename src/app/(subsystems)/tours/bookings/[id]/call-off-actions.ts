"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkNewDate } from "@/lib/tours/call-off";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";

type Result = { ok: true } | { ok: false; error: string };

/** The database's own message (seats, dates) when it explains the problem; a general one otherwise. */
const friendly = (message: string | undefined, fallback: string) =>
  message && /date|seat|booking|called/i.test(message) && message.length < 200 ? message : fallback;

/** After a call-off: move the trip to a new date with free seats. */
export async function rescheduleCalledOff(bookingId: string, date: string, currentDate: string): Promise<Result> {
  if (!isUuid(bookingId)) return { ok: false, error: "Booking not found." };
  const checked = checkNewDate(date, currentDate, toManilaDateKey(new Date()));
  if (!checked.ok) return checked;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_reschedule_called_off", { p_booking_id: bookingId, p_date: checked.date });
  if (error) return { ok: false, error: friendly(error.message, "The date could not be changed. Please try again.") };
  revalidatePath(`/tours/bookings/${bookingId}`);
  revalidatePath("/tours/my-bookings");
  return { ok: true };
}

/** After a call-off: cancel and ask the operator for the full refund. */
export async function refundCalledOff(bookingId: string): Promise<Result> {
  if (!isUuid(bookingId)) return { ok: false, error: "Booking not found." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_refund_called_off", { p_booking_id: bookingId });
  if (error) return { ok: false, error: friendly(error.message, "The refund request could not be sent. Please try again.") };
  revalidatePath(`/tours/bookings/${bookingId}`);
  revalidatePath("/tours/my-bookings");
  return { ok: true };
}
