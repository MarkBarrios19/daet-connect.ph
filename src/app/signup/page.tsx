import { AuthShell } from "@/components/ui/auth-shell";
import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { SignupForm } from "./signup-form";


export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const nextUrl = safeNextPath((await searchParams).next);
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-md py-8">
          <Notice variant="warning" title="Supabase setup required">
            Configure Supabase environment variables before creating an account.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data?.user) {
    redirect(nextUrl);
  }

  return (
    <PageFrame credits={["bagasbas"]}>
      <AuthShell title="Create account" description="Create an account to book trips, message your guide and keep your tickets in one place.">
        <SignupForm nextUrl={nextUrl} />
      </AuthShell>
    </PageFrame>
  );
}
