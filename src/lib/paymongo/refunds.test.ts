import { isRefundReason, isSettledRefundStatus, planRefund, refundHistoryMatches, REFUND_NOTES_MAX, refundNotes, REFUND_REASONS } from "./refunds";

const payment = (over: Partial<{ id: string; provider_ref: string; amount: number; refunded: number | null }> = {}) => ({
  id: "pay-row-1",
  provider_ref: "pay_abc123",
  amount: 1398,
  refunded: null,
  ...over,
});

describe("planRefund", () => {
  it("refunds a single payment in centavos", () => {
    const plan = planRefund([payment()], 1398);
    expect(plan).toEqual({ ok: true, slices: [{ paymentId: "pay_abc123", amountCentavos: 139800 }], centavos: 139800 });
  });

  it("rounds pesos to whole centavos", () => {
    const plan = planRefund([payment({ amount: 500 })], 499.99);
    expect(plan).toEqual({ ok: true, slices: [{ paymentId: "pay_abc123", amountCentavos: 49999 }], centavos: 49999 });
  });

  it("walks instalments oldest first", () => {
    const payments = [
      payment({ id: "a", provider_ref: "pay_first", amount: 500 }),
      payment({ id: "b", provider_ref: "pay_second", amount: 898 }),
    ];
    const plan = planRefund(payments, 1000);
    expect(plan).toEqual({
      ok: true,
      centavos: 100000,
      slices: [
        { paymentId: "pay_first", amountCentavos: 50000 },
        { paymentId: "pay_second", amountCentavos: 50000 },
      ],
    });
  });

  it("never goes past what a payment still has left", () => {
    const plan = planRefund([payment({ amount: 1398, refunded: 1000 })], 1398);
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error("expected a refusal");
    expect(plan.reason).toContain("₱398.00");
    expect(plan.reason).toContain("Refund the rest by hand");
  });

  it("skips payments with no room and ones with no PayMongo reference", () => {
    const plan = planRefund(
      [
        payment({ id: "spent", provider_ref: "pay_spent", amount: 500, refunded: 500 }),
        payment({ id: "manual", provider_ref: "", amount: 500 }),
        payment({ id: "good", provider_ref: "pay_good", amount: 898 }),
      ],
      898,
    );
    expect(plan).toEqual({ ok: true, centavos: 89800, slices: [{ paymentId: "pay_good", amountCentavos: 89800 }] });
  });

  it("refuses an empty or negative amount", () => {
    for (const amount of [0, -5, Number.NaN]) {
      const plan = planRefund([payment()], amount);
      expect(plan.ok).toBe(false);
    }
  });

  it("refuses when there is nothing online to refund", () => {
    const plan = planRefund([], 500);
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error("expected a refusal");
    expect(plan.reason).toContain("₱0.00");
  });
});

describe("REFUND_REASONS", () => {
  it("maps the operator's reasons onto PayMongo's values", () => {
    expect(Object.keys(REFUND_REASONS)).toEqual(["weather", "guest", "overbooked", "duplicate"]);
    expect(REFUND_REASONS.weather.paymongo).toBe("others");
    expect(REFUND_REASONS.guest.paymongo).toBe("requested_by_customer");
    expect(REFUND_REASONS.duplicate.paymongo).toBe("duplicate");
  });

  it("recognises a reason key and rejects anything else", () => {
    expect(isRefundReason("guest")).toBe(true);
    expect(isRefundReason("others")).toBe(false);
    expect(isRefundReason(null)).toBe(false);
  });
});

describe("refundNotes", () => {
  it("stays inside PayMongo's 255 characters", () => {
    const notes = refundNotes("DAET-2026-0001", REFUND_REASONS.weather.label);
    expect(notes).toBe("DAET-2026-0001 · Weather / Act of Nature Cancellation");
    expect(refundNotes("X".repeat(400), "y").length).toBe(REFUND_NOTES_MAX);
  });
});

describe("isSettledRefundStatus", () => {
  it("treats money on its way back as done enough to record", () => {
    for (const status of ["succeeded", "processing", "pending"]) expect(isSettledRefundStatus(status)).toBe(true);
    for (const status of ["failed", "", null, undefined]) expect(isSettledRefundStatus(status)).toBe(false);
  });
});

describe("refundHistoryMatches", () => {
  const refund = (id: string, amount: number, status = "succeeded", payment_id = "pay_abc123") => ({
    id, type: "refund" as const, attributes: { amount, status, payment_id, reason: null },
  });

  it("matches active refunds by reference and centavo amount, ignoring failed refunds", () => {
    expect(refundHistoryMatches(
      [refund("ref_one", 25000), refund("ref_two", 10000, "processing"), refund("ref_failed", 5000, "failed")],
      [{ provider_ref: "ref_one", amount: 250 }, { provider_ref: "ref_two", amount: "100.00" }],
      "pay_abc123",
    )).toBe(true);
    expect(refundHistoryMatches([], [], "pay_abc123")).toBe(true);
  });

  it("rejects an unrecorded provider refund, changed amount, or unmatched ledger entry", () => {
    expect(refundHistoryMatches([refund("ref_external", 60000)], [], "pay_abc123")).toBe(false);
    expect(refundHistoryMatches([refund("ref_one", 60000)], [{ provider_ref: "ref_one", amount: 599 }], "pay_abc123")).toBe(false);
    expect(refundHistoryMatches([], [{ provider_ref: "ref_one", amount: 600 }], "pay_abc123")).toBe(false);
    expect(refundHistoryMatches([refund("ref_one", 60000, "failed")], [{ provider_ref: "ref_one", amount: 600 }], "pay_abc123")).toBe(false);
  });

  it("fails closed for unknown statuses or refunds for another payment", () => {
    expect(refundHistoryMatches([refund("ref_one", 100, "unknown")], [], "pay_abc123")).toBe(false);
    expect(refundHistoryMatches([refund("ref_one", 100, "succeeded", "pay_other")], [], "pay_abc123")).toBe(false);
  });
});
