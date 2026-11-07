import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAuthUser } from "@/lib/tours/server-auth";

/**
 * The signed-in person's own name and photo, read once per request.
 *
 * The header draws the avatar on every page, so this is one select rather than
 * one per component; `cache()` keeps it to a single round trip even though the
 * header, the tab bar and the page all ask.
 *
 * Both columns are readable through RLS for any signed-in user ("Auth users
 * read all profiles"), and the row is created by the sign-up trigger, so the
 * usual answer is one row and never "missing".
 */
export type MyProfile = { fullName: string | null; avatarUrl: string | null };

export const getMyProfile = cache(async (): Promise<MyProfile | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    // The user is already cached for this request, and only the id is needed,
    // so this does not wait for the role lookup: the two run side by side.
    const user = await getAuthUser();
    if (!user) return null;

    const supabase = await createSupabaseServerClient();

    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    return {
      fullName: typeof data?.full_name === "string" ? data.full_name : null,
      avatarUrl: typeof data?.avatar_url === "string" ? data.avatar_url : null,
    };
  } catch (error) {
    // "This route used cookies" is Next telling the build the page is dynamic,
    // not a failure: it says so itself, once per route.
    // Same for the prerender's own abort (Cache Components), which rejects
    // `cookies()` once the static shell is done.
    const dynamicUsage =
      (error instanceof Error && error.message.includes("Dynamic server usage")) ||
      (error as { digest?: unknown } | null)?.digest === "HANGING_PROMISE_REJECTION";
    if (!dynamicUsage) console.error("could not read the profile", error);
    return null;
  }
});
