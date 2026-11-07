import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { canAccessOperatorDashboard } from "@/lib/tours/operator-access";
import { OPERATOR_OWN_STATUS_SELECT, OPERATOR_TABLE, OPERATOR_USER_ID_COLUMN } from "@/lib/tours/operator-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OperatorHome } from "./operator-home";


export default async function OperatorDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isSupabaseConfigured()) {
    return <PageFrame><Notice variant="warning" title="Supabase setup is needed">Configure Supabase before opening the operator dashboard.</Notice></PageFrame>;
  }

  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }

  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/dashboard")}`);
  if (session.role === "admin") redirect("/tours/admin/operators");
  if (session.error || !session.role) {
    return <PageFrame><Notice variant="error" title="We could not verify your account">{session.error ?? "Your role could not be verified."}</Notice></PageFrame>;
  }

  const supabase = await createSupabaseServerClient();
  const { data: application, error } = await supabase
    .from(OPERATOR_TABLE)
    .select(OPERATOR_OWN_STATUS_SELECT)
    .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
    .maybeSingle();

  if (error) {
    console.error("Dashboard query error:", error);
    return <PageFrame><Notice variant="error" title="Accreditation could not be checked">Access is paused until your accreditation status can be verified.</Notice></PageFrame>;
  }
  if (!application) redirect("/tours/operator/register");
  if (application.accreditation_status !== "approved") {
    if (application.accreditation_status === "rejected") redirect("/tours/operator/register");
    redirect("/tours/operator/pending");
  }
  if (!canAccessOperatorDashboard(session.role, application.accreditation_status)) {
    return <PageFrame><Notice variant="error" title="Operator access is not enabled">Your accreditation is approved, but the account role does not match. Contact the Tourism Office administrator.</Notice></PageFrame>;
  }

  return <OperatorHome operatorId={application.id} searchParams={await searchParams} />;
}
