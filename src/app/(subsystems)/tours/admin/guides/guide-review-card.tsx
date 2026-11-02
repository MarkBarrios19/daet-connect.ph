"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui/notice";
import {
  INITIAL_GUIDE_DOCUMENT_LINK_STATE,
  INITIAL_GUIDE_REVIEW_STATE,
  type GuideActionState,
} from "@/lib/tours/guide-action-state";
import type { GuideAdminRecord } from "@/lib/tours/guide-contract";
import {
  getGuideSensitiveDocumentLink,
  reviewGuideApplication,
} from "@/app/(subsystems)/tours/guide/actions";

export function GuideSensitiveDocumentAccess({ guideId }: { guideId: string }) {
  const [state, formAction, pending] = useActionState<GuideActionState, FormData>(
    getGuideSensitiveDocumentLink,
    INITIAL_GUIDE_DOCUMENT_LINK_STATE,
  );

  return (
    <div className="rounded-2xl bg-yellow-50 dark:bg-yellow-950/40 p-4">
      <p className="text-sm font-bold text-yellow-950 dark:text-yellow-200">Private identity document</p>
      <p className="mt-1 text-xs leading-5 text-yellow-900/75 dark:text-yellow-200/80">Request a short-lived download link only when you need to verify this application. The sensitive table is never queried by this page or browser.</p>
      <form action={formAction} className="mt-3">
        <input type="hidden" name="guideId" value={guideId} />
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full border border-yellow-800/20 px-4 text-sm font-bold text-yellow-950 dark:text-yellow-200 transition hover:bg-yellow-100 dark:hover:bg-yellow-900/40 disabled:opacity-50">
          {pending ? "Creating secure link…" : "Request ID document link"}
        </button>
      </form>
      {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 text-xs leading-5 ${state.status === "error" ? "text-red-800 dark:text-red-300" : "text-green-900 dark:text-green-300"}`}>{state.message}</p> : null}
      {state.signedUrl ? (
        <a href={state.signedUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-full bg-yellow-900 px-4 text-sm font-bold text-white hover:bg-yellow-950">
          Download private ID document ↗
        </a>
      ) : null}
    </div>
  );
}

export function GuideReviewCard({ guide }: { guide: GuideAdminRecord }) {
  const [state, formAction, pending] = useActionState<GuideActionState, FormData>(
    reviewGuideApplication,
    INITIAL_GUIDE_REVIEW_STATE,
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const locked = pending || state.status === "success";

  return (
    <article className="rounded-2xl card-edge bg-surface p-5 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-yellow-50 dark:bg-yellow-950/40 px-3 py-1 text-xs font-bold text-yellow-900 dark:text-yellow-200">Pending guide review</span>
          <h2 className="mt-3 break-words text-xl font-bold text-daet-ink">{guide.full_name}</h2>
          <p className="mt-1 text-sm text-daet-ink/70">Submitted {new Date(guide.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" })}</p>
        </div>
        <span className="shrink-0 rounded-full bg-daet-sand px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400">ID · {guide.id.slice(0, 8)}</span>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-daet-ink/10 pt-5 sm:grid-cols-2">
        <div><dt className="text-sm text-slate-600 dark:text-slate-400">Contact number</dt><dd className="mt-1 text-sm font-semibold text-daet-ink">{guide.contact_phone}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-slate-600 dark:text-slate-400">Guide introduction</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-daet-ink">{guide.bio}</dd></div>
      </dl>

      <div className="mt-5">
        <GuideSensitiveDocumentAccess guideId={guide.id} />
      </div>

      {state.message ? <Notice variant={state.status === "success" ? "success" : "error"} className="mt-5">{state.message}</Notice> : null}

      <div className="mt-6 grid gap-4 border-t border-daet-ink/10 pt-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <form action={formAction} className="min-w-0">
          <input type="hidden" name="guideId" value={guide.id} />
          <input type="hidden" name="decision" value="rejected" />
          <label className="block">
            <span className="text-sm font-bold text-daet-ink">Reason for rejection</span>
            <textarea
              name="rejectionReason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Explain what needs to be corrected (at least 10 characters)."
              aria-invalid={Boolean(state.fieldErrors?.rejectionReason)}
              aria-describedby={`guide-reason-help-${guide.id}${state.fieldErrors?.rejectionReason ? ` guide-reason-error-${guide.id}` : ""}`}
              className="mt-2 w-full rounded-2xl border border-daet-ink/15 px-4 py-3 text-sm outline-none focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700"
            />
            <span id={`guide-reason-help-${guide.id}`} className="mt-1 block text-sm text-slate-600 dark:text-slate-400">Keep the note factual and limited to what the applicant needs to fix.</span>
            {state.fieldErrors?.rejectionReason ? <span id={`guide-reason-error-${guide.id}`} className="mt-1 block text-sm font-semibold text-red-700 dark:text-red-300">{state.fieldErrors.rejectionReason}</span> : null}
          </label>
          <button type="submit" disabled={locked} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-bold text-red-700 dark:text-red-300 transition hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 sm:w-auto">
            {pending ? "Saving…" : "Reject guide"}
          </button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="guideId" value={guide.id} />
          <input type="hidden" name="decision" value="approved" />
          <button type="submit" disabled={locked} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50 lg:min-w-44">
            {pending ? "Saving…" : "Approve guide"}
          </button>
        </form>
      </div>
    </article>
  );
}
