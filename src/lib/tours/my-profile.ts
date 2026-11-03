import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

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
    // The session is already cached for this request; asking it again here
    // would be a second round trip to the auth service on every page.
    const { user } = await getAuthenticatedSession();
    if (!user) return null;

    const supabase = await createSupabaseServerClient();

    const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle();
    return {
      fullName: typeof data?.full_name === "string" ? data.full_name : null,
      avatarUrl: typeof data?.avatar_url === "string" ? data.avatar_url : null,
    };
  } catch (error) {
    console.error("could not read the profile", error);
    return null;
  }
});
