import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CalendarMonth } from "@/lib/tours/events-calendar";
import { monthRangeUtc, type LedgerRow } from "@/lib/tours/ledger";
import { getAuthenticatedSession, getAuthUser } from "@/lib/tours/server-auth";

export type LedgerLoadResult =
  | { ok: true; rows: LedgerRow[]; businessName: string }
  | { ok: false; reason: "signed_out" | "not_operator" | "error" };

type PaymentQueryRow = {
  id: string;
  amount: number;
  payment_method: string;
  provider: string | null;
  provider_method: string | null;
  payment_status: string;
  reference_number: string | null;
  payment_date: string | null;
  notes: string | null;
  tours_bookings: {
    booking_reference: string;
    contact_name: string;
    tours_packages: { title: string; operator_id: string } | { title: string; operator_id: string }[] | null;
  } | null;
};

/** Payments for the signed-in approved operator's bookings in one Manila month. */
export async function loadOperatorLedger(month: CalendarMonth): Promise<LedgerLoadResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, reason: "signed_out" };

  // The role check and the operator row both need only the user, so they run
  // together (the role is cached, so the page's header reuses it too).
  const supabase = await createSupabaseServerClient();
  const [session, { data: operator }] = await Promise.all([
    getAuthenticatedSession(),
    supabase
      .from("tours_operators")
      .select("id, business_name, accreditation_status")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);
  if (session.role !== "operator") return { ok: false, reason: "not_operator" };
  if (!operator || operator.accreditation_status !== "approved") return { ok: false, reason: "not_operator" };

  const range = monthRangeUtc(month);
  // RLS already limits rows to this operator's bookings; the inner joins and
  // operator filter make that explicit.
  const { data, error } = await supabase
    .from("tours_payments")
    .select(
      "id, amount, payment_method, provider, provider_method, payment_status, reference_number, payment_date, notes, tours_bookings!inner ( booking_reference, contact_name, tours_packages!inner ( title, operator_id ) )",
    )
    .eq("tours_bookings.tours_packages.operator_id", operator.id)
    .gte("payment_date", range.startIso)
    .lt("payment_date", range.endIso)
    .order("payment_date", { ascending: false });

  if (error) {
    console.error("Ledger load error:", error);
    return { ok: false, reason: "error" };
  }

  const rows: LedgerRow[] = ((data ?? []) as unknown as PaymentQueryRow[]).map((payment) => {
    const booking = payment.tours_bookings;
    const pkg = Array.isArray(booking?.tours_packages) ? booking?.tours_packages[0] : booking?.tours_packages;
    return {
      id: payment.id,
      amount: payment.amount,
      payment_method: payment.payment_method,
      provider: payment.provider,
      provider_method: payment.provider_method,
      payment_status: payment.payment_status,
      reference_number: payment.reference_number,
      payment_date: payment.payment_date,
      notes: payment.notes,
      booking_reference: booking?.booking_reference ?? "",
      tourist_name: booking?.contact_name ?? "",
      package_title: pkg?.title ?? "",
    };
  });

  return { ok: true, rows, businessName: operator.business_name ?? "Operator" };
}
