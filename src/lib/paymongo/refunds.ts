import { formatPeso } from "@/lib/money";
import { pesosToCentavos } from "@/lib/paymongo/checkout";

/**
 * PayMongo refunds, planned off the ledger.
 *
 * PayMongo refunds one *payment* at a time (`payment_id` + amount in centavos),
 * and a payment can only be refunded down to zero across all its refunds. A
 * tourist may have paid a booking in several instalments, so a single refund
 * can need more than one API call: oldest payment first, never past what that
 * payment still has left.
 *
 * The planner is pure so the money rule is tested without the network.
 */

/** A completed PayMongo payment in the ledger, as the planner reads it. */
export type OnlinePayment = {
  id: string;
  provider_ref: string;
  amount: number | string;
  /** Refunds already recorded against this payment (ledger `refund_of`). */
  refunded?: number | string | null;
};

export type RefundSlice = {
  paymentId: string; // provider_ref (pay_…)
  amountCentavos: number;
};

export type RefundPlan =
  | { ok: true; slices: RefundSlice[]; centavos: number }
  | { ok: false; reason: string };

/**
 * Splits `amountPesos` across the payments that still have room.
 * Returns fewer slices than needed (with `ok: false`) rather than sending a
 * refund PayMongo will refuse.
 */
export function planRefund(payments: OnlinePayment[], amountPesos: number): RefundPlan {
  const centavos = pesosToCentavos(amountPesos);
  if (!Number.isFinite(centavos) || centavos <= 0) return { ok: false, reason: "Enter how much to refund." };

  let remaining = centavos;
  const slices: RefundSlice[] = [];
  for (const payment of payments) {
    if (remaining <= 0) break;
    const paid = pesosToCentavos(Number(payment.amount ?? 0));
    const already = pesosToCentavos(Number(payment.refunded ?? 0));
    const room = Math.max(0, paid - already);
    if (room <= 0 || !payment.provider_ref) continue;
    const take = Math.min(room, remaining);
    slices.push({ paymentId: payment.provider_ref, amountCentavos: take });
    remaining -= take;
  }

  if (remaining > 0) {
    const available = slices.reduce((sum, slice) => sum + slice.amountCentavos, 0);
    return {
      ok: false,
      reason: `Only ${formatPeso(available / 100)} of the amount paid online can still be refunded through PayMongo. Refund the rest by hand and record it.`,
    };
  }
  return { ok: true, slices, centavos };
}

/** PayMongo's own reason values, for the `reason` attribute. */
export type RefundReason = "duplicate" | "fraudulent" | "requested_by_customer" | "others";

/** The reasons the operator can pick, mapped to PayMongo's values. */
export const REFUND_REASONS = {
  weather: { label: "Weather / Act of Nature Cancellation", paymongo: "others" as RefundReason },
  guest: { label: "Guest Requested Cancellation", paymongo: "requested_by_customer" as RefundReason },
  overbooked: { label: "Operator Overbooked / Unavailable", paymongo: "others" as RefundReason },
  duplicate: { label: "Payment Error / Duplicate", paymongo: "duplicate" as RefundReason },
} as const;

export type RefundReasonKey = keyof typeof REFUND_REASONS;

export function isRefundReason(value: unknown): value is RefundReasonKey {
  return typeof value === "string" && value in REFUND_REASONS;
}

/** Notes go into PayMongo at 255 characters; keep them short and readable. */
export const REFUND_NOTES_MAX = 255;

export function refundNotes(reference: string, reasonLabel: string): string {
  return `${reference} · ${reasonLabel}`.slice(0, REFUND_NOTES_MAX);
}

export type RefundResource = {
  id: string;
  type: "refund";
  attributes: { amount: number; status: string; payment_id: string; reason: string | null };
};

/** PayMongo refund statuses that mean the money is on its way back or already gone. */
export function isSettledRefundStatus(status: string | null | undefined): boolean {
  return status === "succeeded" || status === "processing" || status === "pending";
}

/** The reference an automatic refund is stored under: its PayMongo refund id. */
export function refundReference(refundId: string): string {
  return refundId;
}

/** Compare the provider's active refunds with the ledger before sending more money. */
export function refundHistoryMatches(
  provider: RefundResource[],
  ledger: Array<{ provider_ref: string | null; amount: number | string }>,
  paymentId: string,
): boolean {
  const active = new Map<string, number>();
  for (const refund of provider) {
    const a = refund?.attributes;
    if (!refund?.id || !a || a.payment_id !== paymentId || !Number.isInteger(a.amount) || a.amount <= 0 ||
        !["pending", "processing", "succeeded", "failed"].includes(a.status)) return false;
    if (isSettledRefundStatus(a.status)) {
      if (active.has(refund.id)) return false;
      active.set(refund.id, a.amount);
    }
  }
  if (active.size !== ledger.length) return false;
  for (const row of ledger) {
    if (!row.provider_ref || active.get(row.provider_ref) !== pesosToCentavos(Number(row.amount))) return false;
    active.delete(row.provider_ref);
  }
  return active.size === 0;
}
