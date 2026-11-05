/**
 * What the sign-in and sign-up forms show after an attempt. `fieldErrors` puts
 * a message beside the input it came from; `status` decides which panel the
 * form renders, so a "check your email" state cannot be mistaken for an error.
 */
export type AuthStatus = "idle" | "error" | "check-email" | "unverified" | "success";

export type AuthActionState = {
  status: AuthStatus;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so the "resend the link" button can prefill it. */
  email?: string;
};

export const INITIAL_AUTH_STATE: AuthActionState = { status: "idle" };
