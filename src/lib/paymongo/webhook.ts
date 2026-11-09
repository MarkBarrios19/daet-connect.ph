import type { RefundResource } from "@/lib/paymongo/refunds";
import {
  centavosToPesos,
  extractPaidPayments,
  ledgerPaymentMethod,
  sessionBookingId,
} from "@/lib/paymongo/checkout";
import { verifyWebhookSignature, type SignatureMode } from "@/lib/paymongo/signature";

/**
 * Processes one PayMongo webhook delivery.
 *
 * 1. Verify the signature against the raw body (401 otherwise).
 * 2. Record the event id once; a redelivery of a processed event is a no-op.
 * 3. For checkout_session.payment.paid, re-fetch the session from PayMongo
 *    (the API, not the webhook body, is the source of truth) and insert each
 *    paid payment into the ledger once (unique provider + provider_ref).
 *    The ledger trigger then updates the booking's total_paid/payment_status.
 *
 * Returns an HTTP status: 2xx tells PayMongo to stop retrying; 5xx makes it
 * retry later, so unexpected failures leave the event unprocessed.
 */

export const PAID_EVENT = "checkout_session.payment.paid";

export type LedgerInsert = {
  booking_id: string;
  amount: number;
  payment_method: "gcash" | "credit_card" | "other";
  payment_status: "completed";
  provider: "paymongo";
  provider_ref: string;
  provider_method: string | null;
  reference_number: string;
  payment_date: string;
  notes: string;
  raw_event: unknown;
};

export interface WebhookStore {
  /** Inserts the event if new. Returns whether it was already processed. */
  recordEvent(event: { id: string; type: string; livemode: boolean; payload: unknown }): Promise<{ alreadyProcessed: boolean }>;
  bookingExists(bookingId: string): Promise<boolean>;
  /** Inserts ledger rows, skipping any whose (provider, provider_ref) already exists. Returns rows inserted. */
  insertPayments(rows: LedgerInsert[]): Promise<number>;
  reconcileRefund?(refund: RefundResource): Promise<void>;
  markProcessed(eventId: string, outcome: string, bookingId: string | null): Promise<void>;
}

/**
 * Ledger rows for every paid payment on a checkout session. Shared by the
 * webhook and the return page, so both record a payment the same way and the
 * unique (provider, provider_ref) keeps it to one row whichever comes first.
 */
export function ledgerRowsFromSession({
  session,
  sessionId,
  bookingId,
  now,
  rawEvent,
}: {
  session: unknown;
  sessionId: string;
  bookingId: string;
  now: Date;
  rawEvent: (paymentId: string) => unknown;
}): LedgerInsert[] {
  const reference = String(asRecord(asRecord(session)?.attributes)?.reference_number ?? sessionId);
  return extractPaidPayments(session).map((payment) => ({
    booking_id: bookingId,
    amount: centavosToPesos(payment.amountCentavos),
    payment_method: ledgerPaymentMethod(payment.method),
    payment_status: "completed",
    provider: "paymongo",
    provider_ref: payment.id,
    provider_method: payment.method,
    reference_number: reference,
    payment_date: payment.paidAt ?? now.toISOString(),
    notes: `PayMongo checkout ${sessionId}`,
    raw_event: rawEvent(payment.id),
  }));
}

export type WebhookDeps = {
  webhookSecret: string;
  mode: SignatureMode;
  retrieveSession: (id: string) => Promise<unknown>;
  retrieveRefund?: (id: string) => Promise<RefundResource>;
  store: WebhookStore;
  now?: Date;
};

export type WebhookResult = { status: number; body: { ok: boolean; message: string } };

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;

const respond = (status: number, message: string): WebhookResult => ({ status, body: { ok: status < 300, message } });

export async function processPaymongoWebhook(
  request: { rawBody: string; signatureHeader: string | null },
  deps: WebhookDeps,
): Promise<WebhookResult> {
  const verification = verifyWebhookSignature({
    header: request.signatureHeader,
    rawBody: request.rawBody,
    secret: deps.webhookSecret,
    mode: deps.mode,
    now: deps.now,
  });
  if (!verification.ok) return respond(401, `Invalid signature (${verification.reason})`);

  let payload: unknown;
  try {
    payload = JSON.parse(request.rawBody);
  } catch {
    return respond(400, "Body is not JSON");
  }

  const event = asRecord(asRecord(payload)?.data);
  const eventAttributes = asRecord(event?.attributes);
  const eventId = typeof event?.id === "string" ? event.id : null;
  const eventType = typeof eventAttributes?.type === "string" ? eventAttributes.type : null;
  if (!eventId || !eventType) return respond(400, "Not a PayMongo event");

  const livemode = eventAttributes?.livemode === true;
  if (livemode !== (deps.mode === "live")) {
    return respond(200, `Ignored ${livemode ? "live" : "test"} event in ${deps.mode} mode`);
  }

  const { alreadyProcessed } = await deps.store.recordEvent({ id: eventId, type: eventType, livemode, payload });
  if (alreadyProcessed) return respond(200, "Duplicate event");

  if (eventType === "payment.refund.updated" || eventType === "payment.refunded") {
    const embedded = asRecord(eventAttributes?.data);
    if (embedded?.type !== "refund" || typeof embedded.id !== "string" || !/^ref_[A-Za-z0-9]+$/.test(embedded.id)) {
      // Some payment.refunded events contain a payment rather than a refund.
      // The operator's availability check will reconcile any pending operation.
      await deps.store.markProcessed(eventId, "no_refund_resource", null);
      return respond(200, "No refund resource in event");
    }
    if (!deps.retrieveRefund || !deps.store.reconcileRefund) throw new Error("Refund reconciliation is not configured");
    const refund = await deps.retrieveRefund(embedded.id);
    if (refund?.id !== embedded.id || !["pending", "processing", "succeeded", "failed"].includes(refund.attributes?.status))
      throw new Error("Invalid PayMongo refund response");
    await deps.store.reconcileRefund(refund);
    await deps.store.markProcessed(eventId, "refund_checked", null);
    return respond(200, "Refund checked");
  }

  if (eventType !== PAID_EVENT) {
    await deps.store.markProcessed(eventId, "ignored", null);
    return respond(200, `Ignored ${eventType}`);
  }

  const embeddedSession = asRecord(eventAttributes?.data);
  const sessionId = typeof embeddedSession?.id === "string" ? embeddedSession.id : null;
  if (!sessionId) {
    await deps.store.markProcessed(eventId, "no_session", null);
    return respond(200, "Event has no checkout session");
  }

  const session = await deps.retrieveSession(sessionId);
  const bookingId = sessionBookingId(session);
  if (!bookingId || !(await deps.store.bookingExists(bookingId))) {
    await deps.store.markProcessed(eventId, "unknown_booking", null);
    return respond(200, "Checkout session is not linked to a booking");
  }

  const rows = ledgerRowsFromSession({
    session,
    sessionId,
    bookingId,
    now: deps.now ?? new Date(),
    rawEvent: (paymentId) => ({ event_id: eventId, session_id: sessionId, payment_id: paymentId }),
  });

  if (rows.length === 0) {
    await deps.store.markProcessed(eventId, "no_paid_payments", bookingId);
    return respond(200, "No paid payments on session");
  }

  const inserted = await deps.store.insertPayments(rows);
  await deps.store.markProcessed(eventId, `recorded ${inserted}/${rows.length}`, bookingId);
  return respond(200, `Recorded ${inserted} payment(s)`);
}
