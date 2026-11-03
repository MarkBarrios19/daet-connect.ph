import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, type CookieToSet } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * End the session.
 *
 * POST only — a link that signs you out can be planted in any page — and only
 * from this site. SameSite=Lax already keeps a cross-site POST from carrying the
 * cookies, so this check is the second lock, and it is deliberately about the
 * host and not the scheme: a preview deployment, a LAN address and a custom
 * domain are all the same site, and a comparison of full origins signed people
 * out of nothing at all.
 */
export async function POST(request: NextRequest) {
  if (!fromThisSite(request)) {
    return NextResponse.json({ success: false, error: "Cross-site request refused" }, { status: 403 });
  }

  try {
    // The cleared auth cookies come back through this list and are put on the
    // reply, so the browser forgets the session even if the page is not reloaded.
    const written: CookieToSet[] = [];
    const onCookiesSet = (list: CookieToSet[]) => written.push(...list);
    const supabase = await createSupabaseServerClient({ onCookiesSet });

    // Ending every session of this account, not only this browser's copy: a
    // shared or lost phone should not keep its access.
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      // The auth service could not be reached or refused. The visitor asked to
      // be signed out, so the session in this browser ends regardless — that
      // costs nothing and is the half of the request we can always honour.
      console.error("global sign-out failed, ending the local session instead", error.code, error.message);
      await supabase.auth.signOut({ scope: "local" });
    }

    const response = NextResponse.json({ success: true });
    for (const { name, value, options } of written) response.cookies.set(name, value, options);
    // Whatever the auth client knows about, every session cookie this request
    // carried is expired as well — a cookie written with a Domain attribute by
    // an older deployment is a different cookie from a host-only one, and
    // "signed out but still signed in" is a miserable thing to debug.
    clearSessionCookies(request, response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("sign-out threw", error);
    return NextResponse.json({ success: false, error: "Sign out failed" }, { status: 500 });
  }
}

/** `sb-<ref>-auth-token` and its chunked `.0`, `.1` forms. */
const SESSION_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;

function clearSessionCookies(request: NextRequest, response: NextResponse) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  const hostPart = host.split(":")[0];
  const domainAllowed = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(hostPart);

  for (const cookie of request.cookies.getAll()) {
    if (!SESSION_COOKIE.test(cookie.name)) continue;
    response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    if (domainAllowed) response.cookies.set(cookie.name, "", { maxAge: 0, path: "/", domain: hostPart });
  }
}

/**
 * Is this POST from a page of this site?
 *
 * The hosts we accept are the ones this request actually arrived on — a proxy
 * forwards the original in `x-forwarded-host`, a direct request carries it in
 * `host` — plus the configured site, if any. Only the host is compared: an
 * `http://` LAN address and an `https://` deployment of the same host are the
 * same site, and a scheme guess is exactly how this check went wrong before.
 */
function fromThisSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // A browser sends Origin on a same-origin fetch, and on every cross-site POST.
  // A missing one is a non-browser client: it carries no session cookie, so
  // there is nothing here to protect from it.
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (!originHost) return false;

  const allowed = new Set<string>();
  const add = (value: string | null | undefined) => {
    const first = value?.split(",")[0]?.trim();
    if (!first) return;
    try {
      allowed.add(new URL(first.includes("://") ? first : `https://${first}`).host);
    } catch {
      // Not a host we can read; it simply grants nothing.
    }
  };

  add(request.headers.get("x-forwarded-host"));
  add(request.headers.get("host"));
  add(request.nextUrl.host);
  add(process.env.NEXT_PUBLIC_APP_URL);

  return allowed.has(originHost);
}
