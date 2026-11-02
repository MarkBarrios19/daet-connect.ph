import { hasTicket } from "@/lib/tours/ticket";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import Image from "next/image";
import Link from "next/link";
import { PHOTOS } from "@/lib/photo-credits";
import { placePhoto } from "@/lib/tours/trip-board";
import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { PushOptIn } from "@/components/tours/push-opt-in";
import { checkPayable, remainingBalance } from "@/lib/paymongo/checkout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { balanceOf, sourceLabel, TOURS_REWARD_RULES, type LedgerEntry } from "@/lib/rewards";

export const dynamic = "force-dynamic";
export const metadata = { title: "My trips" };

const PAYMENT: Record<string, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Unpaid", tone: "warning" },
  partial: { label: "Partially paid", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
};
const peso = formatPeso;
const longDate = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" });

type BookingRow = {
  id: string;
  booking_reference: string;
  tour_date: string;
  status: string;
  number_of_pax: number;
  total_amount: number;
  total_paid: number | null;
  payment_status: string | null;
  tours_packages: { title: string; location_name: string } | { title: string; location_name: string }[] | null;
};

export default async function TouristDashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to see your trips.</Notice>
      </PageFrame>
    );
  }
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/me")}`);
  // Staff have their own dashboards.
  if (session.role && session.role !== "tourist") redirect(session.role === "admin" ? "/tours/admin" : "/dashboard");

  const supabase = await createSupabaseServerClient();
  const today = toManilaDateKey(new Date());
  const [{ data: bookingRows }, { data: itineraries }, { data: inbox }, { data: profile }, { data: balanceRow }, { data: ledgerRows }] = await Promise.all([
    supabase
      .from("tours_bookings")
      .select("id, booking_reference, tour_date, status, number_of_pax, total_amount, total_paid, payment_status, tours_packages ( title, location_name )")
      .eq("user_id", session.user.id)
      .order("tour_date", { ascending: true })
      .limit(200),
    supabase
      .from("tours_itineraries")
      .select("id, title, start_date, end_date, tours_itinerary_items ( id )")
      .eq("tourist_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.rpc("tours_inbox"),
    supabase.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle(),
    supabase.from("rewards_balances").select("balance, earned").eq("profile_id", session.user.id).maybeSingle(),
    supabase
      .from("rewards_ledger")
      .select("id, points, source, description, created_at")
      .eq("profile_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const recentPoints = (ledgerRows ?? []) as LedgerEntry[];
  const points = balanceRow?.balance ?? balanceOf(recentPoints);

  const bookings = (bookingRows ?? []) as unknown as BookingRow[];
  const upcoming = bookings.filter((b) => (b.status === "pending" || b.status === "confirmed") && b.tour_date >= today);
  const completed = bookings.filter((b) => b.status === "completed");
  const { data: reviewed } = completed.length
    ? await supabase.from("tours_reviews").select("booking_id").in("booking_id", completed.map((b) => b.id))
    : { data: [] as { booking_id: string }[] };
  const reviewedIds = new Set((reviewed ?? []).map((r) => r.booking_id));
  const toReview = completed.filter((b) => !reviewedIds.has(b.id)).reverse().slice(0, 3);
  const unreadChats = ((inbox ?? []) as Array<{ unread: number }>).reduce((sum, row) => sum + Number(row.unread ?? 0), 0);
  const firstName = profile?.full_name?.split(" ")[0];
  const pkgOf = (b: BookingRow) => (Array.isArray(b.tours_packages) ? b.tours_packages[0] : b.tours_packages);

  const [next, ...rest] = upcoming;

  return (
    <PageFrame credits={next ? [placePhoto(pkgOf(next)?.title, pkgOf(next)?.location_name)] : []}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display-2 text-daet-ink">{firstName ? `Mabuhay, ${firstName}!` : "Mabuhay!"}</h1>
          <p className="mt-1 text-lg text-daet-ink">
            {upcoming.length ? `You have ${upcoming.length} upcoming trip${upcoming.length === 1 ? "" : "s"}.` : "Your trips, tickets and points, in one place."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/tours/browse">Find a trip</ButtonLink>
          <ButtonLink href="/tours/plan" variant="secondary">Plan a trip</ButtonLink>
        </div>
      </div>

      {next ? (
        <section aria-labelledby="next-trip" className="mb-6 grid overflow-hidden rounded-2xl card-edge bg-surface md:grid-cols-[1.2fr_1fr]">
          <div className="bg-blue-600 p-5 text-white sm:p-8">
            <p className="font-semibold">{next.tour_date === today ? "Today" : "Your next trip"}</p>
            <h2 id="next-trip" className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight sm:text-4xl">
              {pkgOf(next)?.title ?? "Tour"}
            </h2>
            <p className="mt-2 text-lg">{longDate(next.tour_date)}</p>
            <p className="text-blue-50">
              {next.number_of_pax} guest{next.number_of_pax === 1 ? "" : "s"}
              {pkgOf(next)?.location_name ? ` · ${pkgOf(next)?.location_name}` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {hasTicket(next) ? (
                <ButtonLink href={`/tours/bookings/${next.id}/ticket`} variant="inverse">
                  Show ticket QR
                </ButtonLink>
              ) : null}
              {checkPayable(next).ok && remainingBalance(next) > 0 ? (
                // On the blue panel the main button is white; a blue one would vanish.
                <ButtonLink href={`/tours/bookings/${next.id}#payment`} variant="inverse">
                  Pay {peso(remainingBalance(next))}
                </ButtonLink>
              ) : null}
              <ButtonLink href={`/tours/bookings/${next.id}`} variant="onBlue">
                Details
              </ButtonLink>
            </div>
          </div>
          <div className="relative min-h-48">
            <Image src={PHOTOS[placePhoto(pkgOf(next)?.title, pkgOf(next)?.location_name)].src} alt="" fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" priority />
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={next ? "Also coming up" : "Upcoming trips"} action={<Link href="/tours/my-bookings" className="inline-flex min-h-11 items-center font-bold text-blue-700 dark:text-blue-300 hover:underline">All bookings</Link>} />
            {upcoming.length === 0 ? (
              <EmptyState className="px-0 py-4" icon={<LineIcon name="boat" />} title="No upcoming trips" description="Book a trip and it will show up here with your ticket." action={<ButtonLink href="/tours/browse">Find a trip</ButtonLink>} />
            ) : rest.length === 0 ? (
              <p className="text-daet-ink/80">Nothing else booked yet. <Link href="/tours/browse" className="font-bold text-blue-700 dark:text-blue-300 underline">Find another trip</Link></p>
            ) : (
              <ul className="space-y-2">
                {rest.map((b) => {
                  const pkg = pkgOf(b);
                  const pay = PAYMENT[b.payment_status ?? "unpaid"] ?? PAYMENT.unpaid;
                  const balance = remainingBalance(b);
                  const payable = checkPayable(b).ok;
                  return (
                    <li key={b.id} className="rounded-2xl bg-canvas p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/tours/bookings/${b.id}`} className="text-lg font-bold text-daet-ink hover:underline">
                            {pkg?.title ?? "Tour"}
                          </Link>
                          <p className="text-daet-ink/80">
                            {b.tour_date === today ? <strong className="text-blue-700 dark:text-blue-300">Today</strong> : longDate(b.tour_date)} · {b.number_of_pax} guest{b.number_of_pax === 1 ? "" : "s"} · {pkg?.location_name}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {b.status === "confirmed" ? (
                            <Badge tone="success">Confirmed</Badge>
                          ) : (
                            <Badge tone="neutral">
                              <LineIcon name="clock" className="h-3.5 w-3.5" /> Waiting for operator
                            </Badge>
                          )}
                          {/* Nothing to pay until the operator confirms, so no payment chip yet. */}
                          {b.status === "confirmed" ? <Badge tone={pay.tone}>{pay.label}</Badge> : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {hasTicket(b) ? (
                          <ButtonLink href={`/tours/bookings/${b.id}/ticket`} size="md">
                            Show ticket QR
                          </ButtonLink>
                        ) : null}
                        {payable && balance > 0 ? (
                          <ButtonLink href={`/tours/bookings/${b.id}#payment`} variant="primary">
                            Pay {peso(balance)}
                          </ButtonLink>
                        ) : null}
                        <ButtonLink href={`/tours/bookings/${b.id}`} variant="ghost">
                          Details
                        </ButtonLink>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {toReview.length > 0 ? (
            <Card>
              <CardHeader title="Rate your recent tours" />
              <ul className="space-y-3">
                {toReview.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-canvas p-4">
                    <span className="min-w-0">
                      <span className="block font-bold text-daet-ink">{pkgOf(b)?.title ?? "Tour"}</span>
                      <span className="text-sm text-daet-ink/80">{longDate(b.tour_date)}</span>
                    </span>
                    <ButtonLink href={`/tours/bookings/${b.id}#review`} variant="secondary">
                      Write a review
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card id="rewards" className="scroll-mt-6">
            <CardHeader title="Your points" />
            <p className="font-[family-name:var(--font-display)] text-5xl font-semibold text-daet-ink">
              {points.toLocaleString("en-PH")}
              <span className="ml-2 font-sans text-base font-bold text-daet-ink/75">points</span>
            </p>
            {recentPoints.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {recentPoints.map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-daet-ink/75" title={entry.description ?? undefined}>
                      {sourceLabel(entry.source)}
                    </span>
                    <span className={`shrink-0 font-bold ${entry.points > 0 ? "text-daet-forest dark:text-blue-300" : "text-red-700 dark:text-red-300"}`}>
                      {entry.points > 0 ? "+" : "−"}
                      {Math.abs(entry.points)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <details className="mt-3 text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-blue-700 dark:text-blue-300">How to earn points</summary>
              <ul className="mt-2 space-y-1 text-daet-ink/70">
                {TOURS_REWARD_RULES.map((rule) => (
                  <li key={rule.source} className="flex justify-between gap-2">
                    <span>{rule.label}</span>
                    <span className="shrink-0 font-bold text-daet-ink">+{rule.points}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Points for a payment are removed if it is refunded.</p>
            </details>
          </Card>

          <Card>
            <CardHeader title="Messages" />
            <p className="text-daet-ink">
              {unreadChats > 0 ? (
                <>
                  You have <strong className="text-daet-ink">{unreadChats} unread</strong> message{unreadChats === 1 ? "" : "s"} from operators and guides.
                </>
              ) : (
                "No unread messages."
              )}
            </p>
            <ButtonLink href="/tours/messages" variant="secondary" className="mt-3">
              Open inbox
            </ButtonLink>
          </Card>

          <Card>
            <CardHeader title="Saved trip plans" action={<Link href="/tours/my-itineraries" className="inline-flex min-h-11 items-center font-bold text-blue-700 dark:text-blue-300 hover:underline">All plans</Link>} />
            {(itineraries ?? []).length === 0 ? (
              <p className="text-sm text-daet-ink/70">
                Plan a trip around Daet and save it here. <Link href="/tours/plan" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 underline">Start planning</Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {(itineraries ?? []).map((it) => (
                  <li key={it.id}>
                    <Link href={`/tours/my-itineraries/${it.id}`} className="block rounded-2xl p-3 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                      <span className="block font-bold text-daet-ink">{it.title}</span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {it.start_date ? longDate(it.start_date) : "No date"} · {it.tours_itinerary_items?.length ?? 0} stops
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <PushOptIn variant="prompt" />
        </div>
      </div>
    </PageFrame>
  );
}
