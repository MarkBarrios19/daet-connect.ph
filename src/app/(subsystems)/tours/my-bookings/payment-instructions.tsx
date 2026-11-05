import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
interface PaymentInstructionsProps {
  operatorName: string;
  gcashNumber?: string | null;
  gcashName?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  paymentInstructions?: string | null;
  totalAmount: number;
  bookingReference: string;
  operatorPhone?: string | null;
}

export function PaymentInstructions({
  operatorName,
  gcashNumber,
  gcashName,
  bankName,
  bankAccountNumber,
  bankAccountName,
  paymentInstructions,
  totalAmount,
  bookingReference,
  operatorPhone,
}: PaymentInstructionsProps) {
  return (
    <div className="rounded-2xl card-edge bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-2xl"><LineIcon name="money" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></span>
        <h3 className="text-lg font-bold text-daet-ink">How to pay</h3>
      </div>

      <div className="space-y-4">
        {/* Amount to Pay */}
        <div className="rounded-2xl bg-canvas p-4 text-center">
          <p className="text-sm text-daet-ink/70">Amount to pay</p>
          <p className="text-3xl font-bold text-daet-forest dark:text-blue-300">
            {formatPeso(totalAmount)}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Reference: {bookingReference}
          </p>
        </div>

        {/* GCash Payment */}
        {gcashNumber && (
          <div className="rounded-2xl bg-canvas p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-daet-ink">
              <span className="text-xl"><LineIcon name="phone" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></span>
              GCash Payment
            </p>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-daet-ink/70">GCash Number:</p>
                <p className="font-bold text-daet-ink">{gcashNumber}</p>
              </div>
              {gcashName && (
                <div>
                  <p className="text-daet-ink/70">Account Name:</p>
                  <p className="font-bold text-daet-ink">{gcashName}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bank Transfer */}
        {bankName && bankAccountNumber && (
          <div className="rounded-2xl bg-canvas p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-daet-ink">
              <span className="text-xl"><LineIcon name="bank" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></span>
              Bank Transfer
            </p>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-daet-ink/70">Bank:</p>
                <p className="font-bold text-daet-ink">{bankName}</p>
              </div>
              <div>
                <p className="text-daet-ink/70">Account Number:</p>
                <p className="font-bold text-daet-ink">{bankAccountNumber}</p>
              </div>
              {bankAccountName && (
                <div>
                  <p className="text-daet-ink/70">Account Name:</p>
                  <p className="font-bold text-daet-ink">{bankAccountName}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom Instructions */}
        {paymentInstructions && (
          <div className="rounded-2xl bg-canvas p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-daet-ink">
              <span className="text-xl"><LineIcon name="note" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></span>
              Additional Instructions
            </p>
            <p className="whitespace-pre-wrap text-sm text-daet-ink/80">
              {paymentInstructions}
            </p>
          </div>
        )}

        {/* Contact Operator */}
        <div className="rounded-2xl bg-daet-forest/10 p-4 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            After sending payment, contact the operator:
          </p>
          <p className="mt-2 font-bold text-daet-ink">
            {operatorName}
            {operatorPhone && (
              <>
                <br />
                <span className="text-sm"><LineIcon name="phone" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {operatorPhone}</span>
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Send proof of payment (screenshot) to confirm your booking.
          </p>
        </div>

        {/* No Payment Details Warning */}
        {!gcashNumber && !bankName && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 p-4 text-center">
            <p className="text-sm text-red-800 dark:text-red-300">
              <LineIcon name="warning" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Operator has not set up payment details yet.
              {operatorPhone && (
                <>
                  {" "}
                  Please contact them at <strong>{operatorPhone}</strong> for payment
                  instructions.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
