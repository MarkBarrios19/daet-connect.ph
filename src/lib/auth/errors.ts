/**
 * Turning the auth service's words into ours.
 *
 * Two rules: never repeat a provider message that reveals whether an account
 * exists, and never show a raw internal error to a visitor. Anything we do not
 * recognise becomes one calm sentence, with the detail left in the server log.
 */

export type AuthErrorLike = { message?: string; code?: string; status?: number } | null;

function text(error: AuthErrorLike): string {
  return `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
}

/** The address already has an account (Supabase says so in several ways). */
export function isAlreadyRegistered(error: AuthErrorLike): boolean {
  const value = text(error);
  return value.includes("already registered") || value.includes("user_already_exists") || value.includes("email_exists");
}

/** The account exists but has not clicked its confirmation link yet. */
export function isUnconfirmedEmail(error: AuthErrorLike): boolean {
  const value = text(error);
  return value.includes("email not confirmed") || value.includes("email_not_confirmed") || value.includes("not confirmed");
}

/** The mailer is being hammered; Supabase refuses to send another message. */
export function isEmailRateLimited(error: AuthErrorLike): boolean {
  const value = text(error);
  return value.includes("over_email_send_rate_limit") || value.includes("rate limit") || value.includes("too many requests");
}

export const GENERIC_SIGN_IN = "That email and password do not match an account.";

export function signUpErrorMessage(error: AuthErrorLike): string {
  if (isEmailRateLimited(error)) {
    return "We have sent a lot of email to that address in the last hour. Wait a little, then try again.";
  }
  const value = text(error);
  if (value.includes("password")) return "That password was not accepted. Choose a longer one, or one that is not common.";
  if (value.includes("email") && value.includes("invalid")) return "That email address was not accepted. Check it and try again.";
  if (value.includes("signups not allowed") || value.includes("signup") && value.includes("disabled")) {
    return "Sign-ups are closed right now. Please contact the Daet Tourism Office.";
  }
  return "We could not create the account just now. Please try again in a moment.";
}
