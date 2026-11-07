import { AuthShell } from "@/components/ui/auth-shell";
import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getPaymongoConfig } from "@/lib/paymongo/client";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";


type SearchParams = Promise<{ next?: string; message?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-md py-8">
          <Notice variant="warning" title="Supabase setup required">
            Configure Supabase environment variables before signing in.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (data?.user) {
    const params = await searchParams;
    redirect(safeNextPath(params.next));
  }

  const params = await searchParams;
  const nextUrl = safeNextPath(params.next);
  const livePayments = getPaymongoConfig()?.mode === "live";

  return (
    <PageFrame credits={["bagasbas"]}>
      <AuthShell
        title="Sign in"
        description="Sign in to see your bookings and message your guide."
        after={
          livePayments ? null : (
            <Notice variant="info" title="Test environment: no real money" className="mt-4">
              Online payments here use the PayMongo test sandbox (use its test cards and e-wallets), and receipt uploads are for practice. Nothing is charged.
            </Notice>
          )
        }
      >
        <LoginForm nextUrl={nextUrl} notice={params.message?.slice(0, 160)} />
      </AuthShell>
    </PageFrame>
  );
}
