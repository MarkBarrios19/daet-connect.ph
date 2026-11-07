import "server-only";
import { cache } from "react";
import type { JwtPayload, User } from "@supabase/supabase-js";
import { timed } from "@/lib/server-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthenticatedSession = {
  user: AuthUser | null;
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
 * The identity a read needs: who is signed in, and the profile fields the JWT
 * carries. It is what `getAuthUser` returns; anything beyond these fields
 * (`identities`, `email_confirmed_at`, ...) is not in the access token and has
 * to come from `getVerifiedUser`.
 */
export type AuthUser = Pick<User, "id" | "aud" | "role" | "email" | "phone" | "app_metadata" | "user_metadata" | "is_anonymous">;

/**
 * The signed-in user, from the verified claims of the access token.
 *
 * `auth.getClaims()` checks the token's signature against the project's cached
 * public keys, so no request leaves the server (the proxy has already
 * refreshed an expiring token). If the project signs with a shared secret
 * (HS256) the client falls back to asking Supabase Auth, as `getUser()` does,
 * so this is never less safe, only sometimes not faster.
 *
 * What it does not see: a session revoked or a user deleted or banned since the
 * token was issued stays valid here until the token expires (an hour by
 * default). That is fine for rendering a page or header. Anything that WRITES
 * on behalf of the user must use `getVerifiedUser` / `getVerifiedSession`.
 */
export const getAuthUser = cache(async function getAuthUser(): Promise<AuthUser | null> {
  const claims = await getVerifiedClaims();
  return claims ? userFromClaims(claims) : null;
});

/** The access token's claims after verification, once per request; null when signed out or unverifiable. */
const getVerifiedClaims = cache(async function getVerifiedClaims(): Promise<JwtPayload | null> {
  const supabase = await createSupabaseServerClient();
  try {
    const { data, error } = await timed("auth", () => supabase.auth.getClaims());
    return error || !data?.claims?.sub ? null : data.claims;
  } catch {
    return null;
  }
});

/** Maps verified access-token claims to the user shape callers read. */
export function userFromClaims(claims: JwtPayload): AuthUser {
  return {
    id: claims.sub,
    aud: Array.isArray(claims.aud) ? (claims.aud[0] ?? "") : (claims.aud ?? ""),
    role: claims.role,
    email: claims.email || undefined,
    phone: claims.phone || undefined,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    is_anonymous: claims.is_anonymous,
  };
}

/**
 * The signed-in user, checked with Supabase Auth over the network (once per
 * request). Use it where a stale token must not be honoured — server actions
 * and route handlers that write — or where a field outside the access token
 * is needed (`identities`, `email_confirmed_at`).
 */
export const getVerifiedUser = cache(async function getVerifiedUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await timed("auth", () => supabase.auth.getUser());
  return error || !user ? null : user;
});

async function loadSession(user: AuthUser | null): Promise<AuthenticatedSession> {
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
}

/**
 * The signed-in user (from token claims) and their role (read server-side).
 * Cached per request so the page frame and the page share one lookup. For
 * rendering only; writes use `getVerifiedSession`.
 */
export const getAuthenticatedSession = cache(async function getAuthenticatedSession(): Promise<AuthenticatedSession> {
  return loadSession(await getAuthUser());
});

/**
 * Like `getAuthenticatedSession`, but the user is confirmed with Supabase Auth
 * rather than trusted from the token. For server actions and route handlers
 * that write.
 */
export const getVerifiedSession = cache(async function getVerifiedSession(): Promise<AuthenticatedSession> {
  return loadSession(await getVerifiedUser());
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
 *   getVerifiedSession(), which confirms the user and always asks get_my_role().
 *
 * When the claim is missing or not trustworthy (hook not enabled yet, an unknown
 * value, another user's token) this is exactly getAuthenticatedSession().
 */
export const getDisplaySession = cache(async function getDisplaySession(): Promise<DisplaySession> {
  const user = await getAuthUser();
  if (!user) return { user: null, role: null, error: null, roleSource: "none" };

  const role = roleFromClaims(await getVerifiedClaims(), user.id);
  if (role) return { user, role, error: null, roleSource: "claim" };

  return { ...(await getAuthenticatedSession()), roleSource: "rpc" };
});
