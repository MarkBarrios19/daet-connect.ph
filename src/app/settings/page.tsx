import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { displayName } from "@/lib/profile/name";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMyProfile } from "@/lib/tours/my-profile";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { PasswordForm } from "./password-form";
import { PhotoForm } from "./photo-form";
import { ProfileForm } from "./profile-form";
import { ResetCard } from "./reset-card";

export const metadata: Metadata = { title: "Profile settings" };

/**
 * The one page every signed-in person owns: their photo, their name, their
 * password.
 *
 * It is account-level, so it lives beside the sign-in pages rather than under
 * any role's subtree, and the account menu links to it for tourists, operators,
 * guides and the Tourism Office alike.
 */
export default async function SettingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to open your profile settings.
        </Notice>
      </PageFrame>
    );
  }

  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/settings")}`);

  const profile = await getMyProfile();
  const meta = (session.user.user_metadata ?? {}) as {
    full_name?: unknown;
    name?: unknown;
  };
  const metaName = [meta.full_name, meta.name].find(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  );
  const name = displayName({
    profileName: profile?.fullName,
    metaName,
    email: session.user.email,
  });
  const avatarUrl = profile?.avatarUrl ?? null;
  const email = session.user.email ?? "";

  // A Google account has no password until one is set through a reset link;
  // saying so is kinder than a form that can only fail.
  const providers = Array.isArray(session.user.app_metadata?.providers)
    ? (session.user.app_metadata.providers as string[])
    : (session.user.identities ?? [])
        .map((identity) => identity.provider)
        .filter(Boolean);
  const canHavePassword = providers.length === 0 || providers.includes("email");

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <h1 className="display-2 text-daet-ink">Settings</h1>
        <p className="mt-2 text-daet-ink/80">
          Signed in as <span className="font-bold text-daet-ink">{email}</span>.
          Your photo, your name and your password.
        </p>

        <div className="mt-6 space-y-4">
          <Card>
            <CardHeader
              title="Your photo"
              description="Shown beside your name in the header and in your messages."
            />
            <PhotoForm initial={name} avatarUrl={avatarUrl} />
          </Card>

          <Card>
            <CardHeader
              title="Your name"
              description="As it appears on your bookings, tickets and messages."
            />
            <ProfileForm name={name} />
          </Card>

          <Card>
            <CardHeader
              title="Change your password"
              description={
                canHavePassword
                  ? "You stay signed in here; every other device is signed out."
                  : "Your account signs in with Google."
              }
            />
            {canHavePassword ? (
              <PasswordForm />
            ) : (
              <Notice variant="info">
                You sign in with Google, so there is no password to change. Use
                the reset link below if you would like a password as well.
              </Notice>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Forgot your password?"
              description="We will email you a link. It works on this device or any other, and signing other devices out."
            />
            <ResetCard email={email} />
          </Card>
        </div>

        <p className="mt-6 text-sm text-daet-ink/70">
          Your email address is the one you signed up with. Ask the Daet Tourism
          Office if it needs to change.
        </p>
      </div>
    </PageFrame>
  );
}
