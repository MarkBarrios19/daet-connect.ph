jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: jest.fn(() => ({})) }));
jest.mock("@/lib/paymongo/client", () => ({ getPaymongoConfig: jest.fn(() => ({ secretKey: "sk_test_x" })), retrieveCheckoutSession: jest.fn() }));
jest.mock("@/lib/paymongo/webhook-store", () => ({ createSupabaseWebhookStore: jest.fn() }));

import { retrieveCheckoutSession } from "@/lib/paymongo/client";
import { createSupabaseWebhookStore } from "@/lib/paymongo/webhook-store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { confirmBookingReturn, confirmCheckoutReturn } from "./return";

const BOOKING_ID = "410520f7-428e-4a5e-9f7c-e6c14a2399e5";

function session(status: string, bookingId = BOOKING_ID) {
  return {
    id: "cs_1",
    type: "checkout_session",
    attributes: {
      reference_number: "BK-1",
      metadata: { booking_id: bookingId },
      payments: [{ id: "pay_1", type: "payment", attributes: { amount: 50000, status, paid_at: 1793427000, source: { type: "gcash" } } }],
    },
  };
}

const retrieve = retrieveCheckoutSession as jest.Mock;
const store = createSupabaseWebhookStore as jest.Mock;

describe("confirmCheckoutReturn", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));

  it("records a paid session", async () => {
    const insertPayments = jest.fn().mockResolvedValue(1);
    store.mockReturnValue({ insertPayments });
    retrieve.mockResolvedValue(session("paid"));
    await expect(confirmCheckoutReturn(BOOKING_ID, "cs_1")).resolves.toEqual({ status: "paid", recorded: 1, recordFailed: false, amountCentavos: 50000, method: "gcash" });
    expect(insertPayments).toHaveBeenCalledWith([expect.objectContaining({ booking_id: BOOKING_ID, provider_ref: "pay_1", amount: 500 })]);
  });

  it("still reports paid when saving fails, so the tourist isn't told to wait", async () => {
    store.mockReturnValue({ insertPayments: jest.fn().mockRejectedValue(new Error("Legacy API keys are disabled")) });
    retrieve.mockResolvedValue(session("paid"));
    await expect(confirmCheckoutReturn(BOOKING_ID, "cs_1")).resolves.toMatchObject({ status: "paid", recorded: 0, recordFailed: true });
  });

  it("is unpaid without paid payments, and unknown for another booking's session or a PayMongo error", async () => {
    retrieve.mockResolvedValueOnce(session("pending"));
    await expect(confirmCheckoutReturn(BOOKING_ID, "cs_1")).resolves.toEqual({ status: "unpaid" });
    retrieve.mockResolvedValueOnce(session("paid", "00000000-0000-0000-0000-000000000000"));
    await expect(confirmCheckoutReturn(BOOKING_ID, "cs_1")).resolves.toEqual({ status: "unknown", reason: "mismatch" });
    retrieve.mockRejectedValueOnce(new Error("PayMongo down"));
    await expect(confirmCheckoutReturn(BOOKING_ID, "cs_1")).resolves.toEqual({ status: "unknown", reason: "error" });
    await expect(confirmCheckoutReturn(BOOKING_ID, undefined)).resolves.toEqual({ status: "unknown", reason: "no_session" });
  });
});

describe("confirmBookingReturn", () => {
  const admin = createSupabaseAdminClient as jest.Mock;
  const sessionsFor = (ids: string[]) =>
    admin.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: ids.map((session_id) => ({ session_id })) }) }) }) }) }),
    });
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));

  it("falls back to the sessions saved in the database when there is no cookie", async () => {
    const insertPayments = jest.fn().mockResolvedValue(1);
    store.mockReturnValue({ insertPayments });
    sessionsFor(["cs_new", "cs_old"]);
    retrieve.mockResolvedValueOnce({ ...session("pending"), id: "cs_new" }).mockResolvedValueOnce({ ...session("paid"), id: "cs_old" });
    await expect(confirmBookingReturn(BOOKING_ID, undefined)).resolves.toMatchObject({ status: "paid", recorded: 1 });
  });

  it("reports no session when neither the cookie nor the database has one", async () => {
    sessionsFor([]);
    await expect(confirmBookingReturn(BOOKING_ID, undefined)).resolves.toEqual({ status: "unknown", reason: "no_session" });
  });
});
