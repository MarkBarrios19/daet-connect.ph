import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { timed } from "@/lib/server-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthenticatedSession = {
  user: User | null;
  role: string | null;
  error: string | null;
};

export function normalizeRole(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().toLowerCase() || null;
  }

  if (Array.isArray(value) && value.length > 0) {
    return normalizeRole(value[0]);
  }

  if (value && typeof value === "object" && "role" in value) {
    return normalizeRole((value as { role?: unknown }).role);
  }

  return null;
}

/**
 * The signed-in user, checked with Supabase Auth once per request.
 *
 * Each call to `auth.getUser()` is a round trip to the auth service, and a page
 * used to make three or four of them (the page, the header, the profile, the
 * bell). Everything on the server asks here instead, so they share one.
 */
export const getAuthUser = cache(async function getAuthUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await timed("auth", () => supabase.auth.getUser());
  return error || !user ? null : user;
});

/**
 * Always obtains the user from Supabase Auth and reads the role server-side.
 * Cached per request so the page frame and the page share one lookup.
 */
export const getAuthenticatedSession = cache(async function getAuthenticatedSession(): Promise<AuthenticatedSession> {
  const user = await getAuthUser();

  if (!user) {
    return { user: null, role: null, error: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data: roleData, error: roleError } = await timed("role", async () => supabase.rpc("get_my_role"));
  if (roleError) {
    return {
      user,
      role: null,
      error: "Your account role could not be verified. Please try again later.",
    };
  }

  return { user, role: normalizeRole(roleData), error: null };
});

/**
 * The role claim the Custom Access Token hook adds to the JWT
 * (supabase/migrations/20261125_role_access_token_hook.sql).
 */
export const ROLE_CLAIM = "app_role";
const KNOWN_ROLES = ["tourist", "operator", "guide", "admin"];

/**
 * The role in a verified claims object, or null when it should not be trusted
 * as a display hint: no claim (hook not enabled), a value that is not one of
 * the roles the app knows, or a token that is not for this user.
 */
export function roleFromClaims(claims: unknown, userId: string): string | null {
  if (!claims || typeof claims !== "object") return null;
  const c = claims as Record<string, unknown>;
  if (c.sub !== userId) return null;
  const role = typeof c[ROLE_CLAIM] === "string" ? normalizeRole(c[ROLE_CLAIM]) : null;
  return role && KNOWN_ROLES.includes(role) ? role : null;
}

export type DisplaySession = AuthenticatedSession & {
  /** Where `role` came from: the token claim (may be stale) or get_my_role(). */
  roleSource: "claim" | "rpc" | "none";
};

/**
 * The signed-in user and a role good enough to DRAW the header's tabs.
 *
 * The role comes from the verified token's `app_role` claim when there is one,
 * which saves the get_my_role round trip. A claim is as old as the token, so it
 * can lag behind a role change by up to the JWT lifetime. That is fine for
 * choosing tabs and wrong for anything else:
 *
 *   NEVER use this to allow a privileged read, write, page or route. Use
 *   getAuthenticatedSession(), which always asks get_my_role().
 *
 * When the claim is missing or not trustworthy (hook not enabled yet, an unknown
 * value, another user's token) this is exactly getAuthenticatedSession().
 */
export const getDisplaySession = cache(async function getDisplaySession(): Promise<DisplaySession> {
  const user = await getAuthUser();
  if (!user) return { user: null, role: null, error: null, roleSource: "none" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const role = roleFromClaims(data?.claims, user.id);
    if (role) return { user, role, error: null, roleSource: "claim" };
  } catch {
    // Fall through to the authoritative lookup.
  }

  return { ...(await getAuthenticatedSession()), roleSource: "rpc" };
});
