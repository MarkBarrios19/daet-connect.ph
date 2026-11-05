import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { GUIDE_NOTES_COLUMN, GUIDE_OWN_STATUS_SELECT, GUIDE_TABLE, GUIDE_USER_ID_COLUMN } from "@/lib/tours/guide-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GuidePendingPage() {
  if (!isSupabaseConfigured()) return <PageFrame><Notice variant="warning" title="Supabase setup is needed">Configure Supabase to view guide application status.</Notice></PageFrame>;

  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }
  if (!session.user) {
    return <PageFrame><div className="mx-auto max-w-xl py-8"><Notice variant="info" title="Sign in to view your application"><Link href={`/login?next=${encodeURIComponent("/tours/guide/pending")}`} className="font-bold underline underline-offset-4">Sign in</Link> to the account used for your guide application.</Notice></div></PageFrame>;
  }
  if (session.error || !session.role) return <PageFrame><div className="mx-auto max-w-xl py-8"><Notice variant="error" title="We could not verify your account">{session.error ?? "Your account role is missing."}</Notice></div></PageFrame>;
  if (session.role === "admin") redirect("/tours/admin/guides");
  if (session.role !== "tourist" && session.role !== "guide") {
    return <PageFrame><div className="mx-auto max-w-xl py-8"><Notice variant="warning" title="This account cannot view guide applications">Sign in with the account used to submit the guide application.</Notice></div></PageFrame>;
  }

  const supabase = await createSupabaseServerClient();
  const { data: guide, error } = await supabase
    .from(GUIDE_TABLE)
    .select(GUIDE_OWN_STATUS_SELECT)
    .eq(GUIDE_USER_ID_COLUMN, session.user.id)
    .maybeSingle();
  if (error) return <PageFrame><div className="mx-auto max-w-xl py-8"><Notice variant="error" title="Status could not be loaded">Refresh in a moment. Your ID document remains private.</Notice></div></PageFrame>;
  if (!guide) redirect("/tours/guide/register");
  if (guide.accreditation_status === "approved" && session.role === "guide") redirect("/tours/guide/dashboard");
  if (guide.accreditation_status === "approved") return <PageFrame><div className="mx-auto max-w-xl py-8"><Notice variant="warning" title="Your guide account needs attention">Your guide record is approved, but the account role is not set. Contact the Tourism Office.</Notice></div></PageFrame>;

  if (guide.accreditation_status === "rejected") {
    return (
      <PageFrame>
        <section className="mx-auto max-w-2xl rounded-2xl border-red-200 dark:border-red-700 bg-surface p-6 sm:p-10">
          <span className="inline-flex rounded-full bg-red-50 dark:bg-red-950/40 px-3 py-1 text-xs font-bold text-red-700 dark:text-red-300">Changes requested</span>
          <h1 className="display-2 mt-4 text-daet-ink">Please update your guide application</h1>
          <p className="mt-3 text-sm leading-6 text-daet-ink/70">The Tourism Office could not approve the application as submitted. Review the note below and send an updated profile and ID.</p>
          {guide[GUIDE_NOTES_COLUMN] ? <div className="mt-5 rounded-2xl bg-red-50 dark:bg-red-950/40 p-4 text-sm leading-6 text-red-950 dark:text-red-300"><p className="font-bold">Reviewer’s note</p><p className="mt-1">{guide[GUIDE_NOTES_COLUMN]}</p></div> : null}
          <Link href="/tours/guide/register" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-blue-700">Update application</Link>
        </section>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl card-edge bg-surface">
        <div className="bg-daet-forest px-6 py-8 text-white sm:px-10 sm:py-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-daet-sun" /> In review</span>
          <h1 className="display-2 mt-4">Pending Approval</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white">Your guide profile and private ID verification are with the Daet Tourism Office.</p>
        </div>
        <div className="p-6 sm:p-10">
          <ol className="space-y-5">
            <li className="flex gap-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-100 dark:bg-green-900/40 text-sm font-bold text-green-800 dark:text-green-300">✓</span><div><p className="font-bold">Application submitted</p><p className="mt-1 text-sm text-daet-ink/70">{new Date(guide.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" })}</p></div></li>
            <li className="flex gap-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-sm font-bold text-yellow-900 dark:text-yellow-200">2</span><div><p className="font-bold">Tourism Office review</p><p className="mt-1 text-sm leading-6 text-daet-ink/70">Your public profile and ID document are reviewed separately and securely.</p></div></li>
            <li className="flex gap-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-daet-sand text-sm font-bold text-daet-ink/70">3</span><div><p className="font-bold text-daet-ink/70">Guide dashboard and badge QR unlocked</p><p className="mt-1 text-sm leading-6 text-daet-ink/70">No active badge QR or dashboard access is available before approval.</p></div></li>
          </ol>
          <div className="mt-8 border-t border-daet-ink/10 pt-5 text-sm text-daet-ink/70">You can close this page and check back later.</div>
        </div>
      </section>
    </PageFrame>
  );
}
