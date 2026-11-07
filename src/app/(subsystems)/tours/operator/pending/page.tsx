import Link from "next/link";
import { redirect } from "next/navigation";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { OPERATOR_OWN_STATUS_SELECT, OPERATOR_TABLE, OPERATOR_USER_ID_COLUMN } from "@/lib/tours/operator-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";


export default async function OperatorPendingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-xl py-8">
          <Notice variant="warning" title="Supabase setup is needed">Configure Supabase to show application status.</Notice>
        </div>
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
        <div className="mx-auto max-w-xl py-8">
          <Notice variant="info" title="Sign in to view your application">
            <Link href={`/login?next=${encodeURIComponent("/tours/operator/pending")}`} className="font-bold underline underline-offset-4">Sign in</Link> to the account used for your application.
          </Notice>
        </div>
      </PageFrame>
    );
  }
  if (session.error) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-xl py-8"><Notice variant="error" title="We could not verify your account">{session.error}</Notice></div>
      </PageFrame>
    );
  }
  if (session.role === "admin") redirect("/tours/admin/operators");

  const supabase = await createSupabaseServerClient();
  const { data: application, error } = await supabase
    .from(OPERATOR_TABLE)
    .select(OPERATOR_OWN_STATUS_SELECT)
    .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
    .maybeSingle();

  if (error) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-xl py-8"><Notice variant="error" title="Status could not be loaded">Please refresh in a moment. Your documents remain private.</Notice></div>
      </PageFrame>
    );
  }
  if (!application) redirect("/tours/operator/register");
  if (application.accreditation_status === "approved" && session.role === "operator") {
    redirect("/tours/operator/dashboard");
  }
  if (application.accreditation_status === "rejected") {
    return (
      <PageFrame>
        <section className="mx-auto max-w-2xl rounded-2xl border-red-200 dark:border-red-700 bg-surface p-6 sm:p-10">
          <span className="inline-flex rounded-full bg-red-50 dark:bg-red-950/40 px-3 py-1 text-xs font-bold text-red-700 dark:text-red-300">Changes requested</span>
          <h1 className="display-2 mt-4 text-daet-ink">Please update your application</h1>
          <p className="mt-3 text-sm leading-6 text-daet-ink/70">The Tourism Office could not approve the documents as submitted. You can review the note and send an updated application.</p>
          {application.accreditation_notes ? (
            <div className="mt-5 rounded-2xl bg-red-50 dark:bg-red-950/40 p-4 text-sm leading-6 text-red-950 dark:text-red-300">
              <p className="font-bold">Reviewer’s note</p><p className="mt-1">{application.accreditation_notes}</p>
            </div>
          ) : null}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/tours/operator/register" className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-blue-700">Update application</Link>
            <OpenChatButton target={{ kind: "operator_admin" }} label="Ask the Tourism Office" />
          </div>
        </section>
      </PageFrame>
    );
  }
  if (application.accreditation_status === "approved") {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8"><Notice variant="warning" title="Your account needs attention">Your operator application is approved, but the operator role is not set. Please contact the administrator.</Notice></div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl card-edge bg-surface">
        <div className="bg-daet-forest px-6 py-8 text-white sm:px-10 sm:py-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-daet-sun" /> In review
          </span>
          <h1 className="display-2 mt-4">Pending Approval</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white">Your application is with the Daet Tourism Office. We’ll update this page once the review is complete.</p>
        </div>
        <div className="p-6 sm:p-10">
          <ol className="space-y-5">
            <li className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-100 dark:bg-green-900/40 text-sm font-bold text-green-800 dark:text-green-300">✓</span>
              <div><p className="font-bold">Application submitted</p><p className="mt-1 text-sm text-daet-ink/70">{new Date(application.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</p></div>
            </li>
            <li className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-sm font-bold text-yellow-900 dark:text-yellow-200">2</span>
              <div><p className="font-bold">Tourism Office review</p><p className="mt-1 text-sm leading-6 text-daet-ink/70">Your registration and business permit are checked by an authorized reviewer.</p></div>
            </li>
            <li className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-daet-sand text-sm font-bold text-daet-ink/70">3</span>
              <div><p className="font-bold text-daet-ink/70">Operator dashboard unlocked</p><p className="mt-1 text-sm leading-6 text-daet-ink/70">Package and booking tools are unavailable until accreditation is approved.</p></div>
            </li>
          </ol>
          <div className="mt-8 flex flex-col gap-3 border-t border-daet-ink/10 pt-5 text-sm text-daet-ink/70 sm:flex-row sm:items-center sm:justify-between">
            <p>You can safely close this page. Check back here for your status.</p>
            <OpenChatButton target={{ kind: "operator_admin" }} label="Message the Tourism Office" />
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
