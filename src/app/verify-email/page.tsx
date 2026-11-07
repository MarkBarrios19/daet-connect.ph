import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/ui/auth-shell";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { DEFAULT_AFTER_AUTH, nextPathFrom } from "@/lib/auth/next-cookie";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { ResendVerificationForm } from "./form";

export const metadata: Metadata = { title: "Verify your email" };

type SearchParams = Promise<{ email?: string; next?: string }>;

/**
 * The page a new account waits on. It is also the way back for anyone whose
 * link expired, and the destination of the "ask for a new one" button beside an
 * unverified sign-in.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = nextPathFrom(params.next, DEFAULT_AFTER_AUTH);
  const email = typeof params.email === "string" ? params.email.trim().slice(0, 254) : "";

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    // Signed in already means the address was confirmed: nothing to do here.
    if (data?.user) redirect(safeNextPath(next, DEFAULT_AFTER_AUTH));
  }

  return (
    <PageFrame credits={["bagasbas"]}>
      <AuthShell
        title="Verify your email"
        description="Your account is not active until you open the link we sent you. Enter your address to send it again."
      >
        {isSupabaseConfigured() ? (
          <ResendVerificationForm email={email} next={next} />
        ) : (
          <Notice variant="warning" className="mt-6">
            Email is not available yet. Please contact the Daet Tourism Office.
          </Notice>
        )}
      </AuthShell>
    </PageFrame>
  );
}
