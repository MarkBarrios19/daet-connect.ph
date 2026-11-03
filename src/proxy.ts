import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase auth session on every page request.
 *
 * Server Components cannot write cookies, so without this an expired access
 * token is never replaced and users appear signed out at random (Server
 * Actions then see `user = null`). Authorization still happens in each page
 * and action; this only keeps the session cookie fresh.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  // A sign-in code that arrives at the site's root is still a sign-in this
  // browser can finish: Supabase falls back to the project's Site URL when it
  // will not accept the address it was handed, and the code lands on `/`. The
  // verifier that proves the code is ours is a cookie here, so hand it to the
  // route that exchanges it instead of dropping the visitor home signed out with
  // nothing to read.
  const code = request.nextUrl.searchParams.get("code");
  if (code && request.nextUrl.pathname === "/" && hasSignInVerifier(request)) {
    const exchange = new URL("/auth/callback", request.nextUrl.origin);
    exchange.searchParams.set("code", code);
    return NextResponse.redirect(exchange);
  }

  // The auth routes end or replace the session themselves, and a silent refresh
  // in front of them fights that: on `POST /auth/logout` the refresh wrote a
  // fresh session cookie onto the same response the route was deleting it from,
  // so the browser kept a session the visitor had just ended. They are left
  // alone here; the page they redirect to is refreshed as usual.
  if (/^\/auth\/(oauth|callback|logout)$/.test(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  const { url, anonKey } = getSupabasePublicConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not run code between createServerClient and getUser(): getUser()
  // validates the token with Supabase Auth and triggers the refresh.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, the service worker, and endpoints called by servers (no user session).
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|api/webhooks|api/notifications/push|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ics|mjs)$).*)",
  ],
};

/** `sb-<ref>-auth-token-code-verifier`, the cookie that binds a code to a browser. */
function hasSignInVerifier(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => /^sb-.*-auth-token-code-verifier$/.test(name));
}
