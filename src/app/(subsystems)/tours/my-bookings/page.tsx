import { hasTicket } from "@/lib/tours/ticket";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { formatPeso } from "@/lib/money";
import { PHOTOS } from "@/lib/photo-credits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { placePhoto } from "@/lib/tours/trip-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "My bookings" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting for operator", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "success" },
  completed: { label: "Completed", tone: "info" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  rejected: { label: "Declined", tone: "danger" },
};

const PAYMENT: Record<string, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Unpaid", tone: "warning" },
  partial: { label: "Partially paid", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
};

type Pkg = { id: string; title: string; location_name: string | null; cover_image_url: string | null };
type Row = {
  id: string;
  booking_reference: string;
  tour_date: string;
  status: string;
  number_of_pax: number;
  total_amount: number;
  payment_status: string | null;
  tours_packages: Pkg | Pkg[] | null;
};

const longDate = (key: string) =>
  new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export default async function MyBookingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view bookings.
        </Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/my-bookings")}`);

  const { data, error } = await supabase
    .from("tours_bookings")
    .select("id, booking_reference, tour_date, status, number_of_pax, total_amount, payment_status, tours_packages ( id, title, location_name, cover_image_url )")
    .eq("user_id", user.id)
    .order("tour_date", { ascending: true });
  if (error) console.error("Bookings fetch error:", error.message);

  const rows = (data ?? []) as Row[];
  const today = toManilaDateKey(new Date());
  const isActive = (b: Row) => (b.status === "pending" || b.status === "confirmed") && b.tour_date >= today;
  const upcoming = rows.filter(isActive);
  const past = rows.filter((b) => !isActive(b)).reverse();

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display-2 text-daet-ink">My bookings</h1>
            <p className="mt-2 text-lg text-daet-ink">
              {rows.length === 0 ? "Nothing booked yet." : `${upcoming.length} coming up, ${past.length} past or cancelled.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/tours/messages" variant="secondary">
              Messages
            </ButtonLink>
            <ButtonLink href="/tours/browse">Find a trip</ButtonLink>
          </div>
        </header>

        {error ? <Notice variant="error" className="mb-6">Your bookings could not be loaded right now. Please try again.</Notice> : null}

        {rows.length === 0 && !error ? (
          <EmptyState
            icon={<LineIcon name="calendar" />}
            title="No bookings yet"
            description="Choose a trip, pick a date, and it will show up here with your ticket and payment."
            action={<ButtonLink href="/tours/browse">Find a trip</ButtonLink>}
          />
        ) : null}

        {upcoming.length > 0 ? (
          <section aria-labelledby="upcoming" className="mb-10">
            <h2 id="upcoming" className="mb-4 text-2xl font-bold text-daet-ink">
              Coming up
            </h2>
            <ul className="space-y-3">
              {upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} today={today} />
              ))}
            </ul>
          </section>
        ) : null}

        {past.length > 0 ? (
          <section aria-labelledby="past">
            <h2 id="past" className="mb-4 text-2xl font-bold text-daet-ink">
              Past and cancelled
            </h2>
            <ul className="space-y-3">
              {past.map((b) => (
                <BookingRow key={b.id} booking={b} today={today} quiet />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PageFrame>
  );
}

function BookingRow({ booking: b, today, quiet = false }: { booking: Row; today: string; quiet?: boolean }) {
  const pkg = Array.isArray(b.tours_packages) ? b.tours_packages[0] : b.tours_packages;
  const status = STATUS[b.status] ?? { label: b.status, tone: "neutral" as const };
  const pay = PAYMENT[b.payment_status ?? "unpaid"] ?? PAYMENT.unpaid;
  const photo = PHOTOS[placePhoto(pkg?.title, pkg?.location_name)];
  const owes = b.status === "confirmed" && b.payment_status !== "paid" && b.payment_status !== "refunded";

  return (
    <li className="grid grid-cols-[88px_1fr] gap-4 rounded-2xl card-edge bg-surface p-3 sm:grid-cols-[160px_1fr] sm:p-4">
      <div className={`relative aspect-square overflow-hidden rounded-2xl bg-blue-100 dark:bg-blue-900/40 sm:aspect-[4/3] ${quiet ? "opacity-80" : ""}`}>
        {pkg?.cover_image_url ? (
          <img src={pkg.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Image src={photo.src} alt="" fill sizes="160px" className="object-cover" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={status.tone}>
            {b.status === "pending" ? <LineIcon name="clock" className="h-3.5 w-3.5" /> : null}
            {status.label}
          </Badge>
          {b.status === "confirmed" || b.status === "completed" ? <Badge tone={pay.tone}>{pay.label}</Badge> : null}
        </div>
        <Link href={`/tours/bookings/${b.id}`} className="mt-1 block text-lg font-bold leading-snug text-daet-ink hover:text-blue-700 dark:hover:text-blue-300 sm:text-xl">
          {pkg?.title ?? "Tour"}
        </Link>
        <p className="mt-1 text-daet-ink">
          {b.tour_date === today ? <strong className="text-blue-700 dark:text-blue-300">Today</strong> : longDate(b.tour_date)} · {b.number_of_pax} guest{b.number_of_pax === 1 ? "" : "s"}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ref {b.booking_reference} · {formatPeso(b.total_amount)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {owes ? (
            <ButtonLink href={`/tours/bookings/${b.id}#payment`} variant="primary">
              {b.payment_status === "partial" ? "Pay the balance" : "Pay now"}
            </ButtonLink>
          ) : null}
          {hasTicket(b) && b.status === "confirmed" ? (
            <ButtonLink href={`/tours/bookings/${b.id}/ticket`} variant="secondary">
              Ticket
            </ButtonLink>
          ) : null}
          <ButtonLink href={`/tours/bookings/${b.id}`} variant="ghost">
            Details
          </ButtonLink>
        </div>
      </div>
    </li>
  );
}
