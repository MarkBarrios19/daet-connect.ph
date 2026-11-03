"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { GoogleSignIn, OrDivider } from "@/components/ui/google-sign-in";
import { Notice } from "@/components/ui/notice";
import { INITIAL_AUTH_STATE } from "@/lib/auth/action-state";
import { PASSWORD_MIN } from "@/lib/auth/validation";
import { signUpWithPassword } from "./actions";

export function SignupForm({ nextUrl = "/" }: { nextUrl?: string }) {
  const [state, formAction, pending] = useActionState(signUpWithPassword, INITIAL_AUTH_STATE);
  const loginHref = nextUrl && nextUrl !== "/" ? `/login?next=${encodeURIComponent(nextUrl)}` : "/login";

  // The account exists but is not usable yet: the form would only invite a
  // second sign-up with the same address, so it is replaced by what to do next.
  if (state.status === "check-email") {
    const verifyHref = `/verify-email?email=${encodeURIComponent(state.email ?? "")}&next=${encodeURIComponent(nextUrl)}`;
    return (
      <div className="mt-6 space-y-5">
        <Notice variant="success" title="Check your inbox">
          {state.message}
        </Notice>
        <p className="text-sm text-daet-ink/80">
          Nothing yet? Wait a minute, then{" "}
          <Link href={verifyHref} className="font-bold underline underline-offset-4">
            send the link again
          </Link>
          .
        </p>
        <p className="text-center text-sm text-daet-ink/80">
          Already confirmed?{" "}
          <Link
            href={loginHref}
            className="inline-flex min-h-11 items-center font-bold text-daet-forest underline underline-offset-4 dark:text-blue-300"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <GoogleSignIn nextUrl={nextUrl} />
      <OrDivider />

      <form action={formAction} className="space-y-5" noValidate>
        <input type="hidden" name="next" value={nextUrl} />

        <Field id="fullName" label="Full name" required error={state.fieldErrors?.fullName}>
          <Input type="text" name="fullName" required autoComplete="name" placeholder="Juan Dela Cruz" maxLength={80} />
        </Field>

        <Field id="email" label="Email address" required error={state.fieldErrors?.email}>
          <Input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            maxLength={254}
            defaultValue={state.email ?? ""}
          />
        </Field>

        <Field
          id="password"
          label="Password"
          required
          hint={`At least ${PASSWORD_MIN} characters. A phrase you can remember beats a common password.`}
          error={state.fieldErrors?.password}
        >
          <Input
            type="password"
            name="password"
            required
            minLength={PASSWORD_MIN}
            maxLength={72}
            autoComplete="new-password"
          />
        </Field>

        {state.status === "error" && state.message ? <Notice variant="error">{state.message}</Notice> : null}

        <Button type="submit" fullWidth loading={pending} loadingText="Creating your account">
          Create account
        </Button>

        <p className="text-sm text-daet-ink/75">
          We will email you a link. Your account stays inactive until you open it — that is how we know the address is
          yours.
        </p>
      </form>

      <p className="text-center text-sm text-daet-ink/80">
        Already have an account?{" "}
        <Link
          href={loginHref}
          className="inline-flex min-h-11 items-center font-bold text-daet-forest underline underline-offset-4 dark:text-blue-300"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
