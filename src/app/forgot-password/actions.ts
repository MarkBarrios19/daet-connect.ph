"use server";

import type { AuthActionState } from "@/lib/auth/action-state";
import { rememberNextPath } from "@/lib/auth/next-cookie";
import { AUTH_LIMITS, takeAttempt, tooManyMessage } from "@/lib/auth/rate-limit";
import { authCallbackUrl, authRequestContext } from "@/lib/auth/request";
import { emailOnlySchema, fieldErrorsOf, formString } from "@/lib/auth/validation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Send a password-reset link.
 *
 * The answer is the same whether or not the address has an account, so this
 * form cannot be used to find out who is registered. The link is built from the
 * request's own origin, never from the submitted form, so a crafted request
 * cannot point the reset at another site.
 */
export async function requestPasswordReset(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = emailOnlySchema.safeParse({ email: formString(formData, "email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Password reset is not available yet. Please contact the Daet Tourism Office." };
  }

  const { email } = parsed.data;
  const { ip, origin } = await authRequestContext();

  const byIp = takeAttempt(`reset:ip:${ip}`, AUTH_LIMITS.resetIp);
  if (!byIp.ok) return { status: "error", message: tooManyMessage(byIp.retryAfterSeconds) };
  const byEmail = takeAttempt(`reset:email:${email}`, AUTH_LIMITS.resetEmail);
  if (!byEmail.ok) return { status: "error", message: tooManyMessage(byEmail.retryAfterSeconds) };

  try {
    // Where the reset form should open once the link is used: a cookie of this
    // browser, not a parameter the link carries.
    await rememberNextPath("/reset-password");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authCallbackUrl(origin) });
    if (error) console.error("password reset request failed", error.code, error.message);
  } catch (error) {
    console.error("password reset request threw", error);
  }

  return {
    status: "success",
    email,
    message: "If that email has an account, a reset link is on its way. It can take a few minutes to arrive.",
  };
}
