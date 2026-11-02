"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { INITIAL_GUIDE_SUBMISSION_STATE, type GuideActionState, type GuideQrPreviewResult } from "@/lib/tours/guide-action-state";
import { compressImageFile } from "@/lib/tours/compress-image";
import { GUIDE_ID_TYPES } from "@/lib/tours/guide-validation";
import { MAX_GUIDE_ID_DOCUMENT_BYTES } from "@/lib/tours/guide-upload-validation";
import { prepareGuideQrPreview, submitGuideRegistration } from "@/app/(subsystems)/tours/guide/actions";

type ProfileField = "fullName" | "contactPhone" | "bio";

const FIELD_STEP: Record<string, number> = {
  fullName: 1,
  contactPhone: 1,
  bio: 1,
  idType: 2,
  idNumber: 2,
  idDocument: 2,
  consentFullIdDisplay: 2,
};

function fieldErrorId(field: string) {
  return `${field}-error`;
}

function FieldError({ message, id }: { message?: string; id: string }) {
  return message ? <p id={id} role="alert" className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{message}</p> : null;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GuideRegistrationForm({
  rejectionReason,
  submissionDisabled = false,
}: {
  rejectionReason?: string | null;
  submissionDisabled?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const previewRequested = useRef(false);
  const [state, formAction, actionPending] = useActionState<GuideActionState, FormData>(
    submitGuideRegistration,
    INITIAL_GUIDE_SUBMISSION_STATE,
  );
  const [transitionPending, startTransition] = useTransition();
  const [activeStep, setActiveStep] = useState(1);
  const stepChanged = useRef(false);

  // After "Next" or "Back", move focus to the new step's heading so keyboard
  // and screen reader users land where the content changed.
  useEffect(() => {
    if (!stepChanged.current) {
      stepChanged.current = true;
      return;
    }
    const legend = formRef.current?.querySelector<HTMLElement>("fieldset:not([hidden]) > legend");
    if (legend) {
      legend.tabIndex = -1;
      legend.focus();
    }
  }, [activeStep]);
  const [values, setValues] = useState({ fullName: "", contactPhone: "", bio: "", idType: "" as string, idNumber: "" });
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [qrPreview, setQrPreview] = useState<GuideQrPreviewResult | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [clientError, setClientError] = useState("");

  const busy = actionPending || transitionPending || compressing;
  const fieldErrors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "success") {
      router.replace("/tours/guide/pending");
      return;
    }
    if (state.status === "error" && state.fieldErrors) {
      const firstField = Object.keys(state.fieldErrors)[0];
      setActiveStep(FIELD_STEP[firstField] ?? 1);
    }
  }, [router, state.status, state.fieldErrors]);

  useEffect(() => {
    if (activeStep !== 3 || submissionDisabled || previewRequested.current) return;
    previewRequested.current = true;
    setQrLoading(true);
    prepareGuideQrPreview()
      .then(setQrPreview)
      .catch(() => setQrPreview({ status: "error", message: "QR preview could not be generated." }))
      .finally(() => setQrLoading(false));
  }, [activeStep, submissionDisabled, previewAttempt]);

  function changeProfile(field: ProfileField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setClientError("");
  }

  function validateStep(step: number): boolean {
    const form = formRef.current;
    if (!form) return false;
    if (step === 2 && !idDocument) {
      setClientError("Choose a clear government-issued ID image or PDF.");
      return false;
    }
    if (step === 2 && !consent) {
      setClientError("Consent is required before we can store your ID for verification. No ID record will be created without it.");
      return false;
    }
    const controls = Array.from(form.querySelectorAll<HTMLElement>(`[data-guide-step="${step}"]`));
    for (const control of controls) {
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      ) {
        if (!control.checkValidity()) {
          control.reportValidity();
          return false;
        }
      }
    }
    return true;
  }

  function buildFormData(): FormData {
    const data = new FormData();
    Object.entries(values).forEach(([key, value]) => data.set(key, value));
    data.set("consentFullIdDisplay", String(consent));
    if (idDocument) data.set("idDocument", idDocument, idDocument.name);
    if (qrPreview?.guideId) data.set("guideId", qrPreview.guideId);
    return data;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!consent) {
      setActiveStep(2);
      setClientError("Consent is required. Your identity information will not be stored unless you explicitly agree.");
      return;
    }
    if (!qrPreview?.guideId) {
      setClientError("Generate the QR preview before submitting.");
      return;
    }

    const data = buildFormData();
    setCompressing(true);
    setClientError("");
    try {
      if (idDocument?.type.startsWith("image/")) {
        const optimized = await compressImageFile(idDocument);
        if (optimized.size > MAX_GUIDE_ID_DOCUMENT_BYTES) {
          setActiveStep(2);
          setClientError("The ID image must be 5 MB or smaller after compression. Try a clearer, smaller photo.");
          return;
        }
        data.set("idDocument", optimized, optimized.name);
      } else if (idDocument && idDocument.size > MAX_GUIDE_ID_DOCUMENT_BYTES) {
        setActiveStep(2);
        setClientError("PDF ID documents must be 5 MB or smaller.");
        return;
      }
      startTransition(() => formAction(data));
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "The ID image could not be optimized.");
    } finally {
      setCompressing(false);
    }
  }

  const steps = [
    { number: 1, title: "Profile info" },
    { number: 2, title: "ID & consent" },
    { number: 3, title: "QR preview" },
  ];

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-7">
        <h1 className="display-2 mt-2 text-daet-ink">Register as a local guide.</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-daet-ink/70">Create your public guide profile and submit one government-issued ID for private Tourism Office verification.</p>
      </div>

      <div className="mb-5 rounded-2xl border-daet-forest/10 bg-surface px-4 py-4 sm:px-6">
        <ol className="grid grid-cols-3 gap-2" aria-label="Guide application steps">
          {steps.map((step) => {
            const complete = activeStep > step.number;
            const active = activeStep === step.number;
            return (
              <li key={step.number} className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${complete || active ? "bg-daet-forest text-white" : "bg-daet-sand text-daet-ink/70"}`} aria-current={active ? "step" : undefined}>
                    {complete ? "✓" : step.number}
                  </span>
                  <span className={`truncate text-xs font-bold sm:text-sm ${active ? "text-daet-forest dark:text-blue-300" : "text-daet-ink/65"}`}>{step.title}</span>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-daet-sand" aria-hidden="true">
          <div className="h-full rounded-full bg-daet-forest transition-all duration-300" style={{ width: `${(activeStep / 3) * 100}%` }} />
        </div>
      </div>

      <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
        {rejectionReason ? <Notice variant="warning" title="Updates requested by the Tourism Office" className="mb-6">{rejectionReason}</Notice> : null}
        {state.status === "error" && !state.fieldErrors ? <Notice variant="error" title="We couldn’t submit your application" className="mb-6">{state.message}</Notice> : null}
        {clientError ? <Notice variant="error" title="Please check your application" className="mb-6">{clientError}</Notice> : null}

        <fieldset hidden={activeStep !== 1}>
          <legend className="text-xl font-bold text-daet-ink">Public profile</legend>
          <p className="mt-1 text-sm leading-6 text-daet-ink/65">This information appears on your public guide profile after accreditation.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="block">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Full name <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <input data-guide-step="1" name="fullName" value={values.fullName} onChange={(event) => changeProfile("fullName", event.target.value)} required={activeStep === 1} maxLength={160} autoComplete="name" placeholder="Name shown on your guide profile" aria-invalid={Boolean(fieldErrors.fullName)} aria-describedby={fieldErrors.fullName ? fieldErrorId("fullName") : undefined} className="mt-2 min-h-12 w-full rounded-2xl border border-daet-ink/15 px-4 text-base outline-none focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700" />
              </label>
              <FieldError id={fieldErrorId("fullName")} message={fieldErrors.fullName} />
              </div>
            <div className="block">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Contact number <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <input data-guide-step="1" name="contactPhone" type="tel" value={values.contactPhone} onChange={(event) => changeProfile("contactPhone", event.target.value)} required={activeStep === 1} maxLength={24} autoComplete="tel" placeholder="09XX XXX XXXX" aria-invalid={Boolean(fieldErrors.contactPhone)} aria-describedby={fieldErrors.contactPhone ? fieldErrorId("contactPhone") : undefined} className="mt-2 min-h-12 w-full rounded-2xl border border-daet-ink/15 px-4 text-base outline-none focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700" />
              </label>
              <FieldError id={fieldErrorId("contactPhone")} message={fieldErrors.contactPhone} />
              </div>
            <div className="block sm:col-span-2">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Guide introduction <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <textarea data-guide-step="1" name="bio" value={values.bio} onChange={(event) => changeProfile("bio", event.target.value)} required={activeStep === 1} maxLength={1000} rows={4} placeholder="Tell visitors about your local knowledge, guiding experience, and the places you love to share." aria-invalid={Boolean(fieldErrors.bio)} aria-describedby={fieldErrors.bio ? fieldErrorId("bio") : undefined} className="mt-2 w-full rounded-2xl border border-daet-ink/15 px-4 py-3 text-base outline-none focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700" />
              <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">20–1,000 characters.</span>
              </label>
              <FieldError id={fieldErrorId("bio")} message={fieldErrors.bio} />
              </div>
          </div>
        </fieldset>

        <fieldset hidden={activeStep !== 2}>
          <legend className="text-xl font-bold text-daet-ink">Identity verification & consent</legend>
          <p className="mt-1 text-sm leading-6 text-daet-ink/65">Your ID details are stored separately from your public guide profile and are never queried by browser code.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="block">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Government ID type <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <select data-guide-step="2" name="idType" value={values.idType} onChange={(event) => setValues((previous) => ({ ...previous, idType: event.target.value }))} required={activeStep === 2} aria-invalid={Boolean(fieldErrors.idType)} aria-describedby={fieldErrors.idType ? fieldErrorId("idType") : undefined} className="mt-2 min-h-12 w-full rounded-2xl border border-daet-ink/15 bg-surface px-4 text-base outline-none focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700">
                <option value="">Choose an ID type</option>
                {GUIDE_ID_TYPES.map((idType) => <option key={idType.value} value={idType.value}>{idType.label}</option>)}
              </select>
              </label>
              <FieldError id={fieldErrorId("idType")} message={fieldErrors.idType} />
              </div>
            <div className="block">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">ID number <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <input data-guide-step="2" name="idNumber" type="text" value={values.idNumber} onChange={(event) => setValues((previous) => ({ ...previous, idNumber: event.target.value }))} required={activeStep === 2} maxLength={40} autoComplete="off" spellCheck={false} placeholder="As shown on your ID" aria-invalid={Boolean(fieldErrors.idNumber)} aria-describedby={fieldErrors.idNumber ? fieldErrorId("idNumber") : "idNumber-private"} className="mt-2 min-h-12 w-full rounded-2xl border border-daet-ink/15 px-4 text-base outline-none focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700" />
              <span id="idNumber-private" className="mt-1 block text-xs leading-5 text-daet-ink/70">Sent only to the server for protected storage. It is never placed in your QR code.</span>
              </label>
              <FieldError id={fieldErrorId("idNumber")} message={fieldErrors.idNumber} />
              </div>
            <div className="block sm:col-span-2">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">ID image or PDF <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <span className="mt-1 block text-sm leading-6 text-daet-ink/70">Show the full ID clearly. Upload only one side if it contains the required details.</span>
              <input data-guide-step="2" name="idDocument" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" required={activeStep === 2 && !idDocument} onChange={(event) => { setIdDocument(event.target.files?.[0] ?? null); setClientError(""); }} aria-invalid={Boolean(fieldErrors.idDocument)} aria-describedby={fieldErrors.idDocument ? fieldErrorId("idDocument") : "idDocument-help"} className="mt-3 block min-h-11 w-full cursor-pointer rounded-2xl border border-daet-ink/15 bg-surface text-sm text-daet-ink file:mr-3 file:min-h-11 file:border-0 file:bg-daet-forest file:px-4 file:font-bold file:text-white hover:file:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-daet-forest/10" />
              {idDocument ? <span className="mt-2 block break-all text-xs font-semibold text-daet-ink/70">{idDocument.name} · {formatBytes(idDocument.size)}</span> : null}
              <span id="idDocument-help" className="mt-2 block text-sm text-slate-600 dark:text-slate-400">JPG, PNG, WebP, or PDF · maximum 5 MB after image compression.</span>
              </label>
              <FieldError id={fieldErrorId("idDocument")} message={fieldErrors.idDocument} />
              </div>

            <div className="rounded-2xl bg-yellow-50 dark:bg-yellow-950/40 p-4 sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3">
                <input data-guide-step="2" type="checkbox" name="consentFullIdDisplay" checked={consent} onChange={(event) => { setConsent(event.target.checked); setClientError(""); }} required={activeStep === 2} aria-invalid={Boolean(fieldErrors.consentFullIdDisplay)} aria-describedby={fieldErrors.consentFullIdDisplay ? fieldErrorId("consentFullIdDisplay") : "consent-text"} className="mt-1 h-5 w-5 shrink-0 accent-daet-forest" />
                <span id="consent-text" className="text-sm leading-6 text-yellow-950 dark:text-yellow-200">
                  <strong>I explicitly consent to the Tourism Office viewing the full details on my ID for this guide verification.</strong> My ID number and document are stored separately from my public guide profile; only authorized reviewers can request the document through a short-lived private link, and each sensitive-data access is logged. Nothing from my ID is included in my public profile or QR code.
                </span>
              </label>
              <FieldError id={fieldErrorId("consentFullIdDisplay")} message={fieldErrors.consentFullIdDisplay} />
            </div>
          </div>
          <p className="mt-4 rounded-2xl bg-green-50 dark:bg-green-950/40 px-4 py-3 text-xs leading-5 text-green-900 dark:text-green-300">The ID file uploads only to a private Storage bucket using a server-side service key. Admin document links are short-lived and server-generated.</p>
        </fieldset>

        <fieldset hidden={activeStep !== 3}>
          <legend className="text-xl font-bold text-daet-ink">Guide badge QR preview</legend>
          <p className="mt-1 text-sm leading-6 text-daet-ink/65">The badge QR contains only your guide profile ID, never your government ID details. It becomes available from “My QR Code” only after approval.</p>
          {submissionDisabled ? (
            <div className="mt-6 rounded-2xl border border-dashed border-daet-ink/20 bg-daet-sand/50 p-6 text-center text-sm leading-6 text-daet-ink/70">Connect Supabase to prepare a secure guide QR preview.</div>
          ) : qrLoading ? (
            <div className="mt-6 grid min-h-64 place-items-center rounded-2xl bg-daet-sand text-sm font-semibold text-daet-ink/70">Preparing QR preview…</div>
          ) : qrPreview?.status === "success" && qrPreview.qrDataUrl ? (
            <div className="mt-6 flex flex-col items-center rounded-2xl bg-canvas p-5 text-center sm:p-8">
              <div className="rounded-2xl card-edge bg-surface p-4"><img src={qrPreview.qrDataUrl} alt="Preview of your guide badge QR code" width={240} height={240} className="h-56 w-56 sm:h-64 sm:w-64" /></div>
              <p className="mt-4 text-sm font-bold text-daet-ink">Preview only · activates after approval</p>
              <p className="mt-1 max-w-md break-all text-xs leading-5 text-daet-ink/70">No personal or ID data is encoded. Your final badge image is protected until the Tourism Office approves your application.</p>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-900 dark:text-red-300" role="alert">
              {qrPreview?.message ?? "QR preview is unavailable."}
              <button type="button" onClick={() => { previewRequested.current = false; setQrPreview(null); setPreviewAttempt((attempt) => attempt + 1); }} className="ml-2 font-bold underline underline-offset-4">Try again</button>
            </div>
          )}
        </fieldset>

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-daet-ink/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => { setClientError(""); setActiveStep((step) => Math.max(1, step - 1)); }} disabled={activeStep === 1 || busy} className="inline-flex min-h-12 items-center justify-center rounded-full border border-daet-ink/15 px-6 text-sm font-bold text-daet-ink transition hover:bg-daet-sand disabled:cursor-not-allowed disabled:opacity-40">Back</button>
          {activeStep < 3 ? (
            <button type="button" onClick={() => { setClientError(""); if (validateStep(activeStep)) setActiveStep((step) => Math.min(3, step + 1)); }} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-daet-forest px-7 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">Continue <span aria-hidden="true">→</span></button>
          ) : (
            <button type="submit" disabled={busy || submissionDisabled || qrPreview?.status !== "success"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-daet-forest px-7 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {compressing ? "Optimizing private ID upload…" : actionPending || transitionPending ? "Submitting…" : submissionDisabled ? "Connect Supabase to submit" : "Submit for approval"}
            </button>
          )}
        </div>
      </form>
      <p className="mt-4 text-center text-xs leading-5 text-daet-ink/70">Your application stays pending until reviewed by the Daet Tourism Office. No dashboard or downloadable badge QR is available before approval.</p>
    </section>
  );
}
