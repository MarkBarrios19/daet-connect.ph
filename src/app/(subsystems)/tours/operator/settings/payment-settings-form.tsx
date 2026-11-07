"use client";

import { LineIcon } from "@/components/ui/icons";
import { useState } from "react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useFeedback } from "@/components/ui/feedback";
import { updatePaymentSettings } from "./actions";

interface PaymentSettingsFormProps {
  operatorId: string;
  gcashNumber?: string | null;
  gcashName?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  paymentInstructions?: string | null;
}

export function PaymentSettingsForm({
  operatorId,
  gcashNumber: initialGcash,
  gcashName: initialGcashName,
  bankName: initialBank,
  bankAccountNumber: initialBankAccount,
  bankAccountName: initialBankAccountName,
  paymentInstructions: initialInstructions,
}: PaymentSettingsFormProps) {
  const { toast, confirm } = useFeedback();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gcashNumber, setGcashNumber] = useState(initialGcash || "");
  const [gcashName, setGcashName] = useState(initialGcashName || "");
  const [bankName, setBankName] = useState(initialBank || "");
  const [bankAccountNumber, setBankAccountNumber] = useState(initialBankAccount || "");
  const [bankAccountName, setBankAccountName] = useState(initialBankAccountName || "");
  const [paymentInstructions, setPaymentInstructions] = useState(
    initialInstructions || ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await updatePaymentSettings({
      operatorId,
      gcashNumber: gcashNumber || null,
      gcashName: gcashName || null,
      bankName: bankName || null,
      bankAccountNumber: bankAccountNumber || null,
      bankAccountName: bankAccountName || null,
      paymentInstructions: paymentInstructions || null,
    });

    setIsSubmitting(false);

    if (result.success) {
      toast("Payment settings saved.", "success");
    } else {
      toast(result.error || "We could not save your payment settings.", "error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="rounded-2xl bg-canvas p-4">
        <legend className="flex items-center gap-2 px-1 text-sm font-bold text-daet-ink">
          <LineIcon name="phone" className="inline-block h-[1.1em] w-[1.1em]" aria-hidden="true" />
          GCash payment details
        </legend>
        <div className="mt-3 space-y-3">
          <Field id="gcashNumber" label="GCash mobile number">
            <Input type="tel" inputMode="tel" autoComplete="off" value={gcashNumber} onChange={(e) => setGcashNumber(e.target.value)} placeholder="09171234567" />
          </Field>
          <Field id="gcashName" label="GCash account name">
            <Input type="text" autoComplete="off" value={gcashName} onChange={(e) => setGcashName(e.target.value)} placeholder="Juan Dela Cruz" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl bg-canvas p-4">
        <legend className="flex items-center gap-2 px-1 text-sm font-bold text-daet-ink">
          <LineIcon name="bank" className="inline-block h-[1.1em] w-[1.1em]" aria-hidden="true" />
          Bank transfer details
        </legend>
        <div className="mt-3 space-y-3">
          <Field id="bankName" label="Bank name">
            <Input type="text" autoComplete="off" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="BPI, BDO, Metrobank, etc." />
          </Field>
          <Field id="bankAccountNumber" label="Account number">
            <Input type="text" inputMode="numeric" autoComplete="off" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="1234567890" />
          </Field>
          <Field id="bankAccountName" label="Account name">
            <Input type="text" autoComplete="off" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="Juan Dela Cruz" />
          </Field>
        </div>
      </fieldset>

      <Field id="paymentInstructions" label="Additional payment instructions (optional)">
        <Textarea rows={4} value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} placeholder="Example: Please include booking reference in payment message..." />
      </Field>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-full bg-daet-forest px-6 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? "Saving..." : "Save payment settings"}
      </button>

      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        These details will be shown to tourists after they book and confirm their tour.
      </p>
    </form>
  );
}
