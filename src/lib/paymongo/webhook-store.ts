import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerInsert, WebhookStore } from "@/lib/paymongo/webhook";
import { emailPaymentReceived } from "@/lib/email/notify-booking";

/** Webhook persistence through the service-role client (the webhook has no user session). */
export function createSupabaseWebhookStore(admin: SupabaseClient): WebhookStore {
  return {
    async recordEvent(event) {
      const { error: insertError } = await admin
        .from("tours_payment_events")
        .upsert(
          { event_id: event.id, event_type: event.type, livemode: event.livemode, payload: event.payload },
          { onConflict: "event_id", ignoreDuplicates: true },
        );
      if (insertError) throw new Error(`Could not record webhook event: ${insertError.message}`);

      const { data, error } = await admin
        .from("tours_payment_events")
        .select("processed_at")
        .eq("event_id", event.id)
        .single();
      if (error) throw new Error(`Could not read webhook event: ${error.message}`);
      return { alreadyProcessed: Boolean(data.processed_at) };
    },

    async bookingExists(bookingId) {
      const { data, error } = await admin.from("tours_bookings").select("id").eq("id", bookingId).maybeSingle();
      if (error) throw new Error(`Could not load booking: ${error.message}`);
      return Boolean(data);
    },

    async insertPayments(rows: LedgerInsert[]) {
      const { data, error } = await admin
        .from("tours_payments")
        .upsert(rows, { onConflict: "provider,provider_ref", ignoreDuplicates: true })
        .select("id, booking_id, amount");
      if (error) throw new Error(`Could not record payment: ${error.message}`);
      // Only rows new to the ledger come back, so a retried webhook or the
      // return page recording the same payment doesn't email twice.
      const byBooking = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ booking_id: string; amount: number | string }>) byBooking.set(row.booking_id, (byBooking.get(row.booking_id) ?? 0) + Number(row.amount ?? 0));
      for (const [bookingId, amount] of byBooking) emailPaymentReceived(bookingId, amount);
      return data?.length ?? 0;
    },

    async markProcessed(eventId, outcome, bookingId) {
      const { error } = await admin
        .from("tours_payment_events")
        .update({ processed_at: new Date().toISOString(), outcome, booking_id: bookingId })
        .eq("event_id", eventId);
      if (error) throw new Error(`Could not mark webhook event processed: ${error.message}`);
    },
  };
}
