"use server";

import { revalidatePath } from "next/cache";
import type { AuthActionState } from "@/lib/auth/action-state";
import { isEmailRateLimited } from "@/lib/auth/errors";
import { AUTH_LIMITS, takeAttempt, tooManyMessage } from "@/lib/auth/rate-limit";
import { authCallbackUrl, authRequestContext } from "@/lib/auth/request";
import { rememberNextPath } from "@/lib/auth/next-cookie";
import { changePasswordSchema, fieldErrorsOf, formString, profileNameSchema } from "@/lib/auth/validation";
import {
  AVATAR_BUCKET,
  avatarKeyFromUrl,
  avatarObjectKey,
  checkAvatarUpload,
} from "@/lib/profile/avatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

/**
 * The account page's four actions: a new name, a new photo, a new password, and
 * a reset link for the password nobody remembers.
 *
 * All four read the person from the session and never from the form, so a
 * crafted post can only ever change the account it was sent with. The photo and
 * the password are checked here rather than in the browser: a Server Action can
 * be posted to directly, and the browser's checks are a convenience.
 */

const GENERIC_SAVE_FAILURE = "We could not save that just now. Please try again.";

/** The photo a row holds right now, so a replacement can remove the old file. */
async function currentAvatarUrl(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data } = await supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle();
  return typeof data?.avatar_url === "string" ? data.avatar_url : null;
}

/**
 * Save the name the person typed.
 *
 * Both records are written: `user_metadata.full_name`, which the auth service
 * hands back with the session, and `public.profiles.full_name`, which bookings,
 * rosters and messages read. Sign-up has always written only the first, which
 * is why seven of the ten profiles had no name at all.
 */
