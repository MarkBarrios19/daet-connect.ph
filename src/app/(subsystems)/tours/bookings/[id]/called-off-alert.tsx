"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import type { DateOption } from "@/lib/tours/availability";

const longDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The operator called this trip off. The traveller picks a new date (from the
 * tour's open dates when it has a calendar) or takes a full refund, or
 * messages the operator first. Nothing is charged for either choice.
 */
export function CalledOffAlert({
  bookingId,
  title,
  tourDate,
  reason,
  openDates,
  minDate,
  paid,
  operatorPhone,
  messageButton,
  actions,
}: {
  bookingId: string;
  title: string;
  tourDate: string;
  reason: string;
  /** Open dates with enough seats for this group; null when the tour has no calendar (any date). */
  openDates: DateOption[] | null;
  minDate: string;
  paid: number;
  operatorPhone: string | null;
  messageButton?: React.ReactNode;
  actions: {
    reschedule: (bookingId: string, date: string, current: string) => Promise<{ ok: true } | { ok: false; error: string }>;
    refund: (bookingId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  };
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<"date" | null>(null);
  const [date, setDate] = useState(openDates?.[0]?.date ?? "");
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(call: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await call().catch(() => ({ ok: false as const, error: "Check your connection and try again." }));
      if (!result.ok) {
        setError(result.error);
        setConfirmRefund(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section role="alert" aria-labelledby="called-off-title" className="mb-6 rounded-2xl bg-yellow-50 p-5 dark:bg-yellow-950/30">
      <h2 id="called-off-title" className="text-xl font-bold text-daet-ink">
        Your trip on {longDay(tourDate)} is called off
      </h2>
      <p className="mt-1 text-daet-ink">
        The operator called off {title} for safety: {reason}
      </p>
      <p className="mt-1 text-sm text-daet-ink">Nothing is lost. Choose a new date or a full refund{paid > 0 ? "" : " (you haven't paid anything yet)"}.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => setChoice("date")} aria-expanded={choice === "date"} disabled={pending}>
          Pick a new date
        </Button>
        <Button variant="secondary" onClick={() => setConfirmRefund(true)} disabled={pending}>
          {paid > 0 ? "Get a full refund" : "Cancel this trip"}
        </Button>
        {messageButton}
        {operatorPhone ? (
          <a href={`tel:${operatorPhone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-blue-700 underline dark:text-blue-300">
            Call the operator
          </a>
        ) : null}
      </div>

      {choice === "date" ? (
        <div className="mt-4 rounded-2xl bg-surface p-4">
          {openDates && openDates.length === 0 ? (
            <p className="text-sm text-daet-ink">No open dates with enough seats yet. Message the operator, or take the full refund.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => actions.reschedule(bookingId, date, tourDate));
              }}
              className="space-y-3"
            >
              <label htmlFor={`new-date-${bookingId}`} className="block text-sm font-bold text-daet-ink">
                New date
              </label>
              {openDates ? (
                <select id={`new-date-${bookingId}`} value={date} onChange={(e) => setDate(e.target.value)} className="block min-h-11 w-full rounded-xl bg-muted px-3 text-base">
                  {openDates.map((o) => (
                    <option key={o.date} value={o.date}>
                      {longDay(o.date)} · {o.seatsLeft} seat{o.seatsLeft === 1 ? "" : "s"} left
                    </option>
                  ))}
                </select>
              ) : (
                <input id={`new-date-${bookingId}`} type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="block min-h-11 w-full rounded-xl bg-muted px-3 text-base" />
              )}
              <Button type="submit" loading={pending} loadingText="Moving your trip…" disabled={!date}>
                Move my trip to this date
              </Button>
              <p className="text-xs text-slate-600 dark:text-slate-400">Your payment and ticket carry over. The operator and your guide are told.</p>
            </form>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300" role="status">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmRefund}
        title={paid > 0 ? "Cancel and get a full refund?" : "Cancel this trip?"}
        description={paid > 0 ? "The booking is cancelled and the operator sends back everything you paid. You'll see it here once they record it." : "The booking is cancelled. You haven't paid anything, so there is nothing to refund."}
        confirmLabel={paid > 0 ? "Cancel and refund" : "Cancel trip"}
        cancelLabel="Keep my booking"
        loading={pending}
        onConfirm={() => run(() => actions.refund(bookingId))}
        onCancel={() => setConfirmRefund(false)}
      />
    </section>
  );
}
