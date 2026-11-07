import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { OperatorRegistrationForm } from "@/app/(subsystems)/tours/operator/operator-registration-form";
import { OPERATOR_OWN_STATUS_SELECT, OPERATOR_TABLE, OPERATOR_USER_ID_COLUMN } from "@/lib/tours/operator-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";


export default async function OperatorRegistrationPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <div className="mx-auto mb-6 max-w-3xl">
          <Notice variant="warning" title="Preview mode — Supabase setup is needed">
            Add the Supabase URL and anon key to <code>.env.local</code> to enable account verification and secure submission. You can preview the three-step form below; submission stays disabled until Supabase is configured.
          </Notice>
        </div>
        <OperatorRegistrationForm submissionDisabled />
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
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="info" title="Sign in to apply">
            Use your CONNECT-DAET account before sending business documents. <Link href={`/login?next=${encodeURIComponent("/tours/operator/register")}`} className="font-bold underline underline-offset-4">Sign in</Link>.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  if (session.error || !session.role) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="error" title="We could not verify your account">
            {session.error ?? "Your account role is missing. Contact the CONNECT-DAET administrator."}
          </Notice>
        </div>
      </PageFrame>
    );
  }

  if (session.role === "admin") redirect("/tours/admin/operators");
  if (session.role !== "tourist" && session.role !== "operator" && session.role !== "guide") {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="warning" title="This account cannot apply as an operator">
            Operator applications are available to tourist accounts and guides. Sign in with an appropriate account or contact the Tourism Office.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: application, error } = await supabase
    .from(OPERATOR_TABLE)
    .select(OPERATOR_OWN_STATUS_SELECT)
    .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
    .maybeSingle();

  if (error) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="error" title="Application status is unavailable">
            We could not safely check whether you already have an application. Please try again later.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  if (application?.accreditation_status === "pending") redirect("/tours/operator/pending");
  if (application?.accreditation_status === "approved" && session.role === "operator") {
    redirect("/tours/operator/dashboard");
  }
  if (application?.accreditation_status === "approved") {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="error" title="Your application is approved, but your account needs attention">
            The operator status and account role do not match. Please contact the CONNECT-DAET administrator before continuing.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <OperatorRegistrationForm
        initialEmail={session.user.email ?? ""}
        rejectionReason={application?.accreditation_status === "rejected" ? application.accreditation_notes : null}
      />
    </PageFrame>
  );
}
