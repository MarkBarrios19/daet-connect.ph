"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  INITIAL_OPERATOR_SUBMISSION_STATE,
  type OperatorActionState,
} from "@/lib/tours/operator-action-state";
import { compressOperatorImage } from "@/lib/tours/compress-image";
import { MAX_OPERATOR_TOTAL_UPLOAD_BYTES } from "@/lib/tours/operator-upload-validation";
import { submitOperatorRegistration } from "@/app/(subsystems)/tours/operator/actions";
import { Notice } from "@/components/ui/notice";

type FileField = "dtiDocument" | "businessPermit" | "gcashQr";
type DetailsField = "businessName" | "contactPerson" | "contactEmail" | "contactPhone" | "businessAddress";
type FormValues = Record<DetailsField, string>;
type SelectedFiles = Record<FileField, File | null>;

const FILE_FIELDS: FileField[] = ["dtiDocument", "businessPermit", "gcashQr"];
const FIELD_STEP: Record<string, number> = {
  businessName: 1,
  contactPerson: 1,
  contactEmail: 1,
  contactPhone: 1,
  businessAddress: 1,
  dtiDocument: 2,
  businessPermit: 2,
  gcashQr: 3,
};

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">
      {message}
    </p>
  ) : null;
}

export function OperatorRegistrationForm({
  initialEmail = "",
  rejectionReason,
  submissionDisabled = false,
}: {
  initialEmail?: string;
  rejectionReason?: string | null;
  submissionDisabled?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, actionPending] = useActionState<OperatorActionState, FormData>(
    submitOperatorRegistration,
    INITIAL_OPERATOR_SUBMISSION_STATE,
  );
  const [isDispatchPending, startTransition] = useTransition();
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
  const [compressing, setCompressing] = useState(false);
  const [clientError, setClientError] = useState("");
  const [values, setValues] = useState<FormValues>({
    businessName: "",
    contactPerson: "",
    contactEmail: initialEmail,
    contactPhone: "",
    businessAddress: "",
  });
  const [files, setFiles] = useState<SelectedFiles>({
    dtiDocument: null,
    businessPermit: null,
    gcashQr: null,
  });

  const busy = actionPending || isDispatchPending || compressing;
  const fieldErrors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "success") {
      router.replace("/tours/operator/pending");
      return;
    }
    if (state.status === "error" && state.fieldErrors) {
      const firstInvalidField = Object.keys(state.fieldErrors)[0];
      setActiveStep(FIELD_STEP[firstInvalidField] ?? 1);
    }
  }, [router, state.status, state.fieldErrors]);

  function updateValue(field: DetailsField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setClientError("");
  }

  function updateFile(field: FileField, file: File | null) {
    setFiles((current) => ({ ...current, [field]: file }));
    setClientError("");
  }

  function validateCurrentStep(step: number): boolean {
    const form = formRef.current;
    if (!form) return false;
    const inputs = Array.from(form.querySelectorAll<HTMLElement>(`[data-step-field="${step}"]`));
    for (const input of inputs) {
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        if (!input.checkValidity()) {
          input.reportValidity();
          return false;
        }
      }
    }
    if (step === 2 && (!files.dtiDocument || !files.businessPermit)) {
      setClientError("Add both your DTI registration document and business permit to continue.");
      return false;
    }
    return true;
  }

  function buildFormData(): FormData {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => formData.set(key, value));
    FILE_FIELDS.forEach((field) => {
      const file = files[field];
      if (file) formData.set(field, file, file.name);
    });
    return formData;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setClientError("");

    const formData = buildFormData();
    setCompressing(true);
    try {
      for (const field of FILE_FIELDS) {
        const file = files[field];
        if (!file || !file.type.startsWith("image/")) continue;
        const compressed = await compressOperatorImage(file, field === "gcashQr");
        formData.set(field, compressed, compressed.name);
      }

      const uploadBytes = FILE_FIELDS.reduce((sum, field) => {
        const value = formData.get(field);
        return sum + (value instanceof File ? value.size : 0);
      }, 0);
      if (uploadBytes > MAX_OPERATOR_TOTAL_UPLOAD_BYTES) {
        setClientError("The combined file size must be 15 MB or less. Choose smaller images or PDFs.");
        return;
      }

      // useActionState dispatches within a React transition so pending UI and
      // server-action state remain coordinated after async image compression.
      startTransition(() => formAction(formData));
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Image optimization failed. Please try again.",
      );
    } finally {
      setCompressing(false);
    }
  }

  const steps = [
    { number: 1, title: "Business info", short: "Your details" },
    { number: 2, title: "DTI & permit", short: "Documents" },
    { number: 3, title: "GCash QR", short: "Payout setup" },
  ];

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-7">
        <h1 className="display-2 mt-2 text-daet-ink">
          Let’s get your tours on the map.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-daet-ink/70">
          Share a few business details and upload your documents. The Daet Tourism Office reviews every application before a tour listing goes live.
        </p>
      </div>

      <div className="mb-5 rounded-2xl border-daet-forest/10 bg-surface px-4 py-4 sm:px-6">
        <ol className="grid grid-cols-3 gap-2" aria-label="Application steps">
          {steps.map((step) => {
            const complete = activeStep > step.number;
            const active = activeStep === step.number;
            return (
              <li key={step.number} className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      complete || active
                        ? "bg-daet-forest text-white"
                        : "bg-daet-sand text-daet-ink/70"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    {complete ? "✓" : step.number}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-xs font-bold sm:text-sm ${active ? "text-daet-forest dark:text-blue-300" : "text-daet-ink/65"}`}>
                      {step.title}
                    </span>
                    <span className="hidden text-sm text-slate-600 dark:text-slate-400 sm:block">{step.short}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-daet-sand" aria-hidden="true">
          <div
            className="h-full rounded-full bg-daet-forest transition-all duration-300"
            style={{ width: `${(activeStep / 3) * 100}%` }}
          />
        </div>
      </div>

      <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
        {rejectionReason ? (
          <Notice variant="warning" title="A few updates are needed before approval" className="mb-6">
            {rejectionReason}
          </Notice>
        ) : null}

        {state.status === "error" && !state.fieldErrors ? (
          <Notice variant="error" title="We couldn’t submit your application" className="mb-6">
            {state.message}
          </Notice>
        ) : null}
        {clientError ? (
          <Notice variant="error" title="Please check your files" className="mb-6">
            {clientError}
          </Notice>
        ) : null}

        <fieldset hidden={activeStep !== 1}>
          <legend className="text-xl font-bold text-daet-ink">Business information</legend>
          <p className="mt-1 text-sm leading-6 text-daet-ink/65">Use the contact details where the Tourism Office can reach you.</p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="block sm:col-span-2">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Registered business name <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <input
                data-step-field="1"
                name="businessName"
                value={values.businessName}
                onChange={(event) => updateValue("businessName", event.target.value)}
                required={activeStep === 1}
                maxLength={160}
                autoComplete="organization"
                placeholder="e.g. Bagasbas Coast Tours"
                aria-invalid={Boolean(fieldErrors.businessName)}
                aria-describedby={fieldErrors.businessName ? "businessName-error" : undefined}
                className="mt-2 min-h-12 w-full rounded-2xl border border-daet-ink/15 bg-surface px-4 text-base outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700"
              />
              </label>
              <FieldError id="businessName-error" message={fieldErrors.businessName} />
              </div>

            <div className="block">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Authorized contact person <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <input
                data-step-field="1"
                name="contactPerson"
                value={values.contactPerson}
                onChange={(event) => updateValue("contactPerson", event.target.value)}
                required={activeStep === 1}
                maxLength={120}
                autoComplete="name"
                placeholder="Full name"
                aria-invalid={Boolean(fieldErrors.contactPerson)}
                aria-describedby={fieldErrors.contactPerson ? "contactPerson-error" : undefined}
                className="mt-2 min-h-12 w-full rounded-2xl border border-daet-ink/15 bg-surface px-4 text-base outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700"
              />
              </label>
              <FieldError id="contactPerson-error" message={fieldErrors.contactPerson} />
              </div>

            <div className="block">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Mobile or contact number <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <input
                data-step-field="1"
                name="contactPhone"
                type="tel"
                value={values.contactPhone}
                onChange={(event) => updateValue("contactPhone", event.target.value)}
                required={activeStep === 1}
                maxLength={24}
                autoComplete="tel"
                placeholder="09XX XXX XXXX"
                aria-invalid={Boolean(fieldErrors.contactPhone)}
                aria-describedby={fieldErrors.contactPhone ? "contactPhone-error" : undefined}
                className="mt-2 min-h-12 w-full rounded-2xl border border-daet-ink/15 bg-surface px-4 text-base outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700"
              />
              </label>
              <FieldError id="contactPhone-error" message={fieldErrors.contactPhone} />
              </div>

            <div className="block sm:col-span-2">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Business email <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <input
                data-step-field="1"
                name="contactEmail"
                type="email"
                value={values.contactEmail}
                onChange={(event) => updateValue("contactEmail", event.target.value)}
                required={activeStep === 1}
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(fieldErrors.contactEmail)}
                aria-describedby={fieldErrors.contactEmail ? "contactEmail-error" : undefined}
                className="mt-2 min-h-12 w-full rounded-2xl border border-daet-ink/15 bg-surface px-4 text-base outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700"
              />
              </label>
              <FieldError id="contactEmail-error" message={fieldErrors.contactEmail} />
              </div>

            <div className="block sm:col-span-2">
              <label className="block">
              <span className="text-sm font-bold text-daet-ink">Business address <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
              <textarea
                data-step-field="1"
                name="businessAddress"
                value={values.businessAddress}
                onChange={(event) => updateValue("businessAddress", event.target.value)}
                required={activeStep === 1}
                maxLength={300}
                rows={3}
                autoComplete="street-address"
                placeholder="Barangay, municipality, province"
                aria-invalid={Boolean(fieldErrors.businessAddress)}
                aria-describedby={fieldErrors.businessAddress ? "businessAddress-error" : undefined}
                className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-surface px-4 py-3 text-base outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:border-red-700"
              />
              </label>
              <FieldError id="businessAddress-error" message={fieldErrors.businessAddress} />
              </div>
          </div>
        </fieldset>

        <fieldset hidden={activeStep !== 2}>
          <legend className="text-xl font-bold text-daet-ink">Business documents</legend>
          <p className="mt-1 text-sm leading-6 text-daet-ink/65">Upload readable photos or PDFs. Make sure the business name and validity dates are visible.</p>

          <div className="mt-6 grid gap-4">
            {([
              {
                field: "dtiDocument" as const,
                title: "DTI / business registration document",
                description: "DTI certificate, SEC registration, or applicable business registration.",
                accept: "image/jpeg,image/png,image/webp,application/pdf,.pdf",
                requiredText: "DTI or registration document",
              },
              {
                field: "businessPermit" as const,
                title: "Mayor’s / business permit",
                description: "Upload your current municipal business permit.",
                accept: "image/jpeg,image/png,image/webp,application/pdf,.pdf",
                requiredText: "Business permit",
              },
            ]).map((item) => (
              <label key={item.field} className="block rounded-2xl bg-canvas p-4 sm:p-5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-daet-ink">
                  {item.title} <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span>
                </span>
                <span className="mt-1 block text-sm leading-6 text-daet-ink/70">{item.description}</span>
                <input
                  data-step-field="2"
                  name={item.field}
                  type="file"
                  accept={item.accept}
                  required={activeStep === 2 && !files[item.field]}
                  onChange={(event) => updateFile(item.field, event.target.files?.[0] ?? null)}
                  aria-invalid={Boolean(fieldErrors[item.field])}
                  aria-describedby={fieldErrors[item.field] ? `${item.field}-error` : undefined}
                  className="mt-4 block min-h-11 w-full cursor-pointer rounded-2xl border border-daet-ink/15 bg-surface text-sm text-daet-ink file:mr-3 file:min-h-11 file:border-0 file:bg-daet-forest file:px-4 file:font-bold file:text-white hover:file:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-daet-forest/10"
                />
                {files[item.field] ? (
                  <span className="mt-3 flex items-start justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <span className="min-w-0 break-all font-semibold">{files[item.field]?.name}</span>
                    <span className="shrink-0">{formatFileSize(files[item.field]?.size ?? 0)}</span>
                  </span>
                ) : null}
                <FieldError id={`${item.field}-error`} message={fieldErrors[item.field]} />
              </label>
            ))}
          </div>

          <p className="mt-4 rounded-2xl bg-green-50 dark:bg-green-950/40 px-4 py-3 text-xs leading-5 text-green-900 dark:text-green-300">
            Image files are optimized on this device before upload. PDFs are uploaded as-is. Each file must be 5 MB or less.
          </p>
        </fieldset>

        <fieldset hidden={activeStep !== 3}>
          <legend className="text-xl font-bold text-daet-ink">GCash QR code</legend>
          <p className="mt-1 text-sm leading-6 text-daet-ink/65">Tourists will use this QR to pay you directly. The platform does not collect or route payments.</p>

          <div className="mt-6 block rounded-2xl border border-dashed border-daet-forest/30 bg-daet-sand/50 p-5 sm:p-7">
            <label className="block">
            <span className="block text-sm font-bold text-daet-ink">Your business GCash QR <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span></span>
            <span className="mt-1 block text-sm leading-6 text-daet-ink/70">Upload a clear JPG, PNG, or WebP image. Do not upload a screenshot containing your balance or transaction history.</span>
            <input
              data-step-field="3"
              name="gcashQr"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={activeStep === 3 && !files.gcashQr}
              onChange={(event) => updateFile("gcashQr", event.target.files?.[0] ?? null)}
              aria-invalid={Boolean(fieldErrors.gcashQr)}
              aria-describedby={fieldErrors.gcashQr ? "gcashQr-error" : undefined}
              className="mt-4 block min-h-11 w-full cursor-pointer rounded-2xl border border-daet-ink/15 bg-surface text-sm text-daet-ink file:mr-3 file:min-h-11 file:border-0 file:bg-daet-forest file:px-4 file:font-bold file:text-white hover:file:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-daet-forest/10"
            />
            {files.gcashQr ? (
              <span className="mt-3 flex items-start justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
                <span className="min-w-0 break-all font-semibold">{files.gcashQr.name}</span>
                <span className="shrink-0">{formatFileSize(files.gcashQr.size)}</span>
              </span>
            ) : null}
            </label>
            <FieldError id="gcashQr-error" message={fieldErrors.gcashQr} />
            </div>

          <Notice variant="info" title="Your application stays private" className="mt-5">
            Your documents and payment QR are kept in private storage. Only authorized Tourism Office reviewers can open the application documents.
          </Notice>
        </fieldset>

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-daet-ink/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => {
              setClientError("");
              setActiveStep((step) => Math.max(1, step - 1));
            }}
            disabled={activeStep === 1 || busy}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-daet-ink/15 px-6 text-sm font-bold text-daet-ink transition hover:bg-daet-sand disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>

          {activeStep < 3 ? (
            <button
              type="button"
              onClick={() => {
                setClientError("");
                if (validateCurrentStep(activeStep)) setActiveStep((step) => Math.min(3, step + 1));
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-daet-forest px-7 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-daet-forest/20"
            >
              Continue <span aria-hidden="true">→</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy || submissionDisabled}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-daet-forest px-7 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-daet-forest/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {compressing ? "Preparing secure upload…" : actionPending || isDispatchPending ? "Submitting…" : submissionDisabled ? "Connect Supabase to submit" : "Submit for approval"}
              {!busy && !submissionDisabled ? <span aria-hidden="true">↗</span> : null}
            </button>
          )}
        </div>
      </form>

      <p className="mt-4 text-center text-xs leading-5 text-daet-ink/70">
        By submitting, you confirm these business documents are accurate and agree to the Tourism Office’s accreditation review.
      </p>
    </section>
  );
}
