import { NextResponse, type NextRequest } from "next/server";
import { authOrigin } from "@/lib/auth/request";
import { createSupabaseServerClient, type CookieToSet } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * End the session.
 *
 * POST only — a link that signs you out can be planted in any page — and only
 * from our own origin. The session cookies are also SameSite=Lax, so a request
 * from another site arrives without them; this check is the second lock.
 */
export async function POST(request: NextRequest) {
  if (!fromThisSite(request)) {
    return NextResponse.json({ success: false, error: "Cross-site request refused" }, { status: 403 });
  }

  try {
    // The cleared auth cookies come back through this list and are put on the
    // reply, so the browser forgets the session even if the page is not reloaded.
    const written: CookieToSet[] = [];
    const supabase = await createSupabaseServerClient({ onCookiesSet: (list) => written.push(...list) });
    // Ending every session of this account, not only this browser's copy: a
    // shared or lost phone should not keep its access.
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) console.error("sign-out failed", error.code, error.message);

    const response = NextResponse.json({ success: true });
    for (const { name, value, options } of written) response.cookies.set(name, value, options);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("sign-out threw", error);
    return NextResponse.json({ success: false, error: "Sign out failed" }, { status: 500 });
  }
}

function fromThisSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // A browser always sends Origin on a cross-site POST and on same-origin POSTs
  // from fetch; a missing one is a non-browser client, which has no session
  // cookie to protect and nothing to gain.
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(authOrigin(request.headers)).origin;
  } catch {
    return false;
  }
}
