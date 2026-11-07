import { redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { OPERATOR_TABLE, OPERATOR_USER_ID_COLUMN } from "@/lib/tours/operator-contract";
import { PaymentSettingsForm } from "./payment-settings-form";


export default async function OperatorSettingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to access settings.
        </Notice>
      </PageFrame>
    );
  }

  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }

  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent("/tours/operator/settings")}`);
  }

  const supabase = await createSupabaseServerClient();

  // Debug logging

  // Get operator profile - select specific columns to avoid missing column errors
  const { data: operator, error } = await supabase
    .from(OPERATOR_TABLE)
    .select("id, profile_id, business_name, contact_person, contact_email, contact_phone, business_address, accreditation_status, gcash_number, gcash_name, bank_name, bank_account_number, bank_account_name, payment_instructions")
    .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
    .maybeSingle();


  if (error || !operator) {
    console.error("Settings query error:", error);
    return (
      <PageFrame>
        <Notice variant="error" title="Operator profile not found">
          You need an approved operator account to access settings.
        </Notice>
      </PageFrame>
    );
  }

  if (operator.accreditation_status !== "approved") {
    return (
      <PageFrame>
        <Notice variant="warning" title="Accreditation pending">
          Your operator account must be approved before accessing settings.
        </Notice>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="display-2 text-daet-ink">Operator Settings</h1>
          <p className="mt-2 text-sm text-daet-ink/70">
            Manage your business profile and payment details
          </p>
        </div>

        {/* Back Button */}
        <div className="mb-6">
          <Link
            href="/tours/operator/dashboard"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-daet-ink/70 transition hover:text-daet-ink"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Business Info */}
        <div className="mb-6 rounded-2xl card-edge bg-surface p-6">
          <h2 className="mb-4 text-xl font-bold text-daet-ink">Business Information</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-daet-ink/70">Business Name</p>
              <p className="font-bold text-daet-ink">{operator.business_name}</p>
            </div>
            <div>
              <p className="text-daet-ink/70">Contact Phone</p>
              <p className="font-bold text-daet-ink">{operator.contact_phone}</p>
            </div>
            <div>
              <p className="text-daet-ink/70">Business Address</p>
              <p className="font-bold text-daet-ink">{operator.business_address}</p>
            </div>
            <div>
              <p className="text-daet-ink/70">Status</p>
              <p className="font-bold capitalize text-green-700 dark:text-green-300">
                {operator.accreditation_status}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Settings Form */}
        <div className="rounded-2xl card-edge bg-surface p-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-daet-ink">Payment Details</h2>
            <p className="mt-1 text-sm text-daet-ink/70">
              Set up where tourists should send payments for confirmed bookings
            </p>
          </div>
          <PaymentSettingsForm
            operatorId={operator.id}
            gcashNumber={operator.gcash_number}
            gcashName={operator.gcash_name}
            bankName={operator.bank_name}
            bankAccountNumber={operator.bank_account_number}
            bankAccountName={operator.bank_account_name}
            paymentInstructions={operator.payment_instructions}
          />
        </div>
      </div>
    </PageFrame>
  );
}
