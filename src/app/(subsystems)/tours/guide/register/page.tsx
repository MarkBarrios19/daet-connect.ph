import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { GuideRegistrationForm } from "@/app/(subsystems)/tours/guide/guide-registration-form";
import { GUIDE_NOTES_COLUMN, GUIDE_OWN_STATUS_SELECT, GUIDE_TABLE, GUIDE_USER_ID_COLUMN } from "@/lib/tours/guide-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";


export default async function GuideRegistrationPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <div className="mx-auto mb-6 max-w-3xl">
          <Notice variant="warning" title="Preview mode — Supabase setup is needed">
            Configure Supabase to verify the account and submit the private identity record. You can preview the three-step form below; submission and QR generation stay disabled until connected.
          </Notice>
        </div>
        <GuideRegistrationForm submissionDisabled />
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
            Use your CONNECT-DAET account before submitting ID documents. <Link href={`/login?next=${encodeURIComponent("/tours/guide/register")}`} className="font-bold underline underline-offset-4">Sign in</Link>.
          </Notice>
        </div>
      </PageFrame>
    );
  }
  if (session.error || !session.role) {
    return <PageFrame><div className="mx-auto max-w-2xl py-8"><Notice variant="error" title="We could not verify your account">{session.error ?? "Your account role is missing. Contact the CONNECT-DAET administrator."}</Notice></div></PageFrame>;
  }
  if (session.role === "admin") redirect("/tours/admin/guides");
  if (session.role !== "tourist" && session.role !== "guide") {
    return <PageFrame><div className="mx-auto max-w-2xl py-8"><Notice variant="warning" title="This account cannot apply as a guide">Guide applications are available to tourist accounts. Contact the Tourism Office if you need help.</Notice></div></PageFrame>;
  }

  const supabase = await createSupabaseServerClient();
  const { data: guide, error } = await supabase
    .from(GUIDE_TABLE)
    .select(GUIDE_OWN_STATUS_SELECT)
    .eq(GUIDE_USER_ID_COLUMN, session.user.id)
    .maybeSingle();
  if (error) {
    return <PageFrame><div className="mx-auto max-w-2xl py-8"><Notice variant="error" title="Guide application status is unavailable">We could not safely check whether you already have a guide application. Try again later.</Notice></div></PageFrame>;
  }
  if (guide?.accreditation_status === "pending") redirect("/tours/guide/pending");
  if (guide?.accreditation_status === "approved" && session.role === "guide") redirect("/tours/guide/dashboard");
  if (guide?.accreditation_status === "approved") {
    return <PageFrame><div className="mx-auto max-w-2xl py-8"><Notice variant="error" title="Your guide application is approved, but the account role needs attention">Contact the Tourism Office administrator before continuing.</Notice></div></PageFrame>;
  }

  return <PageFrame><GuideRegistrationForm rejectionReason={guide?.accreditation_status === "rejected" ? guide[GUIDE_NOTES_COLUMN] : null} /></PageFrame>;
}
