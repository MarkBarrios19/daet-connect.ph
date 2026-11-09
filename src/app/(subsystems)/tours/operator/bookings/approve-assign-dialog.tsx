"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { useFeedback } from "@/components/ui/feedback";
import { BUSY_LABELS, type BusyReason } from "@/lib/tours/guide-swap";
import { capacityCheck, guideOptionLabel } from "@/lib/tours/booking-board";
import { approveBooking } from "./board-actions";

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export type ApproveAssignProps = {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  reference: string;
  packageTitle: string;
  guestName: string;
  pax: number;
  tourDate: string;
  capacity: { capacity_total: number; capacity_booked: number } | null;
  guides: Array<{
    id: string;
    full_name: string;
    specialties: string[] | null;
    /** Why this guide can't take the date (null = free, missing = unknown). */
    busy?: BusyReason | null;
  }>;
  /** Called with the success message so the page can toast and refresh. */
  onApproved?: (message: string) => void;
};

/**
 * Approve & Assign Eco-Guide: the whole of "say yes" in one dialog — the tour,
 * the guest and the group on top, the day's seats checked underneath, then the
 * guide who will lead it. Confirming sends the voucher to the tourist.
 */
export function ApproveAssignDialog({
  open,
  onClose,
  bookingId,
  reference,
  packageTitle,
  guestName,
  pax,
  tourDate,
  capacity,
  guides,
  onApproved,
}: ApproveAssignProps) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [guideId, setGuideId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const check = capacityCheck({ tourDate, pax, capacity });

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await approveBooking(bookingId, guideId || null);
      if (!result.success) {
        setError(result.error ?? "The booking could not be approved.");
        return;
      }
      onClose();
      toast(result.message ?? "Booking approved.", "success");
      onApproved?.(result.message ?? "Booking approved.");
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title={
        <span className="flex flex-col gap-1">
          <span className="text-sm font-bold text-daet-forest dark:text-blue-300">{reference}</span>
          <span>Approve &amp; Assign Eco-Guide</span>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={pending} loadingText="Confirming…" disabled={!check.ok}>
            Confirm &amp; Send Voucher
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-canvas p-4">
        <p className="text-sm text-daet-ink/70">Package:</p>
        <p className="font-bold text-daet-ink">{packageTitle}</p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm text-daet-ink">
          <p>
            <span className="text-daet-ink/70">Guest:</span> <span className="font-bold">{guestName}</span>
          </p>
          <p>
            <span className="text-daet-ink/70">Pax:</span> <span className="font-bold">{pax}</span>
          </p>
        </div>
      </div>

      <p
        className={`mt-3 flex items-start gap-2 rounded-2xl p-3 text-sm font-semibold ${
          check.ok
            ? "bg-green-50 text-green-950 dark:bg-green-950/40 dark:text-green-300"
            : "bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-300"
        }`}
      >
        <LineIcon name={check.ok ? "check" : "warning"} className="mt-0.5 h-5 w-5 shrink-0" />
        <span>{check.text}</span>
      </p>

      <Field
        id={`${uid}-guide`}
        label="Assign certified local eco-guide"
        className="mt-4"
        hint={
          check.ok
            ? undefined
            : `Open more seats for ${longDate(tourDate)} in the package's availability before confirming.`
        }
      >
        <Select id={`${uid}-guide`} value={guideId} onChange={(event) => setGuideId(event.target.value)} disabled={pending || !check.ok}>
          <option value="">Select accredited guide…</option>
          {guides.map((guide) => (
            <option key={guide.id} value={guide.id} disabled={Boolean(guide.busy)}>
              {guideOptionLabel(guide)}
              {guide.busy ? ` — ${BUSY_LABELS[guide.busy]}` : ""}
            </option>
          ))}
        </Select>
      </Field>

      <p className="mt-2 text-sm text-daet-ink/70">
        The tourist gets a voucher by email as soon as you confirm.
      </p>

      {error ? (
        <Notice variant="error" className="mt-3">
          {error}
        </Notice>
      ) : null}
    </Modal>
  );
}
