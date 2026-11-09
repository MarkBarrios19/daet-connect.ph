import { buildSignatureHeader } from "@/lib/paymongo/signature";
import type { RefundResource } from "@/lib/paymongo/refunds";
import { ledgerRowsFromSession, processPaymongoWebhook, type LedgerInsert, type WebhookStore } from "@/lib/paymongo/webhook";

const SECRET = "whsk_test_secret";
const NOW = new Date("2026-10-23T10:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);
const BOOKING_ID = "e9466de5-4877-47c1-ac14-d86deeb38b9e";

function paidEvent(overrides: { id?: string; type?: string; livemode?: boolean; sessionId?: string } = {}) {
  return JSON.stringify({
    data: {
      id: overrides.id ?? "evt_1",
      type: "event",
      attributes: {
        type: overrides.type ?? "checkout_session.payment.paid",
        livemode: overrides.livemode ?? false,
        // The webhook body may claim anything; the handler trusts the re-fetched session.
        data: { id: overrides.sessionId ?? "cs_1", type: "checkout_session", attributes: { payments: [{ id: "pay_FAKE", attributes: { status: "paid", amount: 999999999 } }] } },
      },
    },
  });
}

function apiSession(payments: Array<{ id: string; amount: number; status?: string }>, bookingId = BOOKING_ID) {
  return {
    id: "cs_1",
    type: "checkout_session",
    attributes: {
      reference_number: "BK-20261023-ABC123",
      metadata: { booking_id: bookingId },
      payments: payments.map((p) => ({ id: p.id, type: "payment", attributes: { amount: p.amount, status: p.status ?? "paid", paid_at: T, source: { type: "gcash" } } })),
    },
  };
}

class MemoryStore implements WebhookStore {
  events = new Map<string, { processed: boolean; outcome?: string; bookingId?: string | null }>();
  ledger: LedgerInsert[] = [];
  bookings = new Set([BOOKING_ID]);

  async recordEvent(event: { id: string }) {
    const existing = this.events.get(event.id);
    if (!existing) this.events.set(event.id, { processed: false });
    return { alreadyProcessed: existing?.processed ?? false };
  }
  async bookingExists(id: string) {
    return this.bookings.has(id);
  }
  async insertPayments(rows: LedgerInsert[]) {
    let inserted = 0;
    for (const row of rows) {
      if (this.ledger.some((r) => r.provider === row.provider && r.provider_ref === row.provider_ref)) continue;
      this.ledger.push(row);
      inserted++;
    }
    return inserted;
  }
  reconcileRefund = jest.fn(async (_refund: RefundResource) => {});
  async markProcessed(id: string, outcome: string, bookingId: string | null) {
    this.events.set(id, { processed: true, outcome, bookingId });
  }
}

function setup(session: unknown = apiSession([{ id: "pay_1", amount: 137800 }])) {
  const store = new MemoryStore();
  const retrieveSession = jest.fn().mockResolvedValue(session);
  const deliver = (rawBody: string, header = buildSignatureHeader(SECRET, T, rawBody, "test")) =>
    processPaymongoWebhook(
      { rawBody, signatureHeader: header },
      { webhookSecret: SECRET, mode: "test", retrieveSession, store, now: NOW },
    );
  return { store, retrieveSession, deliver };
}

describe("processPaymongoWebhook", () => {
  it("records the paid amount from the re-fetched session, not the webhook body", async () => {
    const { store, retrieveSession, deliver } = setup();
    const result = await deliver(paidEvent());

    expect(result.status).toBe(200);
    expect(retrieveSession).toHaveBeenCalledWith("cs_1");
    expect(store.ledger).toEqual([
      expect.objectContaining({
        booking_id: BOOKING_ID,
        amount: 1378,
        payment_method: "gcash",
        payment_status: "completed",
        provider: "paymongo",
        provider_ref: "pay_1",
        reference_number: "BK-20261023-ABC123",
      }),
    ]);
    expect(store.ledger.some((row) => row.provider_ref === "pay_FAKE")).toBe(false);
    expect(store.events.get("evt_1")).toEqual({ processed: true, outcome: "recorded 1/1", bookingId: BOOKING_ID });
  });

  it("rejects forged and unsigned deliveries without touching the store", async () => {
    const { store, retrieveSession, deliver } = setup();
    const body = paidEvent();
    expect((await deliver(body, buildSignatureHeader("attacker", T, body, "test"))).status).toBe(401);
    expect((await deliver(body, ""))).toMatchObject({ status: 401 });
    expect(store.events.size).toBe(0);
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it("rejects replayed (old) deliveries", async () => {
    const { deliver } = setup();
    const body = paidEvent();
    expect((await deliver(body, buildSignatureHeader(SECRET, T - 3600, body, "test"))).status).toBe(401);
  });

  it("processes a redelivered event only once", async () => {
    const { store, retrieveSession, deliver } = setup();
    await deliver(paidEvent());
    const second = await deliver(paidEvent());
    expect(second.body.message).toBe("Duplicate event");
    expect(store.ledger).toHaveLength(1);
    expect(retrieveSession).toHaveBeenCalledTimes(1);
  });

  it("never double-records a payment that arrives in two different events", async () => {
    const { store, deliver } = setup();
    await deliver(paidEvent({ id: "evt_1" }));
    const second = await deliver(paidEvent({ id: "evt_2" }));
    expect(second.status).toBe(200);
    expect(store.ledger).toHaveLength(1);
    expect(store.events.get("evt_2")?.outcome).toBe("recorded 0/1");
  });

  it("retries after a transient failure (event left unprocessed)", async () => {
    const { store, retrieveSession, deliver } = setup();
    retrieveSession.mockRejectedValueOnce(new Error("PayMongo down"));
    await expect(deliver(paidEvent())).rejects.toThrow("PayMongo down");
    expect(store.events.get("evt_1")).toEqual({ processed: false });

    const retry = await deliver(paidEvent());
    expect(retry.status).toBe(200);
    expect(store.ledger).toHaveLength(1);
  });

  it("ignores other event types and events from the other mode", async () => {
    const { store, retrieveSession, deliver } = setup();
    expect((await deliver(paidEvent({ type: "payment.failed" }))).body.message).toBe("Ignored payment.failed");
    expect((await deliver(paidEvent({ id: "evt_live", livemode: true }))).status).toBe(200);
    expect(store.events.has("evt_live")).toBe(false);
    expect(retrieveSession).not.toHaveBeenCalled();
    expect(store.ledger).toHaveLength(0);
  });

  it("does not record payments for sessions without a known booking", async () => {
    const { store, deliver } = setup(apiSession([{ id: "pay_1", amount: 100 }], "00000000-0000-4000-8000-000000000000"));
    const result = await deliver(paidEvent());
    expect(result.status).toBe(200);
    expect(store.ledger).toHaveLength(0);
    expect(store.events.get("evt_1")?.outcome).toBe("unknown_booking");
  });

  it("skips unpaid payments", async () => {
    const { store, deliver } = setup(apiSession([{ id: "pay_1", amount: 100, status: "failed" }]));
    await deliver(paidEvent());
    expect(store.ledger).toHaveLength(0);
    expect(store.events.get("evt_1")?.outcome).toBe("no_paid_payments");
  });

  it("rejects non-JSON and non-event bodies", async () => {
    const { deliver } = setup();
    expect((await deliver("not json")).status).toBe(400);
    expect((await deliver(JSON.stringify({ hello: "world" }))).status).toBe(400);
  });
});

describe("ledgerRowsFromSession", () => {
  const BOOKING = "e9466de5-4877-47c1-ac14-d86deeb38b9e";
  it("turns each paid payment into one ledger row with the booking reference", () => {
    const session = {
      id: "cs_abc",
      attributes: {
        reference_number: "BK-20261031-DEMOLT",
        metadata: { booking_id: BOOKING },
        payments: [
          { id: "pay_1", attributes: { status: "paid", amount: 300000, paid_at: 1793425800, source: { type: "gcash" } } },
          { id: "pay_2", attributes: { status: "failed", amount: 300000 } },
        ],
      },
    };
    const rows = ledgerRowsFromSession({ session, sessionId: "cs_abc", bookingId: BOOKING, now: new Date("2026-10-31T05:50:00Z"), rawEvent: (id) => ({ source: "return", payment_id: id }) });
    expect(rows).toEqual([
      expect.objectContaining({
        booking_id: BOOKING,
        amount: 3000,
        payment_method: "gcash",
        provider: "paymongo",
        provider_ref: "pay_1",
        reference_number: "BK-20261031-DEMOLT",
        notes: "PayMongo checkout cs_abc",
        raw_event: { source: "return", payment_id: "pay_1" },
      }),
    ]);
  });
});


it("refund events re-fetch authoritative status and process redelivery once", async () => {
  const store = new MemoryStore();
  const apiRefund: RefundResource = { id: "ref_1", type: "refund", attributes: { payment_id: "pay_1", amount: 100, status: "succeeded", reason: null } };
  const retrieveRefund = jest.fn().mockResolvedValue(apiRefund);
  const body = JSON.stringify({ data: { id: "evt_ref", attributes: { type: "payment.refund.updated", livemode: false, data: { id: "ref_1", type: "refund", attributes: { status: "failed" } } } } });
  const deps = { webhookSecret: SECRET, mode: "test" as const, retrieveSession: jest.fn(), retrieveRefund, store, now: NOW };
  const request = { rawBody: body, signatureHeader: buildSignatureHeader(SECRET, T, body, "test") };
  expect((await processPaymongoWebhook(request, deps)).status).toBe(200);
  expect(store.reconcileRefund).toHaveBeenCalledWith(apiRefund);
  expect((await processPaymongoWebhook(request, deps)).body.message).toBe("Duplicate event");
  expect(retrieveRefund).toHaveBeenCalledTimes(1);
});

it("a refund webhook lookup failure leaves the event retryable", async () => {
  const store = new MemoryStore();
  const body = JSON.stringify({ data: { id: "evt_ref", attributes: { type: "payment.refund.updated", livemode: false, data: { id: "ref_1", type: "refund" } } } });
  const deps = { webhookSecret: SECRET, mode: "test" as const, retrieveSession: jest.fn(), retrieveRefund: jest.fn().mockRejectedValue(new Error("offline")), store, now: NOW };
  await expect(processPaymongoWebhook({ rawBody: body, signatureHeader: buildSignatureHeader(SECRET, T, body, "test") }, deps)).rejects.toThrow("offline");
  expect(store.events.get("evt_ref")?.processed).toBe(false);
});
