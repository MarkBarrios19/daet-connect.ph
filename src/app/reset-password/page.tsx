import { AuthShell } from "@/components/ui/auth-shell";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) redirect("/forgot-password");

  // Only reachable through the email link, which signs the visitor in briefly.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    redirect("/forgot-password?message=" + encodeURIComponent("That link has expired. Request a new one."));
  }

  return (
    <PageFrame credits={["bagasbas"]}>
      <AuthShell title="Choose a new password" description="You will stay signed in once it is saved.">
        <ResetPasswordForm />
      </AuthShell>
    </PageFrame>
  );
}
