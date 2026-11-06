"use server";

import { DEFAULT_AFTER_AUTH, nextPathFrom, rememberNextPath } from "@/lib/auth/next-cookie";
import { authCallbackUrl, authRequestContext } from "@/lib/auth/request";
import { AUTH_LIMITS, takeAttempt, tooManyMessage } from "@/lib/auth/rate-limit";
import type { ZodError } from "zod";
import { fieldErrorsOf, formString, signUpSchema } from "@/lib/auth/validation";
import { isAlreadyRegistered, signUpErrorMessage } from "@/lib/auth/errors";
import type { AuthActionState } from "@/lib/auth/action-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Create an account — and do not sign it in.
 *
 * The account stays unusable until the visitor opens the link Supabase emails
 * them, so an address cannot be claimed by whoever types it first. The old
 * version signed the new account in immediately, which only worked because the
 * project had email confirmation switched off; that combination meant anyone
 * could register `someone@else.ph` and use the site as them.
 *
 * The reply is the same whether the address was free or already registered: a
 * form that says "that email is taken" is an account-enumeration oracle.
 */
export async function signUpWithPassword(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const next = nextPathFrom(formString(formData, "next"), DEFAULT_AFTER_AUTH);
  const parsed = signUpSchema.safeParse({
    fullName: formString(formData, "fullName"),
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    confirm: formString(formData, "confirm"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: fieldsOrFallback(parsed.error),
    };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Sign-ups are not available yet. Please contact the Daet Tourism Office." };
  }

  const { ip, origin } = await authRequestContext();
  const allowed = takeAttempt(`signup:ip:${ip}`, AUTH_LIMITS.signUpIp);
  if (!allowed.ok) return { status: "error", message: tooManyMessage(allowed.retryAfterSeconds) };

  const { fullName, email, password } = parsed.data;
  // The one answer for "link sent" and "that address already has an account".
  const checkInbox = (): AuthActionState => ({
    status: "check-email",
    email,
    message: `Open the link we sent to ${email} to finish creating your account. If that address already had an account, nothing was changed — sign in instead.`,
  });

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        // One callback for every email the project sends; where to go next
        // rides in a cookie of this browser, never in the link.
        emailRedirectTo: authCallbackUrl(origin),
      },
    });

    if (error) {
      if (isAlreadyRegistered(error)) return checkInbox();
      console.error("sign-up failed", error.code, error.message);
      return { status: "error", message: signUpErrorMessage(error) };
    }

    // Supabase hands back a session only when the project has email
    // confirmation switched off. Accepting it would defeat the point of this
    // page, so the session is thrown away and the misconfiguration surfaced.
    if (data.session) {
      await supabase.auth.signOut();
      console.error("sign-up returned a session: email confirmation is disabled in Supabase");
      return {
        status: "error",
        message:
          "Accounts on this site must confirm their email address first, but the project is not asking for that. Please tell the Daet Tourism Office (email confirmation is switched off in Supabase).",
      };
    }

    // An address that already exists comes back as a user with no identities:
    // no message was sent, and the answer stays the same.
    if (!data.user) {
      console.error("sign-up returned neither a user nor an error");
      return { status: "error", message: "We could not create the account just now. Please try again in a moment." };
    }

    await rememberNextPath(next);
    return checkInbox();
  } catch (error) {
    console.error("sign-up threw", error);
    return { status: "error", message: "We could not create the account just now. Please try again in a moment." };
  }
}

/** Field messages, with a general one if the failure was not tied to a field. */
function fieldsOrFallback(error: ZodError): Record<string, string> {
  const fields = fieldErrorsOf(error);
  return Object.keys(fields).length > 0 ? fields : { email: "Check your details and try again." };
}
