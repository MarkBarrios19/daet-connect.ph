"use client";

import { useActionState, useState } from "react";
import {
  INITIAL_OPERATOR_REVIEW_STATE,
  type OperatorActionState,
} from "@/lib/tours/operator-action-state";
import type { OperatorApplicationRecord } from "@/lib/tours/operator-contract";
import { reviewOperatorApplication } from "@/app/(subsystems)/tours/operator/actions";
import { Notice } from "@/components/ui/notice";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";

export type OperatorDocumentLinks = {
  dti: string | null;
  permit: string | null;
  gcash: string | null;
};

function DocumentLink({ label, url }: { label: string; url: string | null }) {
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center rounded-full border border-daet-forest/20 px-4 text-sm font-bold text-daet-leaf dark:text-blue-300 transition hover:bg-daet-forest/5"
    >
      Download {label} <span className="ml-2" aria-hidden="true">↗</span>
    </a>
  ) : (
    <span className="inline-flex min-h-11 items-center rounded-full bg-daet-sand px-4 text-sm font-semibold text-daet-ink/70">{label} unavailable</span>
  );
}

export function OperatorReviewCard({
  application,
  documents,
}: {
  application: OperatorApplicationRecord;
  documents: OperatorDocumentLinks;
}) {
  const [state, formAction, pending] = useActionState<OperatorActionState, FormData>(
    reviewOperatorApplication,
    INITIAL_OPERATOR_REVIEW_STATE,
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const locked = pending || state.status === "success";

  return (
    <article className="rounded-2xl card-edge bg-surface p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-yellow-50 dark:bg-yellow-950/40 px-3 py-1 text-xs font-bold text-yellow-900 dark:text-yellow-200">Pending review</span>
          <h2 className="mt-3 break-words text-xl font-bold text-daet-ink">{application.business_name}</h2>
          <p className="mt-1 text-sm text-daet-ink/70">Submitted {new Date(application.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full bg-daet-sand px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400">ID · {application.id.slice(0, 8)}</span>
          <OpenChatButton target={{ kind: "operator_admin", operatorId: application.id }} label="Message applicant" variant="ghost" />
        </div>
      </div>

      <dl className="mt-6 grid gap-x-6 gap-y-4 border-t border-daet-ink/10 pt-5 sm:grid-cols-2">
        <div><dt className="text-sm text-slate-600 dark:text-slate-400">Authorized contact</dt><dd className="mt-1 break-words text-sm font-semibold text-daet-ink">{application.contact_person}</dd></div>
        <div><dt className="text-sm text-slate-600 dark:text-slate-400">Phone</dt><dd className="mt-1 break-words text-sm font-semibold text-daet-ink">{application.contact_phone}</dd></div>
        <div><dt className="text-sm text-slate-600 dark:text-slate-400">Email</dt><dd className="mt-1 break-all text-sm font-semibold text-daet-ink">{application.contact_email}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-slate-600 dark:text-slate-400">Business address</dt><dd className="mt-1 break-words text-sm font-semibold leading-6 text-daet-ink">{application.business_address}</dd></div>
      </dl>

      <div className="mt-5">
        <p className="text-sm text-slate-600 dark:text-slate-400">Private uploads</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <DocumentLink label="DTI / registration" url={documents.dti} />
          <DocumentLink label="Business permit" url={documents.permit} />
          <DocumentLink label="GCash QR" url={documents.gcash} />
        </div>
        <p className="mt-2 text-xs leading-5 text-daet-ink/70">Links expire after 10 minutes. Do not forward or save these documents outside approved Tourism Office systems.</p>
      </div>

      {state.message ? (
        <Notice variant={state.status === "success" ? "success" : "error"} className="mt-5">
          {state.message}
        </Notice>
      ) : null}

      <div className="mt-6 grid gap-4 border-t border-daet-ink/10 pt-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <form action={formAction} className="min-w-0">
          <input type="hidden" name="operatorId" value={application.id} />
          <input type="hidden" name="decision" value="rejected" />
          <label className="block">
            <span className="text-sm font-bold text-daet-ink">Reason for rejection</span>
            <textarea
              name="rejectionReason"
              rows={2}
              maxLength={1000}
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Explain what needs to be corrected (at least 10 characters)."
              aria-invalid={Boolean(state.fieldErrors?.rejectionReason)}
              aria-describedby={`reason-help-${application.id}${state.fieldErrors?.rejectionReason ? ` reason-error-${application.id}` : ""}`}
              className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-surface px-4 py-3 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700"
            />
            <span id={`reason-help-${application.id}`} className="mt-1 block text-sm text-slate-600 dark:text-slate-400">Keep the note factual and limited to what the applicant needs to fix.</span>
            {state.fieldErrors?.rejectionReason ? <span id={`reason-error-${application.id}`} className="mt-1 block text-sm font-semibold text-red-700 dark:text-red-300">{state.fieldErrors.rejectionReason}</span> : null}
          </label>
          <button
            type="submit"
            disabled={locked}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-bold text-red-700 dark:text-red-300 transition hover:bg-red-50 dark:hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {pending ? "Saving…" : "Reject application"}
          </button>
        </form>

        <form action={formAction} className="lg:pb-0">
          <input type="hidden" name="operatorId" value={application.id} />
          <input type="hidden" name="decision" value="approved" />
          <button
            type="submit"
            disabled={locked}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-44"
          >
            {pending ? "Saving…" : "Approve operator"}
          </button>
        </form>
      </div>
    </article>
  );
}
