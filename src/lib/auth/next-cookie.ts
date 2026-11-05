import "server-only";
import { cookies } from "next/headers";
import { safeNextPath } from "@/lib/safe-redirect";

/**
 * Where to land after the visitor proves who they are.
 *
 * The page they were on is remembered in a short-lived, http-only cookie rather
 * than carried through the email link: a `?next=` inside a link can be edited
 * by anyone who sees the mail, while the cookie never leaves the browser that
 * asked. The value is still run through `safeNextPath` on the way out, so a
 * cookie cannot send anyone off-site either.
 */
export const NEXT_COOKIE = "daet-auth-next";
export const DEFAULT_AFTER_AUTH = "/dashboard";

const MAX_AGE_SECONDS = 60 * 30;

export async function rememberNextPath(next: string) {
  const cookieStore = await cookies();
  cookieStore.set(NEXT_COOKIE, safeNextPath(next, DEFAULT_AFTER_AUTH), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function nextPathFrom(value: string | undefined, fallback = DEFAULT_AFTER_AUTH): string {
  return safeNextPath(value, fallback);
}
