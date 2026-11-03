"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { INITIAL_AUTH_STATE } from "@/lib/auth/action-state";
import { sendPasswordReset } from "./actions";

/**
 * The reset link, for the password nobody remembers.
 *
 * There is no address field: the link goes to the address this browser is
 * signed in with, so the form says which one before it is pressed and cannot be
 * pointed somewhere else by editing it.
 */
export function ResetCard({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(sendPasswordReset, INITIAL_AUTH_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-daet-ink/80">
        The link goes to <span className="font-bold text-daet-ink">{email}</span>.
      </p>

      {state.message ? <Notice variant={state.status === "success" ? "success" : "error"}>{state.message}</Notice> : null}

      <Button type="submit" variant="secondary" loading={pending} loadingText="Sending">
        Email me a reset link
      </Button>
    </form>
  );
}
