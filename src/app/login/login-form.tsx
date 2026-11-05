"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { GoogleSignIn, OrDivider } from "@/components/ui/google-sign-in";
import { Notice } from "@/components/ui/notice";
import { INITIAL_AUTH_STATE } from "@/lib/auth/action-state";
import { signInWithPassword } from "./actions";

interface LoginFormProps {
  nextUrl: string;
  /** A message passed in the URL, such as "Account created. Please sign in." */
  notice?: string;
}

export function LoginForm({ nextUrl, notice }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signInWithPassword, INITIAL_AUTH_STATE);
  const signupHref = nextUrl && nextUrl !== "/" ? `/signup?next=${encodeURIComponent(nextUrl)}` : "/signup";
  const verifyHref = `/verify-email?email=${encodeURIComponent(state.email ?? "")}&next=${encodeURIComponent(nextUrl)}`;

  return (
    <div className="mt-6 space-y-6">
      <GoogleSignIn nextUrl={nextUrl} />
      <OrDivider />

      <form action={formAction} className="space-y-5" noValidate>
        <input type="hidden" name="next" value={nextUrl} />

        {notice && state.status === "idle" ? <Notice variant="info">{notice}</Notice> : null}

        <Field id="email" label="Email address" required error={state.fieldErrors?.email}>
          <Input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            defaultValue={state.email ?? ""}
          />
        </Field>

        <Field id="password" label="Password" required error={state.fieldErrors?.password}>
          <Input type="password" name="password" required autoComplete="current-password" />
        </Field>

        <p className="-mt-2 text-sm">
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center font-bold text-daet-forest underline underline-offset-4 dark:text-blue-300"
          >
            Forgot your password?
          </Link>
        </p>

        {state.status === "unverified" ? (
          <Notice variant="warning" title="Confirm your email first">
            {state.message}{" "}
            <Link href={verifyHref} className="font-bold underline underline-offset-4">
              Send a new verification email
            </Link>
          </Notice>
        ) : null}

        {state.status === "error" && state.message ? <Notice variant="error">{state.message}</Notice> : null}

        <Button type="submit" fullWidth loading={pending} loadingText="Signing in">
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-daet-ink/80">
        New here?{" "}
        <Link
          href={signupHref}
          className="inline-flex min-h-11 items-center font-bold text-daet-forest underline underline-offset-4 dark:text-blue-300"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