export async function updateName(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = profileNameSchema.safeParse({ fullName: formString(formData, "fullName") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check your name and try again.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const { user } = await getAuthenticatedSession();
  if (!user) return { status: "error", message: "Your session has ended. Sign in again." };

  try {
    const supabase = await createSupabaseServerClient();
    const { fullName } = parsed.data;

    const { error: metaError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (metaError) {
      console.error("profile name: metadata update failed", metaError.code, metaError.message);
      return { status: "error", message: GENERIC_SAVE_FAILURE };
    }

    // `.select()` is what tells us a row was actually written: an update that
    // matches nothing is a silent no-op otherwise, and the page would lie.
    const { data: rows, error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id).select("id");
    if (error || !rows || rows.length === 0) {
      console.error("profile name: profile row update failed", error?.code, error?.message, rows?.length);
      return { status: "error", message: GENERIC_SAVE_FAILURE };
    }

    revalidatePath("/", "layout");
    return { status: "success", message: "Your name is saved." };
  } catch (error) {
    console.error("profile name: threw", error);
    return { status: "error", message: GENERIC_SAVE_FAILURE };
  }
}

/**
 * Save a new photo.
 *
 * The bytes are checked for what they are, not for what the upload claims to be
 * (a `.jpg` that is really an HTML page is the oldest trick there is). The key
 * is built here from the session's user id and a stamp, so a replaced photo
 * appears at once instead of after the CDN's cache expires, and the file it
 * replaces is removed.
 */
export async function saveAvatar(formData: FormData): Promise<AuthActionState> {
  const { user } = await getAuthenticatedSession();
  if (!user) return { status: "error", message: "Your session has ended. Sign in again." };

  const allowed = takeAttempt(`avatar:user:${user.id}`, AUTH_LIMITS.avatarUser);
  if (!allowed.ok) return { status: "error", message: tooManyMessage(allowed.retryAfterSeconds) };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { status: "error", message: "Choose a photo first." };
  }

  try {
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const check = checkAvatarUpload({ size: photo.size, type: photo.type, bytes });
    if (!check.ok) return { status: "error", message: check.error };

    const supabase = await createSupabaseServerClient();
    const previous = await currentAvatarUrl(supabase, user.id);
    const key = avatarObjectKey(user.id, Date.now(), check.extension);

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(key, photo, { contentType: check.mime, cacheControl: "3600", upsert: false });

    if (uploadError) {
      console.error("avatar: upload failed", uploadError.message);
      return { status: "error", message: "That photo could not be saved. Please try again." };
    }

    const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(key);
    const { data: rows, error } = await supabase
      .from("profiles")
      .update({ avatar_url: urlData.publicUrl })
      .eq("id", user.id)
      .select("id");

    if (error || !rows || rows.length === 0) {
      // The file is no good without the row that points at it: take it back.
      await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([key])
        .catch((cleanupError: unknown) => console.error("avatar: could not remove the orphan", cleanupError));
      console.error("avatar: profile row update failed", error?.code, error?.message);
      return { status: "error", message: "That photo could not be saved. Please try again." };
    }

    const oldKey = avatarKeyFromUrl(previous);
    if (oldKey) {
      await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([oldKey])
        .catch((cleanupError: unknown) => console.error("avatar: could not remove the old photo", cleanupError));
    }

    revalidatePath("/", "layout");
    return { status: "success", message: "Your photo is saved." };
  } catch (error) {
    console.error("avatar: threw", error);
    return { status: "error", message: "That photo could not be saved. Please try again." };
  }
}

/** Take the photo away and let the initial letter stand in again. */
export async function removeAvatar(): Promise<AuthActionState> {
  const { user } = await getAuthenticatedSession();
  if (!user) return { status: "error", message: "Your session has ended. Sign in again." };

  try {
    const supabase = await createSupabaseServerClient();
    const previous = await currentAvatarUrl(supabase, user.id);
    const { data: rows, error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id).select("id");
    if (error || !rows || rows.length === 0) {
      console.error("avatar: could not clear the row", error?.code, error?.message);
      return { status: "error", message: GENERIC_SAVE_FAILURE };
    }

    const oldKey = avatarKeyFromUrl(previous);
    if (oldKey) {
      await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([oldKey])
        .catch((cleanupError: unknown) => console.error("avatar: could not remove the file", cleanupError));
    }

    revalidatePath("/", "layout");
    return { status: "success", message: "Your photo is removed." };
  } catch (error) {
    console.error("avatar: remove threw", error);
    return { status: "error", message: GENERIC_SAVE_FAILURE };
  }
}

/**
 * Change the password, having proved the current one.
 *
 * Supabase's `updateUser({ password })` will happily set a password with no
 * proof of the old one, which would let anyone at an unlocked laptop take the
 * account. There is no "verify password" call, so the current password is
 * checked by signing in with it (the session that comes back is this browser's
 * own), and only then is the new one saved. Every other session is ended: a
 * password change is usually a response to "someone else may be in here".
 */
export async function changePassword(previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = changePasswordSchema.safeParse({
    current: formString(formData, "current"),
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

  const { user } = await getAuthenticatedSession();
  if (!user) return { status: "error", message: "Your session has ended. Sign in again." };
  if (!user.email) {
    return { status: "error", message: "This account has no email address, so it cannot have a password." };
  }

  const { ip } = await authRequestContext();
  const byUser = takeAttempt(`change:user:${user.id}`, AUTH_LIMITS.changePasswordUser);
  if (!byUser.ok) return { status: "error", message: tooManyMessage(byUser.retryAfterSeconds) };
  const byIp = takeAttempt(`change:ip:${ip}`, AUTH_LIMITS.changePasswordIp);
  if (!byIp.ok) return { status: "error", message: tooManyMessage(byIp.retryAfterSeconds) };

  try {
    const supabase = await createSupabaseServerClient();

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.current,
    });
    if (verifyError) {
      console.error("password change: current password refused", verifyError.code, verifyError.message);
      // One sentence for a wrong password and for a session that has gone stale:
      // the page does not need to say which, and neither does anyone else.
      return {
        status: "error",
        message: "That is not your current password.",
        fieldErrors: { current: "That is not your current password." },
      };
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      console.error("password change: update failed", error.code, error.message);
      return { status: "error", message: "We could not save that password. Try a different one." };
    }

    await supabase.auth.signOut({ scope: "others" }).catch((signOutError: unknown) => {
      console.error("password change: could not end other sessions", signOutError);
    });

    void previous;
    return { status: "success", message: "Your password is changed. Other devices have been signed out." };
  } catch (error) {
    console.error("password change: threw", error);
    return { status: "error", message: GENERIC_SAVE_FAILURE };
  }
}

/**
 * Send the reset link to the address on the session.
 *
 * This is the route for a person who cannot remember the current password, and
 * the only way a Google-only account can ever have one. The flow after the
 * click is the one that already exists: `/auth/callback` → `/reset-password` →
 * every other session ended.
 */
export async function sendPasswordReset(previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  void formData;
  void previous;

  const { user } = await getAuthenticatedSession();
  if (!user?.email) return { status: "error", message: "Your session has ended. Sign in again." };

  const { ip, origin } = await authRequestContext();
  const byUser = takeAttempt(`reset:user:${user.id}`, AUTH_LIMITS.resetEmail);
  if (!byUser.ok) return { status: "error", message: tooManyMessage(byUser.retryAfterSeconds) };
  const byIp = takeAttempt(`reset:ip:${ip}`, AUTH_LIMITS.resetIp);
  if (!byIp.ok) return { status: "error", message: tooManyMessage(byIp.retryAfterSeconds) };

  try {
    await rememberNextPath("/reset-password");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: authCallbackUrl(origin) });
    if (error) {
      console.error("password reset: request failed", error.code, error.message);
      if (isEmailRateLimited(error)) {
        return {
          status: "error",
          message: "We have sent a lot of email to that address in the last hour. Wait a little, then try again.",
        };
      }
      return { status: "error", message: "We could not send that link just now. Please try again in a moment." };
    }
  } catch (error) {
    console.error("password reset: threw", error);
    return { status: "error", message: GENERIC_SAVE_FAILURE };
  }

  return {
    status: "success",
    message: `A reset link is on its way to ${user.email}. It can take a few minutes to arrive.`,
  };
}
