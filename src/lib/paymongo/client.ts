import "server-only";
import { resolveAppUrl } from "@/lib/app-url";
import { parsePaymentMethods, type PaymongoMethod } from "@/lib/paymongo/checkout";
import type { RefundResource } from "@/lib/paymongo/refunds";
import type { SignatureMode } from "@/lib/paymongo/signature";

const API_BASE = "https://api.paymongo.com/v1";

export type PaymongoConfig = {
  secretKey: string;
  webhookSecret: string | null;
  mode: SignatureMode;
  appUrl: string;
  methods: PaymongoMethod[];
};

/** Reads configuration lazily so pages that never pay still work without keys. */
export function getPaymongoConfig(): PaymongoConfig | null {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!secretKey) return null;
  const appUrl = resolveAppUrl();
  return {
    secretKey,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET?.trim() || null,
    mode: secretKey.startsWith("sk_live_") ? "live" : "test",
    appUrl,
    methods: parsePaymentMethods(process.env.PAYMONGO_PAYMENT_METHODS),
  };
}

export function isPaymongoConfigured(): boolean {
  return getPaymongoConfig() !== null;
}

export class PaymongoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PaymongoApiError";
  }
}

async function paymongoRequest<T>(config: PaymongoConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`,
      ...init.headers,
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail = (body as { errors?: Array<{ detail?: string }> } | null)?.errors?.[0]?.detail;
    throw new PaymongoApiError(detail ?? `PayMongo request failed (${response.status})`, response.status, body);
  }
  return body as T;
}

export type CheckoutSessionResource = {
  id: string;
  type: "checkout_session";
  attributes: { checkout_url?: string; metadata?: Record<string, unknown>; payments?: unknown[]; [key: string]: unknown };
};

export async function createCheckoutSession(config: PaymongoConfig, body: unknown): Promise<CheckoutSessionResource> {
  const result = await paymongoRequest<{ data: CheckoutSessionResource }>(config, "/checkout_sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return result.data;
}

export async function retrieveCheckoutSession(config: PaymongoConfig, id: string): Promise<CheckoutSessionResource> {
  if (!/^cs_[A-Za-z0-9]+$/.test(id)) throw new PaymongoApiError("Invalid checkout session id", 400, null);
  const result = await paymongoRequest<{ data: CheckoutSessionResource }>(config, `/checkout_sessions/${id}`);
  return result.data;
}

/**
 * Refunds a PayMongo payment (docs.paymongo.com/reference/refund-resource).
 * `amount` is centavos and must not exceed what that payment has left after
 * its earlier refunds; `refunds.ts` works the split out.
 */
export async function createRefund(
  config: PaymongoConfig,
  input: { paymentId: string; amountCentavos: number; reason: string; notes?: string; idempotencyKey: string },
): Promise<RefundResource> {
  if (!/^pay_[A-Za-z0-9]+$/.test(input.paymentId)) throw new PaymongoApiError("Invalid payment id", 400, null);
  if (!Number.isInteger(input.amountCentavos) || input.amountCentavos < 100) {
    throw new PaymongoApiError("PayMongo's smallest refund is ₱1.00", 400, null);
  }
  const result = await paymongoRequest<{ data: RefundResource }>(config, "/refunds", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: input.amountCentavos,
          payment_id: input.paymentId,
          reason: input.reason,
          ...(input.notes ? { notes: input.notes.slice(0, 255) } : {}),
        },
      },
    }),
  });
  return result.data;
}

/** Read every refund for a payment, including refunds made outside this app. */
export async function listPaymentRefunds(config: PaymongoConfig, paymentId: string): Promise<RefundResource[]> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new PaymongoApiError("Invalid payment id", 400, null);
  const refunds: RefundResource[] = [];
  let after: string | undefined;
  const seenCursors = new Set<string>();
  for (let page = 0; page < 100; page++) {
    // Use PayMongo's documented default page size; not all accounts accept
    // larger limits. Still walk every page and fail closed on bad pagination.
    const params = new URLSearchParams({ "data.attributes.payment_id": paymentId });
    if (after) params.set("data.attributes.after", after);
    const result = await paymongoRequest<{ data: RefundResource[]; has_more: boolean }>(config, `/refunds?${params}`);
    if (!Array.isArray(result?.data) || typeof result.has_more !== "boolean") throw new Error("Invalid PayMongo refund history.");
    refunds.push(...result.data);
    if (!result.has_more) return refunds;
    const next = result.data[result.data.length - 1]?.id;
    if (!next || seenCursors.has(next)) throw new Error("Invalid PayMongo refund pagination.");
    seenCursors.add(next);
    after = next;
  }
  throw new Error("PayMongo refund history is too long to verify.");
}

/** Retrieve the authoritative status of a previously accepted refund. */
export async function retrieveRefund(config: PaymongoConfig, id: string): Promise<RefundResource> {
  if (!/^ref_[A-Za-z0-9]+$/.test(id)) throw new PaymongoApiError("Invalid refund id", 400, null);
  const result = await paymongoRequest<{ data: RefundResource }>(config, `/refunds/${id}`);
  return result.data;
}
