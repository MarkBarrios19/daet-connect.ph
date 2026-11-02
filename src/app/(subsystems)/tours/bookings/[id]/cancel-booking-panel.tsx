"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { FREE_CANCELLATION_HOURS, type CancellationOption } from "@/lib/tours/cancellation";
import { cancelMyBooking, type CancelBookingState } from "./cancel-actions";

export type MyCancellation = {
  status: string;
  reason: string;
  admin_notes: string | null;
};

const initialState: CancelBookingState = { error: null, message: null };

export function CancelBookingPanel({
  bookingId,
  option,
  cancellation,
}: {
  bookingId: string;
  option: CancellationOption;
  cancellation: MyCancellation | null;
}) {
  const [state, formAction, pending] = useActionState(cancelMyBooking, initialState);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.message) setOpen(false);
  }, [state.message]);

  if (cancellation?.status === "requested") {
    return (
      <Section>
        <Notice variant="info" title="Cancellation requested">
          The operator is reviewing your request: “{cancellation.reason}”
        </Notice>
      </Section>
    );
  }

  if (option.mode === "none") return null;

  const isRequest = option.mode === "request";

  return (
    <Section>
      {state.message ? <Notice variant="success" className="mb-3">{state.message}</Notice> : null}
      {cancellation?.status === "rejected" ? (
        <Notice variant="warning" className="mb-3" title="Your last cancellation request was declined">
          {cancellation.admin_notes ?? "The operator kept this booking active."}
        </Notice>
      ) : null}

      {!open ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-daet-ink/70">
            {isRequest
              ? "Plans changed? Ask the operator to cancel. They will review it and arrange any refund."
              : "Plans changed? You can cancel this booking now. Nothing has been paid yet."}
            {option.late ? ` The tour is less than ${FREE_CANCELLATION_HOURS} hours away, so the operator's refund policy may apply.` : ""}
          </p>
          <Button variant="danger" onClick={() => setOpen(true)} className="shrink-0">
            {isRequest ? "Request cancellation" : "Cancel booking"}
          </Button>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          {state.error ? <Notice variant="error">{state.error}</Notice> : null}
          <Field id="cancel-reason" label="Why are you cancelling?" required hint="The operator sees this.">
            <Textarea id="cancel-reason" name="reason" rows={3} minLength={5} maxLength={500} required />
          </Field>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Keep my booking
            </Button>
            <Button type="submit" variant="danger" loading={pending} loadingText="Sending…">
              {isRequest ? "Send request" : "Cancel booking"}
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl card-edge bg-surface p-6">
      <h3 className="mb-3 text-lg font-bold text-daet-ink">Cancellation</h3>
      {children}
    </section>
  );
}
