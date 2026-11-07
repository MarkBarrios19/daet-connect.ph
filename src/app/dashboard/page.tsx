import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/lib/tours/dashboards";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";


/** One entry point for every role: sends each user to their own dashboard. */
export default async function DashboardPage() {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect("/login?next=/dashboard");

  if (session.role !== "operator" && session.role !== "guide") redirect(dashboardPath(session.role));

  const supabase = await createSupabaseServerClient();
  const [{ data: operator }, { data: guide }] = await Promise.all([
    supabase.from("tours_operators").select("accreditation_status").eq("profile_id", session.user.id).maybeSingle(),
    supabase.from("tours_guides").select("accreditation_status").eq("profile_id", session.user.id).maybeSingle(),
  ]);
  redirect(dashboardPath(session.role, { operatorStatus: operator?.accreditation_status, guideStatus: guide?.accreditation_status }));
}
