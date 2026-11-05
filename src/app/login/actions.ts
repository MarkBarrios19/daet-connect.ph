"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import type { AuthActionState } from "@/lib/auth/action-state";
import { GENERIC_SIGN_IN, isEmailRateLimited, isUnconfirmedEmail } from "@/lib/auth/errors";
import { DEFAULT_AFTER_AUTH, nextPathFrom } from "@/lib/auth/next-cookie";
import { AUTH_LIMITS, takeAttempt, tooManyMessage } from "@/lib/auth/rate-limit";
import { authRequestContext } from "@/lib/auth/request";
import { fieldErrorsOf, formString, signInSchema } from "@/lib/auth/validation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * How long every answer takes. A wrong password, an address with no account
 * and a good sign-in all come back after the same pause, so the form cannot be
 * timed to find out which addresses are registered.
 */
const REPLY_FLOOR_MS = 400;

/**
 * Sign in with a password.
 *
 * Everything the visitor can get wrong is answered with the same sentence, so
 * the form cannot be used to ask "does this address have an account?". The one
 * exception is an account still waiting for its email to be confirmed: that
 * visitor needs a way forward, and they already hold the address.
 */
export async function signInWithPassword(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const startedAt = Date.now();
  const next = nextPathFrom(formString(formData, "next"), DEFAULT_AFTER_AUTH);
  const parsed = signInSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Signing in is not available yet. Please contact the Daet Tourism Office." };
  }

  const { email, password } = parsed.data;
  const { ip } = await authRequestContext();

  // Two windows: one address trying many accounts, and one account tried from
  // many addresses. Both are counted before the password is checked.
  const byIp = takeAttempt(`signin:ip:${ip}`, AUTH_LIMITS.signInIp);
  if (!byIp.ok) return { status: "error", message: tooManyMessage(byIp.retryAfterSeconds) };
  const byEmail = takeAttempt(`signin:email:${hashKey(email)}`, AUTH_LIMITS.signInEmail);
  if (!byEmail.ok) return { status: "error", message: tooManyMessage(byEmail.retryAfterSeconds) };

  const answer = await attempt();
  await minimumWait(startedAt, REPLY_FLOOR_MS);

  if (answer.redirect) redirect(answer.redirect);
  return answer.state;

  async function attempt(): Promise<{ state: AuthActionState; redirect?: string }> {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (isUnconfirmedEmail(error)) {
          return {
            state: {
              status: "unverified",
              email,
              message:
                "This account has not confirmed its email address yet. Open the link we sent you, or ask for a new one.",
            },
          };
        }
        if (isEmailRateLimited(error)) {
          return {
            state: { status: "error", message: "Too many attempts for that address. Please wait a few minutes and try again." },
          };
        }
        console.error("sign-in failed", error.code, error.message);
        return { state: { status: "error", message: GENERIC_SIGN_IN } };
      }

      // A project with confirmation switched off would hand out a session for an
      // unverified address; refuse it here as well as at sign-up.
      if (data.user && !data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        return {
          state: {
            status: "unverified",
            email,
            message:
              "This account has not confirmed its email address yet. Open the link we sent you, or ask for a new one.",
          },
        };
      }

      return { state: { status: "success" }, redirect: next };
    } catch (error) {
      console.error("sign-in threw", error);
      return { state: { status: "error", message: "Sign in failed. Please try again." } };
    }
  }
}

async function minimumWait(startedAt: number, ms: number) {
  const left = ms - (Date.now() - startedAt);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
}

/** Short stable key, so raw addresses do not sit in the limiter's memory. */
function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
