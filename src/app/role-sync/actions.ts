"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

/**
 * Heals a stale role claim. The header draws its tabs from the token's role,
 * which lags a role change (an admin approving an operator or guide) until the
 * token is refreshed. The browser calls this after the page has loaded, off the
 * request's critical path: if the real role (get_my_role) differs from the one
 * the page showed, refresh the session so the next token carries the new claim.
 *
 * It only ever refreshes the caller's own session; nothing here grants access.
 */
export async function syncRoleClaim(shownRole: string): Promise<{ refreshed: boolean }> {
  try {
    const { user, role, error } = await getAuthenticatedSession();
    if (!user || error) return { refreshed: false };
    if ((role ?? "tourist") === shownRole) return { refreshed: false };

    const supabase = await createSupabaseServerClient();
    const { error: refreshError } = await supabase.auth.refreshSession();
    return { refreshed: !refreshError };
  } catch {
    return { refreshed: false };
  }
}
