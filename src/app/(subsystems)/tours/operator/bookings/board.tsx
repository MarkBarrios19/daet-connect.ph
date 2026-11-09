"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { useFeedback } from "@/components/ui/feedback";
import { formatPeso } from "@/lib/money";
import { BUSY_LABELS } from "@/lib/tours/guide-swap";
import { approvePendingBookings, cancelBooking, declineBooking } from "./board-actions";
import { ApproveAssignDialog } from "./approve-assign-dialog";
import { ProcessRefundDialog } from "./process-refund-dialog";
import { BookingRow, PanelCallout, STATUS_LABEL } from "./booking-row";
import { ProofReview } from "./proof-review";
import { GuideAssignment } from "./guide-assignment";
import { PaymentRecorder } from "./payment-recorder";
import { SwapReview } from "./swap-review";
import { CallOffButton } from "./call-off-button";
import type { BoardRow } from "./board-types";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";

/** Toasts from the refund dialog, which finishes its own work outside the provider it started in. */
const TOAST_EVENT = "board:toast";

/**
 * The board itself: the column heading, the rows, and the bar that works on
 * the ticked ones. A row's next step is one button; everything else lives in
 * its detail panel — the design's "one main action per card".
 */
export function BookingBoard({ rows, selectableIds }: { rows: BoardRow[]; selectableIds: string[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<BoardRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<BoardRow | null>(null);
  const [declineTarget, setDeclineTarget] = useState<BoardRow | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<BoardRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectable = useMemo(() => new Set(selectableIds), [selectableIds]);
  const chosenOnPage = [...selected].filter((id) => selectable.has(id));
  const allChosen = selectableIds.length > 0 && chosenOnPage.length === selectableIds.length;

  // One live region for the page: the dialogs post their result here.
  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail;
      toast(detail ?? "Refund sent.", "success");
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, [toast]);

  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  function selectAll(on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of selectableIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function approveChosen() {
    setError(null);
    startTransition(async () => {
      const result = await approvePendingBookings(chosenOnPage);
      if (!result.success) {
        setError(result.error ?? "Nothing could be approved.");
        return;
      }
      setSelected(new Set());
      toast(result.message ?? "Bookings confirmed.", "success");
      router.refresh();
    });
  }

  function declineChosen() {
    if (!declineTarget) return;
    setError(null);
    startTransition(async () => {
      const result = await declineBooking(declineTarget.id, declineReason);
      if (!result.success) {
        setError(result.error ?? "The booking could not be declined.");
        return;
      }
      setDeclineTarget(null);
      setDeclineReason("");
      toast(result.message ?? "Booking declined.", "success");
      router.refresh();
    });
  }

  function cancelChosen() {
    if (!cancelTarget) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(cancelTarget.id, cancelReason);
      if (!result.success) {
        setError(result.error ?? "The booking could not be cancelled.");
        return;
      }
      setCancelTarget(null);
      setCancelReason("");
      toast(result.message ?? "Booking cancelled.", "success");
      router.refresh();
    });
  }

  return (
    <div>
      {/* Column headings: a table's labels, without a table's rigidity on a phone. */}
      <div className="mb-3 hidden rounded-2xl card-edge bg-surface px-5 py-3 text-sm font-bold text-daet-ink/80 lg:flex lg:items-center lg:gap-4">
        <span className="flex w-11 items-center justify-center">
          <Checkbox
            checked={allChosen}
            onChange={(event) => selectAll(event.target.checked)}
            aria-label="Select every pending booking on this page"
            disabled={selectableIds.length === 0}
          />
        </span>
        <span className="flex-1">Tour Package &amp; Ref</span>
        <span className="grid w-[30rem] shrink-0 grid-cols-4 gap-x-6">
          <span>Guest</span>
          <span>Date &amp; Pax</span>
          <span>Total</span>
          <span>Status</span>
        </span>
        <span className="w-[9.5rem] shrink-0 text-right">Action</span>
      </div>

      {error ? (
        <Notice variant="error" className="mb-3">
          {error}
        </Notice>
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <BookingRow
            key={row.id}
            booking={row}
            selected={selected.has(row.id)}
            onSelect={(on) => toggle(row.id, on)}
            open={openId === row.id}
            onToggle={() => setOpenId((current) => (current === row.id ? null : row.id))}
            primary={
              row.status === "pending" ? (
                <Button onClick={() => setApproveTarget(row)}>Approve</Button>
              ) : row.refundable > 0 ? (
                <Button variant="secondary" onClick={() => setRefundTarget(row)}>
                  Refund
                </Button>
              ) : null
            }
            notes={
              <>
                {row.cancellation ? (
                  <PanelCallout
                    tone="warning"
                    title={`Cancellation requested ${new Date(row.cancellation.requestedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`}
                  >
                    <p className="text-sm text-daet-ink/90">“{row.cancellation.reason}”</p>
                    <p className="mt-1 text-sm text-daet-ink/80">
                      {row.cancellation.late
                        ? "Requested inside the free-cancellation window, so a fee may apply."
                        : "Requested before the free-cancellation deadline."}
                    </p>
                    {row.refundable > 0 ? (
                      <Button variant="secondary" className="mt-2" onClick={() => setRefundTarget(row)}>
                        Refund {formatPeso(row.refundable)}
                      </Button>
                    ) : null}
                  </PanelCallout>
                ) : null}
                {row.swap ? (
                  <SwapReview
                    swap={row.swap}
                    guides={row.picker.map(({ id, full_name, reason }) => ({ id, full_name, reason }))}
                  />
                ) : null}
              </>
            }
            operations={
              <>
                {row.guideName ? (
                  <p className="mt-2 text-sm text-daet-ink/70">
                    {row.calledOff === "awaiting"
                      ? "The guide has been told the trip is off."
                      : `${row.guideName} is leading this tour.`}
                  </p>
                ) : null}
                {row.lifecycleStatus !== "rejected" && row.lifecycleStatus !== "cancelled" ? (
                  <div className="mt-3">
                    <GuideAssignment
                      bookingId={row.id}
                      currentGuideId={row.guideId}
                      availableGuides={row.picker.map(({ id, full_name, contact_phone }) => ({
                        id,
                        full_name,
                        contact_phone: contact_phone ?? "",
                      }))}
                      availability={row.availability}
                      busy={Object.fromEntries(row.picker.map((guide) => [guide.id, guide.reason]))}
                    />
                  </div>
                ) : null}
                {Object.values(row.busy).some(Boolean) && row.picker.length > 0 ? (
                  <p className="mt-2 break-words text-sm text-daet-ink/70">
                    Busy on this date:{" "}
                    {row.picker
                      .filter((guide) => guide.reason)
                      .map((guide) => `${guide.full_name} (${BUSY_LABELS[guide.reason!]})`)
                      .join(", ")}
                    .
                  </p>
                ) : null}
              </>
            }
            quickActions={
              <>
                <a
                  href={`tel:${row.contactPhone.replace(/[^\d+]/g, "")}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-canvas px-4 text-sm font-bold text-daet-ink ring-1 ring-inset ring-line hover:bg-muted"
                >
                  <LineIcon name="phone" className="h-4 w-4" />
                  Call Tourist
                </a>
                <OpenChatButton bookingId={row.id} label="Message tourist" />
                <Link
                  href={`/tours/bookings/${row.id}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-canvas px-4 text-sm font-bold text-daet-ink ring-1 ring-inset ring-line hover:bg-muted"
                >
                  <LineIcon name="receipt" className="h-4 w-4" />
                  Booking page
                </Link>
                {row.status === "pending" ? (
                  <>
                    <Button onClick={() => setApproveTarget(row)}>Approve</Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDeclineReason("");
                        setError(null);
                        setDeclineTarget(row);
                      }}
                    >
                      Decline
                    </Button>
                  </>
                ) : null}
                {row.refundable > 0 && row.status !== "pending" ? (
                  <Button variant="secondary" onClick={() => setRefundTarget(row)}>
                    <LineIcon name="return" className="h-4 w-4" />
                    Process Refund
                  </Button>
                ) : null}
                {row.canCallOff ? (
                  <CallOffButton
                    bookingId={row.id}
                    bookingReference={row.reference}
                    contactName={row.contactName}
                    tourDay={row.tourDate}
                  />
                ) : null}
                {row.status === "refunded" ? (
                  <p className="self-center text-sm text-daet-ink/80">{formatPeso(row.totalPaid)} returned.</p>
                ) : null}
                {row.status !== "refunded" &&
                row.status !== "pending" &&
                row.refundable === 0 &&
                !row.canCallOff &&
                row.lifecycleStatus !== "rejected" ? (
                  <p className="self-center text-sm text-daet-ink/70">
                    Nothing needs doing. {STATUS_LABEL[row.status]}.
                  </p>
                ) : null}
              </>
            }
            manage={
              row.lifecycleStatus !== "rejected" && row.lifecycleStatus !== "cancelled" ? (
                <>
                  {row.pendingProofs.length > 0 ? <ProofReview proofs={row.pendingProofs} /> : null}
                  <PaymentRecorder
                    bookingId={row.id}
                    bookingReference={row.reference}
                    totalAmount={row.totalAmount}
                    totalPaid={row.totalPaid}
                    paymentStatus={row.paymentStatus}
                  />
                  {row.lifecycleStatus === "pending" || row.lifecycleStatus === "confirmed" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelReason("");
                        setError(null);
                        setCancelTarget(row);
                      }}
                      className="min-h-11 text-sm font-bold text-red-700 underline dark:text-red-300"
                    >
                      Cancel booking
                    </button>
                  ) : null}
                </>
              ) : null
            }
          />
        ))}
      </div>

      {/* Ticked rows: one bar, docked over the tab bar on a phone. */}
      {chosenOnPage.length > 0 ? (
        <div className="sticky bottom-20 z-30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-3 shadow-[var(--shadow-float)] ring-1 ring-line sm:bottom-6">
          <p role="status" className="text-sm font-bold text-daet-ink">
            {chosenOnPage.length} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={pending}>
              Clear
            </Button>
            <Button onClick={approveChosen} loading={pending} loadingText="Confirming…">
              Approve {chosenOnPage.length}
            </Button>
          </div>
        </div>
      ) : null}

      {approveTarget ? (
        <ApproveAssignDialog
          key={`approve-${approveTarget.id}`}
          open
          onClose={() => setApproveTarget(null)}
          bookingId={approveTarget.id}
          reference={approveTarget.reference}
          packageTitle={approveTarget.packageTitle}
          guestName={approveTarget.contactName}
          pax={approveTarget.pax}
          tourDate={approveTarget.tourDate}
          capacity={approveTarget.capacity}
          guides={approveTarget.picker}
        />
      ) : null}

      {refundTarget ? (
        <ProcessRefundDialog
          key={`refund-${refundTarget.id}`}
          open
          onClose={() => setRefundTarget(null)}
          bookingId={refundTarget.id}
          reference={refundTarget.reference}
          packageTitle={refundTarget.packageTitle}
          guestName={refundTarget.contactName}
          refundable={refundTarget.refundable}
          paymongoConfigured={refundTarget.paymongoConfigured}
          paymongoLive={refundTarget.paymongoLive}
          openBooking={refundTarget.lifecycleStatus === "pending" || refundTarget.lifecycleStatus === "confirmed"}
        />
      ) : null}

      <Modal
        open={declineTarget !== null}
        onClose={() => {
          if (!pending) setDeclineTarget(null);
        }}
        title={declineTarget ? `Decline ${declineTarget.reference} for ${declineTarget.contactName}?` : "Decline booking"}
        description="Its seats are released and the tourist is told why."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclineTarget(null)} disabled={pending}>
              Keep as is
            </Button>
            <Button
              variant="danger"
              loading={pending}
              loadingText="Saving…"
              onClick={declineChosen}
              disabled={declineReason.trim().length < 5}
            >
              Decline booking
            </Button>
          </>
        }
      >
        {error ? (
          <Notice variant="error" className="mb-3">
            {error}
          </Notice>
        ) : null}
        <Field id="decline-reason" label="Reason for the tourist" required hint="Shown on the tourist's booking page.">
          <Textarea
            id="decline-reason"
            rows={3}
            maxLength={500}
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value)}
            placeholder="e.g. The boat is under repair on this date."
          />
        </Field>
      </Modal>

      <Modal
        open={cancelTarget !== null}
        onClose={() => {
          if (!pending) setCancelTarget(null);
        }}
        title={cancelTarget ? `Cancel ${cancelTarget.reference} for ${cancelTarget.contactName}?` : "Cancel booking"}
        description="The seats are released and the tourist is told why. Any money they paid is returned with Process Refund, afterwards."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)} disabled={pending}>
              Keep as is
            </Button>
            <Button
              variant="danger"
              loading={pending}
              loadingText="Cancelling…"
              onClick={cancelChosen}
              disabled={cancelReason.trim().length < 5}
            >
              Cancel booking
            </Button>
          </>
        }
      >
        {error ? (
          <Notice variant="error" className="mb-3">
            {error}
          </Notice>
        ) : null}
        <Field id="cancel-reason" label="Reason for the tourist" required hint="Shown on the tourist's booking page.">
          <Textarea
            id="cancel-reason"
            rows={3}
            maxLength={500}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="e.g. The coast guard stopped all boat trips."
          />
        </Field>
      </Modal>
    </div>
  );
}
