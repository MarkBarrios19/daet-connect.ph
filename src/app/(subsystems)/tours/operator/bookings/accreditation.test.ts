import { assignGuideToBooking, updateBookingStatus } from "./actions";
import { getProofViewUrl, recordPayment, reviewPaymentProof } from "./payment-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { emailGuideAssigned, emailPaymentReceived } from "@/lib/email/notify-booking";

jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/email/notify-booking", () => ({ emailGuideAssigned: jest.fn(), emailBookingConfirmed: jest.fn(), emailTripCalledOff: jest.fn(), emailPaymentReceived: jest.fn() }));

const id = "46f8a59e-3d31-4508-86a8-d2b8919eec31";
const payment = { bookingId: id, amount: 10, paymentMethod: "cash", referenceNumber: null, paymentDate: "2026-11-01", notes: null };

function client(status: string, owner = "operator-1", updateVisible = true) {
  const queries: Record<string, any> = {};
  const rows: Record<string, any> = {
    tours_operators: { id: "operator-1", accreditation_status: status },
    tours_bookings: { id, status: "pending", tour_date: "2099-01-01", total_paid: 0, total_amount: 100, tours_packages: { operator_id: owner, tours_operators: { id: owner, profile_id: "user-1" } } },
    tours_guides: { id, accreditation_status: "approved" },
    tours_payment_proofs: { id, booking_id: id, amount: 10, payment_method: "gcash", verification_status: "pending", proof_image_url: `${id}/proof.png`, tours_bookings: { total_amount: 100, total_paid: 0, tours_packages: { operator_id: owner } } },
  };
  const from = jest.fn((table: string) => {
    const q: any = {};
    for (const method of ["select", "eq", "update", "insert"]) q[method] = jest.fn().mockReturnValue(q);
    q.maybeSingle = jest.fn(async () => ({ data: q.update.mock.calls.length ? (updateVisible ? { id } : null) : rows[table], error: null }));
    q.single = jest.fn(async () => ({ data: rows[table], error: null }));
    // inserts without a trailing select are thenable PostgREST builders
    q.then = (resolve: (value: unknown) => void) => resolve({ error: null });
    (queries[table] ??= []).push(q);
    return q;
  });
  const createSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: "url" }, error: null });
  const supabase = { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) }, from, storage: { from: jest.fn(() => ({ createSignedUrl })) } };
  (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabase);
  return { from, queries, createSignedUrl };
}

function proofForm() { const f = new FormData(); f.set("proofId", id); f.set("decision", "approve"); return f; }

describe("operator booking action accreditation", () => {
  it.each(["pending", "rejected"])("rejects %s before reading bookings or proofs", async (status) => {
    const c = client(status);
    expect((await assignGuideToBooking(id, id)).success).toBe(false);
    expect((await updateBookingStatus(id, "confirmed")).success).toBe(false);
    expect((await recordPayment(payment)).success).toBe(false);
    expect((await reviewPaymentProof(proofForm())).success).toBe(false);
    expect((await getProofViewUrl(id)).error).toBeTruthy();
    expect(c.from.mock.calls.every(([table]) => table === "tours_operators")).toBe(true);
    expect(c.createSignedUrl).not.toHaveBeenCalled();
  });

  it("allows an approved owner to assign a guide and record a payment", async () => {
    const c = client("approved");
    expect((await assignGuideToBooking(id, id)).success).toBe(true);
    expect((await recordPayment(payment)).success).toBe(true);
    expect(c.queries.tours_payments[0].insert).toHaveBeenCalled();
    expect(emailGuideAssigned).toHaveBeenCalled();
    expect(emailPaymentReceived).toHaveBeenCalled();
  });

  it("does not use other access to a booking or proof as operator ownership", async () => {
    const c = client("approved", "other-operator");
    expect((await assignGuideToBooking(id, id)).success).toBe(false);
    expect((await recordPayment(payment)).success).toBe(false);
    expect((await reviewPaymentProof(proofForm())).success).toBe(false);
    expect((await getProofViewUrl(id)).error).toBeTruthy();
    expect(c.queries.tours_payments).toBeUndefined();
    expect(c.createSignedUrl).not.toHaveBeenCalled();
  });

  it("reports failure if accreditation is revoked before the update", async () => {
    client("approved", "operator-1", false);
    expect((await assignGuideToBooking(id, id)).success).toBe(false);
    expect((await updateBookingStatus(id, "confirmed")).success).toBe(false);
    expect(emailGuideAssigned).not.toHaveBeenCalled();
  });
});
