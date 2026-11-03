import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_AFTER_AUTH, NEXT_COOKIE, nextPathFrom } from "@/lib/auth/next-cookie";
import { authOrigin } from "@/lib/auth/request";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient, type CookieToSet } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The link types we accept from the project's email templates. */
const TOKEN_TYPES = ["signup", "email", "invite", "magiclink", "recovery", "email_change"] as const;
type TokenType = (typeof TOKEN_TYPES)[number];

/**
 * Where every link in our emails lands.
 *
 * Two shapes of link are accepted, because they fail in different places:
 *
 * - `?code=…` is what the default templates produce with the PKCE flow. It can
 *   only be exchanged in the browser that started the flow: the verifier that
 *   proves the code is ours is a cookie there.
 * - `?token_hash=…&type=…` is what a template using `{{ .TokenHash }}` gives.
 *   It works on any device, which is why docs/AUTH.md suggests switching the
 *   templates to it.
 *
 * The code or token is exchanged for a session here, on the server, and is
 * never left in the address bar: the visitor is redirected to a same-site page.
 * Anything that is not a session — an expired link, a reused one, a link opened
 * in the wrong browser — ends at the sign-in form with a sentence they can act
 * on, not at an error page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = authOrigin(request.headers);
  const rememberedNext = nextPathFrom(request.cookies.get(NEXT_COOKIE)?.value, DEFAULT_AFTER_AUTH);

  if (!isSupabaseConfigured()) {
    return redirectTo(origin, "/login", "Signing in is not available yet. Please contact the Daet Tourism Office.");
  }

  // Supabase reports a failed verification in the query string rather than by
  // redirecting anywhere else.
  const errorCode = searchParams.get("error_code") ?? searchParams.get("error");
  if (errorCode) {
    console.error("auth callback returned an error", errorCode, searchParams.get("error_description"));
    return failure(origin, rememberedNext);
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = isTokenType(rawType) ? rawType : null;

  const written: CookieToSet[] = [];

  try {
    const supabase = await createSupabaseServerClient({ onCookiesSet: (list) => written.push(...list) });

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("auth code exchange failed", error.code, error.message);
        return failure(origin, rememberedNext);
      }
      return success(origin, rememberedNext, written);
    }

    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) {
        console.error("auth token verification failed", error.code, error.message);
        return failure(origin, type === "recovery" ? "/reset-password" : rememberedNext, type);
      }
      return success(origin, type === "recovery" ? "/reset-password" : rememberedNext, written);
    }

    // A bare visit: not an error, just a link that carried nothing.
    return failure(origin, rememberedNext);
  } catch (error) {
    console.error("auth callback threw", error);
    return failure(origin, rememberedNext);
  }
}

function isTokenType(value: string | null): value is TokenType {
  return value !== null && (TOKEN_TYPES as readonly string[]).includes(value);
}

function success(origin: string, next: string, written: CookieToSet[] = []) {
  const response = NextResponse.redirect(new URL(next, origin));
  // The session cookies this exchange wrote, on the response that carries the
  // redirect: otherwise the browser arrives signed out.
  for (const { name, value, options } of written) response.cookies.set(name, value, options);
  response.cookies.delete(NEXT_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function failure(origin: string, next: string, type: TokenType | null = null) {
  const response =
    type === "recovery" || next.startsWith("/reset-password")
      ? redirectTo(origin, "/forgot-password", "That reset link can no longer be used. Request a new one.")
      : redirectTo(
          origin,
          "/login",
          "That link could not be used in this browser. If you have just confirmed your email, sign in below — otherwise request a new link.",
        );
  response.cookies.delete(NEXT_COOKIE);
  return response;
}

function redirectTo(origin: string, path: string, message?: string) {
  const url = new URL(path, origin);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}
