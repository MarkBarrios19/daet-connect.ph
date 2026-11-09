"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { formatPeso } from "@/lib/money";
import { REFUND_REASONS, type RefundReasonKey } from "@/lib/paymongo/refunds";
import { getOnlineRefundAvailability, processRefund } from "./board-actions";

export type ProcessRefundProps = {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  reference: string;
  packageTitle: string;
  guestName: string;
  /** What the tourist can still get back. */
  refundable: number;
  /** True when the PayMongo keys are configured; the sandbox tag only shows then. */
  paymongoConfigured: boolean;
  paymongoLive: boolean;
  /** The booking is still live, so refunding means cancelling it first. */
  openBooking: boolean;
};

/**
 * Process Refund. Two ways to send money back, side by side, and the reason
 * for it — the design's dialog. PayMongo returns what was paid online; a
 * manual refund is one the operator has already sent and is recording.
 */
export function ProcessRefundDialog({
  open,
  onClose,
  bookingId,
  reference,
  packageTitle,
  guestName,
  refundable,
  paymongoConfigured,
  paymongoLive,
  openBooking,
}: ProcessRefundProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [method, setMethod] = useState<"paymongo" | "manual">(paymongoConfigured ? "paymongo" : "manual");
  const [amount, setAmount] = useState(refundable.toFixed(2));
  const [reason, setReason] = useState<RefundReasonKey | "">("");
  const [manualMethod, setManualMethod] = useState("gcash");
  const [manualReference, setManualReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const methodRef = useRef(method);
  const [online, setOnline] = useState<{ available: number; error?: string } | null>(null);

  useEffect(() => {
    if (!open || !paymongoConfigured) return;
    let active = true;
    getOnlineRefundAvailability(bookingId).then((result) => {
      if (!active) return;
      setOnline(result);
      if (methodRef.current !== "paymongo") return;
      if (!result.error && Math.min(refundable, result.available) < 1) { methodRef.current = "manual"; setMethod("manual"); }
      if (!result.error && Math.min(refundable, result.available) >= 1) {
        setAmount((current) => current === refundable.toFixed(2)
          ? Math.min(refundable, result.available).toFixed(2) : current);
      }
    }).catch(() => {
      if (active) setOnline({ available: 0, error: "PayMongo refund history could not be verified. Check the PayMongo dashboard before retrying." });
    });
    return () => { active = false; };
  }, [bookingId, open, paymongoConfigured, refundable]);

  const autoAvailable = Math.min(refundable, online?.available ?? 0);
  const amountNumber = Number(amount);
  const validAmount =
    Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber <= refundable + 0.001 &&
    (method !== "paymongo" || (online != null && !online.error && amountNumber >= 1 && amountNumber <= autoAvailable + 0.001));

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await processRefund({
        bookingId,
        method,
        amount: amountNumber,
        reason: reason || "guest",
        manualMethod,
        reference: manualReference.trim() || null,
        closeReason: note.trim() || null,
      });
      if (!result.success) {
        setError(result.error ?? "The refund could not be sent.");
        return;
      }
      onClose();
      router.refresh();
      // The board shows the toast; it owns the live region for the page.
      window.dispatchEvent(new CustomEvent("board:toast", { detail: result.message }));
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-daet-forest dark:text-blue-300">{reference}</span>
          {paymongoConfigured ? <Badge tone="success">{paymongoLive ? "PAYMONGO LIVE" : "PAYMONGO SANDBOX"}</Badge> : null}
          <span className="w-full text-lg">Process Refund</span>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} loadingText="Sending…" disabled={!reason || !validAmount}>
            {method === "paymongo" ? "Confirm PayMongo Refund" : "Record Manual Refund"}
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-canvas p-4">
        <p className="text-sm text-daet-ink/70">Remaining in booking ledger:</p>
        <p className="text-2xl font-bold text-daet-ink">{formatPeso(refundable)}</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-daet-ink">
          <span>
            <span className="text-daet-ink/70">Guest:</span> <span className="font-bold">{guestName}</span>
          </span>
          <span>
            <span className="text-daet-ink/70">Package:</span> <span className="font-bold">{packageTitle}</span>
          </span>
        </p>
        {paymongoConfigured && !online ? (
          <p className="mt-1 text-sm text-daet-ink/70">Checking PayMongo refund history…</p>
        ) : online && !online.error ? (
          <p className="mt-1 text-sm text-daet-ink/70">{formatPeso(autoAvailable)} available through PayMongo.</p>
        ) : null}
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-bold text-daet-ink">Refund method</legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["paymongo", "PayMongo (Auto)", paymongoConfigured && Boolean(online && !online.error && autoAvailable >= 1)],
              ["manual", "Manual GCash", true],
            ] as const
          ).map(([value, label, enabled]) => (
            <button
              key={value}
              type="button"
              aria-pressed={method === value}
              disabled={!enabled || pending}
              onClick={() => { methodRef.current = value; setMethod(value); setError(null); }}
              className={`min-h-12 rounded-2xl px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                method === value
                  ? "bg-violet-600 text-white"
                  : "bg-muted text-daet-ink ring-1 ring-inset ring-line hover:bg-muted-strong"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {!paymongoConfigured ? (
          <p className="mt-2 text-sm text-daet-ink/70">PayMongo is not configured on this site, so refunds are recorded by hand.</p>
        ) : null}
      </fieldset>

      {online?.error ? <Notice variant="error" className="mt-3">{online.error}</Notice> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id={`${uid}-amount`} label="Amount (₱)" required hint={method === "paymongo" && online && !online.error ? `Up to ${formatPeso(autoAvailable)} online.` : undefined}>
          <Input
            id={`${uid}-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => { setAmount(event.target.value); setError(null); }}
            required
          />
        </Field>
        {method === "manual" ? (
          <Field id={`${uid}-method`} label="Sent via" required>
            <Select id={`${uid}-method`} value={manualMethod} onChange={(event) => setManualMethod(event.target.value)}>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        ) : null}
      </div>

      {method === "manual" ? (
        <Field id={`${uid}-ref`} label="Reference number" className="mt-3" hint="The wallet's or bank's transaction number, shown to the tourist.">
          <Input id={`${uid}-ref`} value={manualReference} onChange={(event) => setManualReference(event.target.value)} maxLength={60} />
        </Field>
      ) : null}

      <Field id={`${uid}-reason`} label="Reason for refund" required className="mt-3">
        <Select id={`${uid}-reason`} value={reason} onChange={(event) => { setReason(event.target.value as RefundReasonKey); setError(null); }} required>
          <option value="">Select a reason…</option>
          {(Object.keys(REFUND_REASONS) as RefundReasonKey[]).map((key) => (
            <option key={key} value={key}>
              {REFUND_REASONS[key].label}
            </option>
          ))}
        </Select>
      </Field>

      {openBooking ? (
        <Field
          id={`${uid}-note`}
          label="Why the tour is off (optional)"
          className="mt-3"
          hint="The booking is still live; refunding it cancels the tour and releases its seats. This note goes to the tourist."
        >
          <Textarea id={`${uid}-note`} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      ) : null}

      {error ? (
        <Notice variant="error" className="mt-3">
          {error}
        </Notice>
      ) : null}
    </Modal>
  );
}
