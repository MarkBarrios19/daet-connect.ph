"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { INITIAL_AUTH_STATE } from "@/lib/auth/action-state";
import { passwordScore, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/validation";
import { changePassword } from "./actions";

/**
 * Change the password, with the current one typed again.
 *
 * The strength line is advice, never a gate — the schema on the server decides,
 * the same one sign-up and the reset page use.
 */
export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, INITIAL_AUTH_STATE);
  const [next, setNext] = useState("");
  const score = passwordScore(next);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field id="current" label="Current password" required error={state.fieldErrors?.current}>
        <Input type="password" name="current" required maxLength={PASSWORD_MAX} autoComplete="current-password" />
      </Field>

      <Field
        id="password"
        label="New password"
        required
        hint={`At least ${PASSWORD_MIN} characters.${score.label ? ` That one looks ${score.label.toLowerCase()}.` : ""}`}
        error={state.fieldErrors?.password}
      >
        <Input
          type="password"
          name="password"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          autoComplete="new-password"
          onChange={(event) => setNext(event.target.value)}
        />
      </Field>

      <Field id="confirm" label="Type the new password again" required error={state.fieldErrors?.confirm}>
        <Input
          type="password"
          name="confirm"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          autoComplete="new-password"
        />
      </Field>

      {state.message ? <Notice variant={state.status === "success" ? "success" : "error"}>{state.message}</Notice> : null}

      <Button type="submit" loading={pending} loadingText="Saving">
        Save new password
      </Button>
    </form>
  );
}
