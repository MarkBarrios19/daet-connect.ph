import { hasTicket } from "@/lib/tours/ticket";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { formatPeso } from "@/lib/money";
import { centavosToPesos } from "@/lib/paymongo/checkout";
import { checkoutCookieName, confirmBookingReturn } from "@/lib/paymongo/return";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { RefreshUntilPaid } from "./refresh-until-paid";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const METHOD_LABELS: Record<string, string> = { gcash: "GCash", paymaya: "Maya", card: "Card", grab_pay: "GrabPay", qrph: "QR Ph" };

/**
 * Where PayMongo sends the tourist after paying. Confirms the payment with
 * PayMongo, records it (the webhook does the same; whichever is first wins),
 * then shows a clear receipt-style confirmation.
 */
export default async function PaymentSuccessPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to view bookings.</Notice>
      </PageFrame>
    );
  }
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/bookings/${id}/paid`)}`);

  const { data: owned } = await supabase.from("tours_bookings").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!owned) notFound();

  const check = await confirmBookingReturn(id, (await cookies()).get(checkoutCookieName(id))?.value);

  // Read after recording, so the totals include this payment.
  const [{ data: booking }, { data: lastPayment }] = await Promise.all([
    supabase
      .from("tours_bookings")
      .select("id, booking_reference, tour_date, number_of_pax, total_amount, total_paid, payment_status, status, tours_packages ( title )")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("tours_payments")
      .select("amount, provider_method, payment_date, created_at")
      .eq("booking_id", id)
      .eq("provider", "paymongo")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!booking) notFound();
  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;

  // Paid if PayMongo says so now, or a PayMongo payment landed in the last 2 hours (e.g. by webhook).
  const recentPayment = lastPayment && Date.now() - new Date(lastPayment.created_at).getTime() < 2 * 60 * 60 * 1000 ? lastPayment : null;
  const paid = check.status === "paid" || Boolean(recentPayment);
  const amount = check.status === "paid" ? centavosToPesos(check.amountCentavos) : Number(recentPayment?.amount ?? 0);
  const methodKey = check.status === "paid" ? check.method : (recentPayment?.provider_method ?? null);
  const method = methodKey ? (METHOD_LABELS[methodKey] ?? methodKey) : null;
  const balance = Math.max(0, Number(booking.total_amount) - Number(booking.total_paid ?? 0));
  const tourDate = new Date(`${booking.tour_date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <PageFrame>
      <div className="mx-auto max-w-xl">
        {paid ? (
          <section aria-labelledby="paid-title" className="rounded-2xl card-edge bg-surface p-6 text-center sm:p-8">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-500 text-slate-950 dark:bg-green-500/20 dark:text-green-300">
              <LineIcon name="check" className="h-8 w-8" />
            </div>
            <h1 id="paid-title" className="display-2 mt-4 text-daet-ink">
              Payment successful
            </h1>
            <p className="mt-2 text-daet-ink/80">
              {amount > 0 ? `${formatPeso(amount)} ` : ""}received{method ? ` via ${method}` : ""}. PayMongo also emailed you a receipt.
            </p>
            {check.status === "paid" && check.recordFailed ? (
              <Notice variant="info" className="mt-4 text-left">
                PayMongo confirmed your payment. It can take a few minutes to show on your booking; you don&apos;t need to pay again.
              </Notice>
            ) : null}
            <dl className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-4 text-left text-sm">
              <div className="col-span-2 min-w-0">
                <dt className="text-daet-ink/70">Tour</dt>
                <dd className="font-bold text-daet-ink">{pkg?.title ?? "Your tour"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-daet-ink/70">Date</dt>
                <dd className="font-bold text-daet-ink">{tourDate}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-daet-ink/70">Reference</dt>
                <dd className="break-words font-bold text-daet-ink">{booking.booking_reference}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-daet-ink/70">Paid so far</dt>
                <dd className="font-bold text-daet-ink">{formatPeso(Number(booking.total_paid ?? 0))}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-daet-ink/70">Balance</dt>
                <dd className="font-bold text-daet-ink">{balance > 0 ? formatPeso(balance) : "Fully paid"}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {hasTicket(booking) && booking.status === "confirmed" ? <ButtonLink href={`/tours/bookings/${id}/ticket`}>Show my ticket QR</ButtonLink> : null}
              <ButtonLink href={`/tours/bookings/${id}`} variant="secondary">
                View booking
              </ButtonLink>
            </div>
          </section>
        ) : check.status === "unpaid" ? (
          <section aria-labelledby="unpaid-title" className="rounded-2xl card-edge bg-surface p-6 sm:p-8">
            <h1 id="unpaid-title" className="display-2 text-daet-ink">
              Payment not completed
            </h1>
            <p className="mt-2 text-daet-ink/80">PayMongo hasn&apos;t received this payment. If you were charged, it will show up here within a few minutes.</p>
            <RefreshUntilPaid />
            <div className="mt-6 flex flex-wrap gap-2">
              <ButtonLink href={`/tours/bookings/${id}#payment`}>Try paying again</ButtonLink>
              <ButtonLink href={`/tours/bookings/${id}`} variant="secondary">
                Back to booking
              </ButtonLink>
            </div>
          </section>
        ) : (
          <section aria-labelledby="pending-title" className="rounded-2xl card-edge bg-surface p-6 sm:p-8">
            <h1 id="pending-title" className="display-2 text-daet-ink">
              Confirming your payment
            </h1>
            <p className="mt-2 text-daet-ink/80">
              Thanks! We&apos;re waiting for PayMongo to confirm the payment for {booking.booking_reference}. This usually takes a few seconds.
            </p>
            <RefreshUntilPaid />
            <p className="mt-6">
              <Link href={`/tours/bookings/${id}`} className="font-bold text-blue-700 underline dark:text-blue-300">
                Back to booking
              </Link>
            </p>
          </section>
        )}
      </div>
    </PageFrame>
  );
}
