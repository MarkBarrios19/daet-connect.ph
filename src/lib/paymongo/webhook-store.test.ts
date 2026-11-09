jest.mock("server-only", () => ({}));
jest.mock("@/lib/email/notify-booking", () => ({ emailPaymentReceived: jest.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";
import { emailPaymentReceived } from "@/lib/email/notify-booking";
import { createSupabaseWebhookStore } from "@/lib/paymongo/webhook-store";

const adminReturning = (data: unknown[]) =>
  ({ from: () => ({ upsert: () => ({ select: () => Promise.resolve({ data, error: null }) }) }) }) as unknown as SupabaseClient;

describe("insertPayments emails", () => {
  beforeEach(() => (emailPaymentReceived as jest.Mock).mockClear());

  it("emails once per booking for payments new to the ledger", async () => {
    const store = createSupabaseWebhookStore(adminReturning([{ id: "p1", booking_id: "b1", amount: "500.00" }, { id: "p2", booking_id: "b1", amount: 250 }]));
    expect(await store.insertPayments([])).toBe(2);
    expect(emailPaymentReceived).toHaveBeenCalledTimes(1);
    expect(emailPaymentReceived).toHaveBeenCalledWith("b1", 750);
  });

  it("sends nothing when every payment was already recorded", async () => {
    const store = createSupabaseWebhookStore(adminReturning([]));
    expect(await store.insertPayments([])).toBe(0);
    expect(emailPaymentReceived).not.toHaveBeenCalled();
  });
});

describe("refund reconciliation", () => {
  const refund = { id: "ref_one", type: "refund" as const, attributes: { status: "succeeded", payment_id: "pay_one", amount: 10000, reason: null } };
  it("passes a matching operation and authoritative values to the privileged RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    const maybeSingle = jest.fn().mockResolvedValue({ data: { id: "operation", state: "pending" }, error: null });
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }), rpc } as unknown as SupabaseClient;
    await createSupabaseWebhookStore(admin).reconcileRefund!(refund);
    expect(rpc).toHaveBeenCalledWith("tours_update_refund_operation", { p_id: "operation", p_state: "succeeded", p_ref: "ref_one", p_payment_ref: "pay_one", p_centavos: 10000 });
  });

  it("does not modify unknown or already terminal operations", async () => {
    const rpc = jest.fn();
    for (const data of [null, { id: "operation", state: "succeeded" }]) {
      const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) }), rpc } as unknown as SupabaseClient;
      await createSupabaseWebhookStore(admin).reconcileRefund!(refund);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
