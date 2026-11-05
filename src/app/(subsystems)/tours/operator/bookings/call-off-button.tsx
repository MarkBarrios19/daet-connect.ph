"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { CALL_OFF_REASONS } from "@/lib/tours/call-off";
import { callOffBooking } from "./actions";

/**
 * "Call off trip" for weather or safety. The traveller is told right away
 * and chooses a new date or a full refund, so the operator doesn't have to
 * cancel and refund by hand.
 */
export function CallOffButton({ bookingId, bookingReference, contactName, tourDay }: { bookingId: string; bookingReference: string; contactName: string; tourDay: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const result = await callOffBooking(bookingId, reason);
      if (!result.success) {
        setError(result.error ?? "The trip could not be called off.");
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Call off for weather
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={`Call off ${bookingReference} on ${tourDay}?`}
        description={`${contactName} is told right away and picks a new date or a full refund. You record the refund afterwards, as for any cancellation.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Keep the trip
            </Button>
            <Button variant="danger" loading={pending} loadingText="Calling off…" onClick={submit} disabled={reason.trim().length < 5}>
              Call off trip
            </Button>
          </>
        }
      >
        {error ? <Notice variant="error" className="mb-3">{error}</Notice> : null}
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Common reasons">
          {CALL_OFF_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r} className={`min-h-11 rounded-full px-3 text-left text-sm font-semibold ${reason === r ? "bg-blue-600 text-white" : "bg-muted text-daet-ink hover:bg-muted-strong"}`}>
              {r}
            </button>
          ))}
        </div>
        <Field id={`call-off-${bookingId}`} label="Reason for the traveller" required hint="Shown to the traveller and the guide.">
          <Textarea id={`call-off-${bookingId}`} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
