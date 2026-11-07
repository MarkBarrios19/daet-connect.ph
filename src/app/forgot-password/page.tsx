import { AuthShell } from "@/components/ui/auth-shell";
import type { Metadata } from "next";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  return (
    <PageFrame credits={["bagasbas"]}>
      <AuthShell title="Reset your password" description="Enter your email and we will send you a link to choose a new password.">
        {isSupabaseConfigured() ? (
          <ForgotPasswordForm notice={message?.slice(0, 160)} />
        ) : (
          <Notice variant="warning" className="mt-6">
            Password reset is not available yet. Please contact the Daet Tourism Office.
          </Notice>
        )}
      </AuthShell>
    </PageFrame>
  );
}
