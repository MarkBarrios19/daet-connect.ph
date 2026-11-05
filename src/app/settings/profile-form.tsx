"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { INITIAL_AUTH_STATE } from "@/lib/auth/action-state";
import { updateName } from "./actions";

/** The account's name. Saving writes the profile row and the sign-up metadata. */
export function ProfileForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(
    updateName,
    INITIAL_AUTH_STATE,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field
        id="fullName"
        label="Full name"
        required
        hint="Letters, spaces, hyphens, dots and commas. Up to 80 characters."
        error={state.fieldErrors?.fullName}
      >
        <Input
          name="fullName"
          defaultValue={name}
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
        />
      </Field>

      {state.message ? (
        <Notice variant={state.status === "success" ? "success" : "error"}>
          {state.message}
        </Notice>
      ) : null}

      <Button type="submit" loading={pending} loadingText="Saving">
        Save name
      </Button>
    </form>
  );
}
