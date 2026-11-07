import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { checkInAllowed, getQrSecret, verifyQrToken } from "@/lib/tours/qr-token";
import { TicketCheckInButton } from "./ticket-check-in-button";
import { getAuthUser } from "@/lib/tours/server-auth";

export const metadata: Metadata = { title: "Verify QR · CONNECT-Daet", robots: { index: false } };

type PageProps = { params: Promise<{ token: string }> };

const longDate = (value: string | number | Date) =>
  new Date(value).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });
const tourDate = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function ResultCard({ tone, title, children }: { tone: "valid" | "invalid" | "neutral"; title: string; children?: React.ReactNode }) {
  const styles = {
    valid: { box: "bg-green-50 dark:bg-green-950/40", icon: "bg-green-500 text-slate-950", mark: "✓", title: "text-green-950 dark:text-green-200" },
    invalid: { box: "bg-red-50 dark:bg-red-950/40", icon: "bg-red-600 text-white", mark: "✕", title: "text-red-950 dark:text-red-200" },
    neutral: { box: "bg-surface", icon: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300", mark: "i", title: "text-daet-ink" },
  }[tone];
  return (
    <section className={`mx-auto max-w-md rounded-2xl p-6 text-center sm:p-8 ${styles.box}`} aria-live="polite">
      <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full text-4xl font-bold ${styles.icon}`} aria-hidden="true">
        {styles.mark}
      </div>
      <h1 className={`display-2 mt-4 ${styles.title}`}>{title}</h1>
      {children ? <div className="mt-3 text-lg leading-relaxed text-daet-ink">{children}</div> : null}
    </section>
  );
}

export default async function VerifyQrPage({ params }: PageProps) {
  const { token: rawToken } = await params;
  const secret = getQrSecret();
  if (!isSupabaseConfigured() || !secret) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Verification is not available">
          QR verification is not set up on this site yet.
        </Notice>
      </PageFrame>
    );
  }

  const claims = verifyQrToken(decodeURIComponent(rawToken), secret);
  if (!claims.ok) {
    return (
      <PageFrame>
        <ResultCard tone="invalid" title={claims.reason === "expired" ? "Expired QR code" : "Not a valid QR code"}>
          {claims.reason === "expired"
            ? "This badge or ticket is no longer valid. Ask the holder for their current QR code."
            : "This code was not issued by CONNECT-Daet or has been altered. Do not accept it as proof of accreditation."}
        </ResultCard>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();

  if (claims.type === "guide") {
    const { data, error } = await supabase.rpc("tours_badge_lookup", { p_guide_id: claims.id });
    const badge = Array.isArray(data) ? data[0] : data;
    if (error || !badge) {
      return (
        <PageFrame>
          <Notice variant="error" title="Could not check this badge">Please try again in a moment.</Notice>
        </PageFrame>
      );
    }
    if (badge.status !== "approved") {
      return (
        <PageFrame>
          <ResultCard tone="invalid" title="Not currently accredited">
            This guide&apos;s accreditation is not active. Contact the Daet Tourism Office if you need help.
          </ResultCard>
        </PageFrame>
      );
    }
    return (
      <PageFrame>
        <ResultCard tone="valid" title="Accredited local guide">
          {badge.photo_url ? (
            <img
              src={badge.photo_url}
              alt={`Photo of ${badge.full_name}`}
              className="mx-auto mb-3 h-28 w-28 rounded-full border-4 border-white object-cover"
            />
          ) : null}
          <p className="text-xl font-bold text-daet-ink">{badge.full_name}</p>
          <p className="mt-1">Accredited by the Daet Tourism Office through CONNECT-Daet.</p>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Badge valid until {longDate(claims.exp * 1000)}</p>
        </ResultCard>
      </PageFrame>
    );
  }

  // Booking ticket: details only for the people running the tour.
  const user = await getAuthUser();
  const signInLink = (
    <Link href={`/login?next=${encodeURIComponent(`/tours/verify/${rawToken}`)}`} className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 underline">
      Sign in
    </Link>
  );
  if (!user) {
    return (
      <PageFrame>
        <ResultCard tone="neutral" title="CONNECT-Daet booking ticket">
          This is a genuine tour ticket. {signInLink} as the assigned guide to check the guests in.
        </ResultCard>
      </PageFrame>
    );
  }

  const { data: booking } = await supabase
    .from("tours_bookings")
    .select("id, user_id, booking_reference, status, payment_status, tour_date, number_of_pax, contact_name, assigned_guide_id, tours_packages ( title )")
    .eq("id", claims.id)
    .maybeSingle();
  if (!booking) {
    return (
      <PageFrame>
        <ResultCard tone="neutral" title="CONNECT-Daet booking ticket">
          This is a genuine tour ticket, but only the assigned guide or the operator can see its details.
        </ResultCard>
      </PageFrame>
    );
  }

  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;
  const { data: checkins } = await supabase.from("tours_checkins").select("participant_id, scanned_at").eq("booking_id", booking.id);
  const partyCheckIn = (checkins ?? []).find((row) => row.participant_id === null);
  const isTourist = booking.user_id === user.id;
  const rule = checkInAllowed(booking, toManilaDateKey(new Date()));

  return (
    <PageFrame>
      <ResultCard tone={rule.ok || partyCheckIn ? "valid" : "neutral"} title={partyCheckIn ? "Guests checked in" : "Valid booking ticket"}>
        <p className="text-lg font-bold text-daet-ink">{(pkg as { title?: string } | null)?.title ?? "Tour booking"}</p>
        <dl className="mx-auto mt-3 grid max-w-xs grid-cols-2 gap-2 text-left">
          <dt className="text-daet-ink/70">Reference</dt>
          <dd className="font-bold text-daet-ink">{booking.booking_reference}</dd>
          <dt className="text-daet-ink/70">Tour date</dt>
          <dd className="font-bold text-daet-ink">{tourDate(booking.tour_date)}</dd>
          <dt className="text-daet-ink/70">Guests</dt>
          <dd className="font-bold text-daet-ink">
            {booking.number_of_pax} · {booking.contact_name}
          </dd>
        </dl>
        {partyCheckIn ? (
          <p className="mt-3 font-semibold text-green-800 dark:text-green-300">
            Checked in at {new Date(partyCheckIn.scanned_at).toLocaleTimeString("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" })}
          </p>
        ) : isTourist ? (
          <p className="mt-3">Show this QR to your guide on the tour day.</p>
        ) : rule.ok ? (
          <div className="mt-4">
            <TicketCheckInButton token={decodeURIComponent(rawToken)} />
          </div>
        ) : (
          <p className="mt-3 font-semibold text-daet-ink">{rule.reason}</p>
        )}
        {!isTourist ? (
          <p className="mt-4">
            <Link href={`/tours/guide/tours/${booking.id}/roster`} className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 underline">
              Open guest list
            </Link>
          </p>
        ) : null}
      </ResultCard>
    </PageFrame>
  );
}
