"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { INITIAL_AUTH_STATE } from "@/lib/auth/action-state";
import { resendVerification } from "./actions";

export function ResendVerificationForm({ email = "", next }: { email?: string; next: string }) {
  const [state, formAction, pending] = useActionState(resendVerification, INITIAL_AUTH_STATE);

  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {state.status === "success" ? (
        <Notice variant="success" title="Check your inbox">
          {state.message}
        </Notice>
      ) : null}

      <Field id="email" label="Email address" required error={state.fieldErrors?.email}>
        <Input
          type="email"
          name="email"
          required
          defaultValue={email}
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
        />
      </Field>

      {state.status === "error" && state.message ? <Notice variant="error">{state.message}</Notice> : null}

      <Button type="submit" fullWidth loading={pending} loadingText="Sending">
        {state.status === "success" ? "Send it again" : "Send me a new link"}
      </Button>

      <p className="text-center text-sm text-daet-ink/80">
        Already confirmed?{" "}
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center font-bold text-daet-forest underline underline-offset-4 dark:text-blue-300"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
