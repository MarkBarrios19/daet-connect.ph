"use server";

import { redirect } from "next/navigation";
import type { AuthActionState } from "@/lib/auth/action-state";
import { fieldErrorsOf, formString, newPasswordSchema } from "@/lib/auth/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Save a new password for the account the reset link signed in.
 *
 * The link proves the address; this only has to prove the visitor can type the
 * same new password twice and that it is not one of the thousand everyone
 * tries. Every other session of that account is signed out at the end: a reset
 * is usually a response to "someone else may be in here".
 */
export async function setNewPassword(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formString(formData, "password"),
    confirm: formString(formData, "confirm"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return { status: "error", message: "This link has expired. Request a new reset link." };
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      console.error("password update failed", error.code, error.message);
      return { status: "error", message: "We could not save that password. Try a different one." };
    }

    // Keep this session (it is the one that just proved the address); end any
    // others, including a stolen one.
    await supabase.auth.signOut({ scope: "others" }).catch((error: unknown) => {
      console.error("could not end other sessions", error);
    });
  } catch (error) {
    console.error("password update threw", error);
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  redirect("/dashboard");
}
