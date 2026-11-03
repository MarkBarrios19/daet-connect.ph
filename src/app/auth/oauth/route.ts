import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_AFTER_AUTH, NEXT_COOKIE } from "@/lib/auth/next-cookie";
import { AUTH_LIMITS, takeAttempt, tooManyMessage } from "@/lib/auth/rate-limit";
import { authCallbackUrl, clientIp, requestOrigin } from "@/lib/auth/request";
import { safeNextPath } from "@/lib/safe-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient, type CookieToSet } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Start "Continue with Google".
 *
 * A GET, because it is a navigation: the browser leaves this site for Google's
 * account chooser, and Supabase's PKCE flow protects the way back. The page the
 * visitor was on is kept in a short-lived cookie — never in the OAuth redirect
 * URL, which has to match the project's allow list exactly.
 */
export async function GET(request: NextRequest) {
  // The origin the visitor is on, not the configured app address: the PKCE
  // verifier this flow writes is a cookie for this host, so the code has to come
  // back to it. Sending it to another address of the same site — which is what
  // NEXT_PUBLIC_APP_URL does when it names a different alias — left every
  // exchange without a verifier, and Google sign-in "did not work" (round 47).
  const origin = requestOrigin(request.headers);
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), DEFAULT_AFTER_AUTH);

  if (!isSupabaseConfigured()) {
    return backToSignIn(origin, "Google sign-in is not available yet. Please use your email and password.");
  }

  const allowed = takeAttempt(`oauth:ip:${clientIp(request.headers)}`, AUTH_LIMITS.oauthIp);
  if (!allowed.ok) return backToSignIn(origin, tooManyMessage(allowed.retryAfterSeconds));

  // The PKCE verifier this call writes is what proves the callback belongs to
  // this browser, so it has to travel on the redirect we return.
  const written: CookieToSet[] = [];
  const supabase = await createSupabaseServerClient({ onCookiesSet: (list) => written.push(...list) });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authCallbackUrl(origin),
      skipBrowserRedirect: true,
      // Let a shared device pick which account to use, instead of silently
      // reusing the last person's Google session.
      queryParams: { prompt: "select_account" },
      scopes: "openid email profile",
    },
  });

  if (error || !data?.url) {
    console.error("google sign-in could not start", error?.code, error?.message);
    return backToSignIn(
      origin,
      "Google sign-in is not available right now. Please use your email and password, or try again in a moment.",
    );
  }

  // Only ever hand the browser to the auth service we are configured against.
  if (!sameAuthService(data.url)) {
    console.error("google sign-in returned a URL outside the configured Supabase project");
    return backToSignIn(origin, "Google sign-in is not available right now. Please try again in a moment.");
  }

  const response = NextResponse.redirect(data.url);
  for (const { name, value, options } of written) response.cookies.set(name, value, options);
  response.cookies.set({
    name: NEXT_COOKIE,
    value: next,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function sameAuthService(url: string): boolean {
  try {
    return new URL(url).origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return false;
  }
}

function backToSignIn(origin: string, message: string) {
  return NextResponse.redirect(new URL(`/login?message=${encodeURIComponent(message)}`, origin));
}
