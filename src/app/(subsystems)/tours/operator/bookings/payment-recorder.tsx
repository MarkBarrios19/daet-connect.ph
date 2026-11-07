"use client";

import { badgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatPeso } from "@/lib/money";
import { useId, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useFeedback } from "@/components/ui/feedback";
import { recordPayment } from "./payment-actions";

interface PaymentRecorderProps {
  bookingId: string;
  bookingReference: string;
  totalAmount: number;
  totalPaid: number;
  paymentStatus: string;
}

export function PaymentRecorder({
  bookingId,
  bookingReference,
  totalAmount,
  totalPaid,
  paymentStatus,
}: PaymentRecorderProps) {
  const { toast, confirm } = useFeedback();
  const uid = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");

  const remaining = totalAmount - totalPaid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await recordPayment({
      bookingId,
      amount: parseFloat(amount),
      paymentMethod,
      referenceNumber: referenceNumber || null,
      paymentDate: new Date(paymentDate).toISOString(),
      notes: notes || null,
    });

    setIsSubmitting(false);

    if (result.success) {
      // Reset form
      setAmount("");
      setReferenceNumber("");
      setNotes("");
      setIsOpen(false);
      toast(`Payment recorded. ${result.message || ""}`.trim(), "success");
    } else {
      toast(result.error || "We could not record that payment.", "error");
    }
  };

  // Same chip colours as everywhere else: amber while money is owed, green when done.
  const statusColors: Record<string, string> = {
    unpaid: badgeTone("warning"),
    partial: badgeTone("warning"),
    paid: badgeTone("success"),
    refunded: badgeTone("neutral"),
  };

  const statusLabels: Record<string, string> = {
    unpaid: "Unpaid",
    partial: "Part paid",
    paid: "Paid in full",
    refunded: "Refunded",
  };

  return (
    <div className="rounded-2xl bg-canvas p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Payment status
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${
              statusColors[paymentStatus] || "bg-muted text-daet-ink"
            }`}
          >
            {statusLabels[paymentStatus] || paymentStatus}
          </span>
        </div>
        {paymentStatus !== "paid" && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={buttonClasses({ variant: "secondary" })}
          >
            {isOpen ? "Cancel" : "Record payment"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-daet-ink/70">Total</p>
          <p className="font-bold text-daet-ink">{formatPeso(totalAmount)}</p>
        </div>
        <div>
          <p className="text-daet-ink/70">Paid</p>
          <p className="font-bold text-daet-ink">{formatPeso(totalPaid)}</p>
        </div>
        <div>
          <p className="text-daet-ink/70">Remaining</p>
          {/* Only colour what is still owed; ₱0.00 is not a warning. */}
          <p className={`font-bold ${remaining > 0 ? "text-yellow-800 dark:text-yellow-200" : "text-daet-ink/70"}`}>{formatPeso(Math.max(0, remaining))}</p>
        </div>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-daet-ink/10 pt-4">
          <Field id={`${uid}-amount`} label="Payment amount (₱)" required>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder={`Max: ${formatPeso(remaining)}`}
            />
          </Field>

          <Field id={`${uid}-method`} label="Payment method" required>
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} required>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </Select>
          </Field>

          <Field id={`${uid}-date`} label="Payment date" required>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required max={new Date().toISOString().split("T")[0]} />
          </Field>

          <Field id={`${uid}-ref`} label="Reference number">
            <Input type="text" autoComplete="off" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Transaction ID, receipt no, etc." />
          </Field>

          <Field id={`${uid}-notes`} label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes about this payment..." />
          </Field>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-h-11 items-center justify-center w-full rounded-full bg-daet-forest px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Recording…" : "Record payment"}
          </button>
        </form>
      )}
    </div>
  );
}
