"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { INITIAL_AUTH_STATE } from "@/lib/auth/action-state";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, INITIAL_AUTH_STATE);
  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      {notice && state.status === "idle" ? <Notice variant="warning">{notice}</Notice> : null}
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
      {state.message ? <Notice variant={state.status === "error" ? "error" : "success"}>{state.message}</Notice> : null}
      <Button type="submit" fullWidth loading={pending} loadingText="Sending">
        Send reset link
      </Button>
      <p className="text-center text-sm text-daet-ink/80">
        <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
