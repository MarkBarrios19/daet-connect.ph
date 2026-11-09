"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { badgeTone } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/field";
import { LineIcon, type IconName } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import type { BoardStatus, PaymentNote } from "@/lib/tours/booking-board";
import type { BoardRow } from "./board-types";

const STATUS_TONE: Record<BoardStatus, string> = {
  // Same chip colours as everywhere else (badge.tsx).
  pending: badgeTone("warning"),
  confirmed: badgeTone("success"),
  completed: badgeTone("neutral"),
  declined: badgeTone("danger"),
  refunded: badgeTone("refund"),
};

const STATUS_ICON: Record<BoardStatus, IconName> = {
  pending: "clock",
  confirmed: "check",
  completed: "check",
  declined: "cancel",
  refunded: "return",
};

export const STATUS_LABEL: Record<BoardStatus, string> = {
  pending: "To Confirm",
  confirmed: "Confirmed",
  completed: "Completed",
  declined: "Declined",
  refunded: "Refunded",
};

export const NOTE_TONE: Record<PaymentNote["tone"], string> = {
  neutral: "text-daet-ink/70",
  warning: "text-yellow-800 dark:text-yellow-300",
  success: "text-green-800 dark:text-green-300",
  refund: "text-violet-800 dark:text-violet-300",
};

const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * One booking on the board: the line the operator scans (package, guest, date,
 * money, status, the next action) and, a tap away, the detail panel — the
 * guest's notes, who is leading the tour, what can be done next, and the
 * management form for the thing that needs doing.
 *
 * The shell is client-side so the chevron, the checkbox and the panel share one
 * piece of state; the panel's contents come from the board, which knows what
 * each row can do.
 */
