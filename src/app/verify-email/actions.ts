"use server";

import type { AuthActionState } from "@/lib/auth/action-state";
import { DEFAULT_AFTER_AUTH, nextPathFrom, rememberNextPath } from "@/lib/auth/next-cookie";
import { AUTH_LIMITS, takeAttempt, tooManyMessage } from "@/lib/auth/rate-limit";
import { authCallbackUrl, authRequestContext } from "@/lib/auth/request";
import { emailOnlySchema, fieldErrorsOf, formString } from "@/lib/auth/validation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Send the confirmation email again.
 *
 * The answer never depends on what the address is: someone who mistyped it, an
 * address waiting its first link, one that is already confirmed and one that
 * does not exist all hear the same sentence. Otherwise this button would be a
 * cheaper way to ask "who is registered here?" than the sign-in form.
 */
export async function resendVerification(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const next = nextPathFrom(formString(formData, "next"), DEFAULT_AFTER_AUTH);
  const parsed = emailOnlySchema.safeParse({ email: formString(formData, "email") });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Email is not available yet. Please contact the Daet Tourism Office." };
  }

  const { email } = parsed.data;
  const { ip, origin } = await authRequestContext();

  const byIp = takeAttempt(`resend:ip:${ip}`, AUTH_LIMITS.resendIp);
  if (!byIp.ok) return { status: "error", message: tooManyMessage(byIp.retryAfterSeconds) };
  const byEmail = takeAttempt(`resend:email:${email}`, AUTH_LIMITS.resendEmail);
  if (!byEmail.ok) return { status: "error", message: tooManyMessage(byEmail.retryAfterSeconds) };

  const sent = {
    status: "success" as const,
    email,
    message: `If ${email} is waiting to be confirmed, a new link is on its way. It can take a few minutes to arrive — check the spam folder too.`,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authCallbackUrl(origin) },
    });

    // "Already confirmed", "no such user" and "rate limited by Supabase" are
    // all logged, never shown.
    if (error) console.error("resend failed", error.code, error.message);
    await rememberNextPath(next);
  } catch (error) {
    console.error("resend threw", error);
  }

  return sent;
}
