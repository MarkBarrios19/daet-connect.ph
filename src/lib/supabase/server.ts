import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/env";

export type CookieToSet = { name: string; value: string; options?: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2] };

/**
 * A request-scoped Supabase client.
 *
 * `onCookiesSet` exists for the route handlers that build their own response —
 * the OAuth start, the email-link callback and sign-out. They have to run the
 * auth call before they know where to redirect to, so they hand the cookies
 * they were given to the response they finally return. Without this, an
 * exchange could succeed and still leave the browser with no session.
 */
export async function createSupabaseServerClient(
  { onCookiesSet }: { onCookiesSet?: (cookiesToSet: CookieToSet[]) => void } = {},
) {
  const { url, anonKey } = getSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        onCookiesSet?.(cookiesToSet);
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always mutate cookies. Server Actions and
          // middleware can refresh them; reading the current request still works.
        }
      },
    },
  });
}