export function BookingRow({
  booking,
  selected,
  onSelect,
  open,
  onToggle,
  primary,
  notes,
  operations,
  quickActions,
  manage,
}: {
  booking: BoardRow;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  open: boolean;
  onToggle: () => void;
  /** The one main button for what this booking needs next. */
  primary: ReactNode;
  notes?: ReactNode;
  operations?: ReactNode;
  quickActions: ReactNode;
  manage?: ReactNode;
}) {
  const panelId = useId();

  return (
    <article
      id={`booking-${booking.id}`}
      className="scroll-mt-24 rounded-2xl card-edge bg-surface target:ring-2 target:ring-blue-600/40"
      aria-label={`${booking.packageTitle}, ${booking.reference}`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className="flex items-start gap-3 sm:items-center">
          <label className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted">
            <Checkbox
              checked={selected}
              onChange={(event) => onSelect(event.target.checked)}
              aria-label={`Select ${booking.reference}`}
            />
          </label>
          <span
            aria-hidden="true"
            className="hidden h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-50 text-[11px] font-bold leading-tight text-blue-700 sm:flex dark:bg-blue-950/40 dark:text-blue-300"
          >
            DAET
          </span>
        </div>

        {/* Package and reference */}
        <div className="min-w-0 flex-1">
          <Link
            href={`/tours/bookings/${booking.id}`}
            className="block text-lg font-bold leading-snug text-daet-ink hover:underline"
          >
            {booking.packageTitle}
          </Link>
          <p className="mt-0.5 break-words text-sm font-bold text-daet-forest dark:text-blue-300">{booking.reference}</p>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 text-sm sm:gap-x-6 lg:w-[30rem] lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs font-bold text-daet-ink/60">Guest contact</dt>
            <dd className="break-words font-bold text-daet-ink">{booking.contactName}</dd>
            <dd className="break-words text-daet-ink/70">{booking.contactPhone}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-bold text-daet-ink/60">Tour date &amp; pax</dt>
            <dd className="flex items-center gap-1.5 font-bold text-daet-ink">
              <LineIcon name="calendar" className="h-4 w-4 shrink-0 text-daet-ink/60" />
              <span>{booking.tourDate}</span>
            </dd>
            <dd className="text-daet-ink/70">{`${booking.pax} ${booking.pax === 1 ? "guest" : "guests"}`}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-bold text-daet-ink/60">Total amount</dt>
            <dd className="font-bold text-daet-ink">{formatPeso(booking.totalAmount)}</dd>
            <dd className={`break-words ${NOTE_TONE[booking.note.tone]}`}>{booking.note.text}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-bold text-daet-ink/60">Status</dt>
            <dd>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${STATUS_TONE[booking.status]}`}>
                <LineIcon name={STATUS_ICON[booking.status]} className="h-4 w-4" />
                {STATUS_LABEL[booking.status]}
              </span>
            </dd>
          </div>
        </dl>

        <div className="flex shrink-0 items-center gap-2 sm:pl-2">
          {primary}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? `Hide details for ${booking.reference}` : `Show details for ${booking.reference}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas text-daet-ink ring-1 ring-inset ring-line transition hover:bg-muted"
          >
            <LineIcon name="chevron-down" className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open ? (
        <div id={panelId} className="border-t border-hairline px-4 pb-4 pt-4 sm:px-5">
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
            <section aria-label="Guest notes and requests" className="min-w-0 rounded-2xl bg-canvas p-4">
              <h3 className="text-sm font-bold text-daet-ink">Guest notes &amp; requests</h3>
              <p className="mt-2 break-words text-sm italic text-daet-ink">
                {booking.specialRequests ? `“${booking.specialRequests}”` : "No notes from the guest."}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-daet-ink/70">Email:</dt>
                  <dd className="break-all font-semibold text-daet-ink">{booking.contactEmail || "—"}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-daet-ink/70">Phone:</dt>
                  <dd className="font-semibold text-daet-ink">{booking.contactPhone || "—"}</dd>
                </div>
              </dl>
              {notes}
            </section>

            <section aria-label="Guide and operations" className="min-w-0 rounded-2xl bg-canvas p-4">
              <h3 className="text-sm font-bold text-daet-ink">Guide &amp; operations</h3>
              <dl className="mt-2 space-y-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <dt className="text-daet-ink/70">Assigned guide:</dt>
                  <dd className={`min-w-0 break-words font-bold ${booking.guideName ? "text-daet-ink" : "text-daet-ink/70"}`}>
                    {booking.guideName ?? "Unassigned"}
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <dt className="text-daet-ink/70">Payment status:</dt>
                  <dd className={`min-w-0 break-words text-right font-bold ${NOTE_TONE[booking.note.tone]}`}>{booking.note.text}</dd>
                </div>
              </dl>
              {booking.calledOff === "awaiting" ? (
                <p className="mt-3 rounded-xl bg-yellow-50 p-3 text-sm text-daet-ink dark:bg-yellow-950/30">
                  <span className="font-bold">Called off:</span> {booking.calledOffReason} The traveller is choosing a new
                  date or a full refund.
                </p>
              ) : booking.calledOff === "rescheduled" ? (
                <p className="mt-3 rounded-xl bg-surface p-3 text-sm text-daet-ink">
                  <span className="font-bold">Moved after a call-off</span>
                  {booking.rescheduledFrom ? ` from ${shortDay(booking.rescheduledFrom)}` : ""}. The traveller picked this
                  date.
                </p>
              ) : null}
              {booking.cancellationReason ? (
                <p className="mt-3 rounded-xl bg-surface p-3 text-sm text-daet-ink">
                  <span className="font-bold">
                    {booking.lifecycleStatus === "rejected" ? "Declined because:" : "Cancellation reason:"}
                  </span>{" "}
                  {booking.cancellationReason}
                </p>
              ) : null}
              {operations}
            </section>

            <section aria-label="Quick actions" className="min-w-0 rounded-2xl bg-canvas p-4">
              <h3 className="text-sm font-bold text-daet-ink">Quick actions</h3>
              <div className="mt-3 flex flex-wrap items-start gap-2">{quickActions}</div>
            </section>
          </div>

          {manage ? (
            <details className="group mt-3 rounded-2xl bg-canvas p-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-daet-ink">
                <span>Guests, receipts &amp; payments</span>
                <LineIcon name="chevron-down" className="h-5 w-5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-3">{manage}</div>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** A "what needs doing" callout used by the manage section, styled per tone. */
export function PanelCallout({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children?: ReactNode;
  tone?: "info" | "warning" | "danger";
}) {
  const tones = {
    info: "bg-blue-50/60 dark:bg-blue-950/40",
    warning: "bg-yellow-50/60 dark:bg-yellow-950/40",
    danger: "bg-red-50/60 dark:bg-red-950/40",
  } as const;
  return (
    <div className={`rounded-2xl p-4 ${tones[tone]}`}>
      <p className="text-sm font-bold text-daet-ink">{title}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
