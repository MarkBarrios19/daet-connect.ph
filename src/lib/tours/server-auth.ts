import "server-only";
import { cache } from "react";
import type { JwtPayload, User } from "@supabase/supabase-js";
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
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return userFromClaims(data.claims);
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
  } = await supabase.auth.getUser();
  return error || !user ? null : user;
});

async function loadSession(user: AuthUser | null): Promise<AuthenticatedSession> {
  if (!user) {
    return { user: null, role: null, error: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data: roleData, error: roleError } = await supabase.rpc("get_my_role");
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
