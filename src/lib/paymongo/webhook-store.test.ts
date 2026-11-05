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
