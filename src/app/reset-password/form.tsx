"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { INITIAL_AUTH_STATE } from "@/lib/auth/action-state";
import { PASSWORD_MIN } from "@/lib/auth/validation";
import { setNewPassword } from "./actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(setNewPassword, INITIAL_AUTH_STATE);
  return (
    <form action={formAction} className="mt-6 space-y-5" noValidate>
      <Field
        id="password"
        label="New password"
        required
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={state.fieldErrors?.password}
      >
        <Input type="password" name="password" required minLength={PASSWORD_MIN} maxLength={72} autoComplete="new-password" />
      </Field>
      <Field id="confirm" label="Type it again" required error={state.fieldErrors?.confirm}>
        <Input type="password" name="confirm" required minLength={PASSWORD_MIN} maxLength={72} autoComplete="new-password" />
      </Field>
      {state.message ? <Notice variant="error">{state.message}</Notice> : null}
      <Button type="submit" fullWidth loading={pending} loadingText="Saving">
        Save new password
      </Button>
    </form>
  );
}
