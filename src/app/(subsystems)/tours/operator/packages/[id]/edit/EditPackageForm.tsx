"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  EditPackageFormData,
  EditPackageRecord,
  UpdatePackageResponse,
  ValidationErrors,
} from "./edit-types";
import { updatePackageCore, submitPackageForReview } from "./actions";
import { detectChanges } from "./change-detection";
import { EDIT_MESSAGES, SUCCESS_TOAST_MS, STATUS_LABELS } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { RejectionNotice } from "./RejectionNotice";
import { BasicDetailsStep } from "./BasicDetailsStep";
import { CoverImageStep } from "./CoverImageStep";
import { PricingStep } from "./PricingStep";
import { InclusionsStep } from "./InclusionsStep";
import { StopsStep } from "./StopsStep";
import { GalleryStep } from "./GalleryStep";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { SectionNav } from "@/components/ui/section-nav";
import { focusSection } from "@/components/ui/section-card";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes";
import {
  EDITOR_SECTIONS,
  type EditorSectionId,
  countUnsavedSections,
  firstSectionWithErrors,
  sectionIsDirty,
  statusExplanation,
} from "./editor-sections";

interface EditPackageFormProps {
  packageData: EditPackageRecord;
}

const STATUS_TONES: Record<EditPackageRecord["status"], BadgeTone> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  rejected: "danger",
  archived: "neutral",
};

/**
 * The operator's package editor.
 *
 * One page, six sections, one place to save. A wide screen gets a sticky
 * sidebar; a phone gets a "Jump to section" dropdown. The save bar appears only
 * while there is something to save, says how many sections have changed, and
 * sits above the phone tab bar rather than over it. Leaving — by a link or by
 * closing the tab — asks first.
 *
 * Nothing here writes on its own: every field and every modal applies its
 * change to this form's state, and Save sends the whole package in one call, so
 * a half-finished edit is never published.
 */
export function EditPackageForm({ packageData }: EditPackageFormProps) {
  const router = useRouter();

  const [originalData, setOriginalData] = useState<EditPackageFormData>(packageData.formData);
  const [formData, setFormData] = useState<EditPackageFormData>({ ...packageData.formData });
  const [updatedAt, setUpdatedAt] = useState(packageData.updatedAt);
  const [status, setStatus] = useState(packageData.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [concurrencyError, setConcurrencyError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const permissions = useMemo(() => getEditPermissions(status), [status]);

  const hasChanges = useMemo(() => detectChanges(originalData, formData), [originalData, formData]);
  const changeCount = useMemo(() => countUnsavedSections(originalData, formData), [originalData, formData]);
  const errorCount = Object.keys(validationErrors).length;

  const dirtyById = Object.fromEntries(
    EDITOR_SECTIONS.map((section) => [section.id, sectionIsDirty(section.id, originalData, formData)]),
  ) as Record<EditorSectionId, boolean>;
  const sections = EDITOR_SECTIONS.map((section) => ({
    id: section.anchor,
    label: section.label,
    dirty: dirtyById[section.id],
    hasError: section.hasErrors(validationErrors),
  }));

  /**
   * One change to the form. Any server message about the fields goes, because
   * the person is now changing what it was about; a concurrency conflict stays,
   * because it still needs a reload.
   */
  const update = useCallback((field: keyof EditPackageFormData, value: unknown) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setSubmissionError(null);
    setValidationErrors({});
  }, []);

  const showSection = (anchor: string) => {
    // Let React paint the error state first, then take the person to it.
    window.setTimeout(() => focusSection(anchor), 0);
  };

  /** A failed save: say what happened in the bar, and go to the first bad field. */
  const failed = (response: UpdatePackageResponse) => {
    setValidationErrors(response.errors ?? {});
    const section = firstSectionWithErrors(response.errors ?? {});
    if (section) showSection(section.anchor);
  };

  const save = useCallback(
    async ({ forReview }: { forReview: boolean }) => {
      if (isSubmitting) return;
      if (!forReview && !hasChanges) return;

      setIsSubmitting(true);
      setSubmissionError(null);
      setConcurrencyError(null);

      try {
        const response: UpdatePackageResponse = forReview
          ? await submitPackageForReview(packageData.id, formData, updatedAt)
          : await updatePackageCore(packageData.id, formData, updatedAt);

        if (response.success) {
          setOriginalData(formData);
          setUpdatedAt(response.updatedAt ?? updatedAt);
          setValidationErrors({});
          if (response.data?.status) setStatus(response.data.status);
          setSuccessMessage(
            forReview
              ? EDIT_MESSAGES.submitted
              : response.data?.status === "pending_review"
                ? EDIT_MESSAGES.sentForReview
                : EDIT_MESSAGES.saved,
          );
          setIsSubmitting(false);
          // Refresh the server's copy while keeping the version the save returned,
          // so the next save does not send a stale timestamp.
          router.refresh();
          if (forReview) {
            router.push(`/tours/operator/packages/${packageData.id}`);
            return;
          }
          window.setTimeout(() => setSuccessMessage(null), SUCCESS_TOAST_MS);
          return;
        }

        setIsSubmitting(false);
        if (response.status === 409) {
          setConcurrencyError(EDIT_MESSAGES.conflict);
          return;
        }
        setSubmissionError(response.message || EDIT_MESSAGES.unexpected);
        failed(response);
      } catch {
        setIsSubmitting(false);
        setSubmissionError(EDIT_MESSAGES.unexpected);
      }
    },
    [formData, hasChanges, isSubmitting, packageData.id, router, updatedAt],
  );

  const discard = () => {
    setFormData({ ...originalData });
    setValidationErrors({});
    setSubmissionError(null);
    setDiscardOpen(false);
  };

  const canSubmit = permissions.canSubmitForReview;
  // A draft can only go for review once it is saved and complete.
  const submitReady = canSubmit && !hasChanges && errorCount === 0 && !isSubmitting;
  const saveLabel =
    status === "published" ? "Save changes" : status === "rejected" ? "Save changes" : "Save draft";

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      // Room for the save bar, so it never covers the last field. The bar is
      // above the phone tab bar, so this clears both.
      className="pb-[calc(11rem+var(--tab-bar-h))]"
    >
      <UnsavedChangesGuard
        when={hasChanges && permissions.canEdit}
        changes={changeCount}
        // Save, discard and submit each ask their own question first; leaving is
        // not stacked on top of it.
        holding={discardOpen || submitOpen}
      />

      {/* The header: what this is, where it stands, and what this status allows. */}
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display-2 text-daet-ink">{formData.title || "Untitled package"}</h1>
              <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-daet-ink/80">{statusExplanation(status)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status === "published" ? (
              <Link
                href={`/tours/packages/${packageData.id}`}
                className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
              >
                View public page
              </Link>
            ) : null}
            <Link
              href={`/tours/operator/packages/${packageData.id}`}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-daet-ink ring-1 ring-inset ring-daet-ink/20 hover:bg-muted"
            >
              Overview
            </Link>
          </div>
        </div>
      </header>

      {status === "rejected" && packageData.rejectionReason ? (
        <div className="mb-6">
          <RejectionNotice reason={packageData.rejectionReason} />
        </div>
      ) : null}

      {concurrencyError ? (
        <Notice variant="warning" title="Someone else changed this package" className="mb-6">
          <p>{EDIT_MESSAGES.conflict}</p>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="ghost" onClick={() => setConcurrencyError(null)}>
              Dismiss
            </Button>
          </div>
        </Notice>
      ) : null}

      {/* Saving status, announced rather than only shown. */}
      <div role="status" aria-live="polite" className="sr-only">
        {isSubmitting ? "Saving changes" : successMessage ?? ""}
        {submissionError ? `. ${submissionError}` : ""}
      </div>
      {successMessage ? (
        <div className="mb-6 rounded-2xl bg-green-50 p-3 text-sm font-medium text-green-900 dark:bg-green-950/40 dark:text-green-200">
          {successMessage}
        </div>
      ) : null}

      {/* The phone's section picker, then the page's two columns. */}
      <div className="lg:hidden">
        <SectionNav sections={sections} compact />
      </div>
      <div className="mt-4 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="hidden lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:block">
          <SectionNav sections={sections} />
        </aside>

        <div className="min-w-0 space-y-4">
          <BasicDetailsStep
            id="basics-section"
            dirty={dirtyById.basics}
            data={formData}
            originalData={originalData}
            packageStatus={status}
            onUpdate={(data) => {
              setFormData((current) => ({ ...current, ...data }));
              setSubmissionError(null);
              setValidationErrors({});
            }}
            errors={validationErrors}
            loading={isSubmitting}
          />

          <CoverImageStep
            id="photos-section"
            dirty={dirtyById.photos}
            packageId={packageData.id}
            data={{ coverImageUrl: formData.coverImageUrl }}
            originalData={{ coverImageUrl: originalData.coverImageUrl }}
            packageStatus={status}
            onUpdate={(data) => update("coverImageUrl", data.coverImageUrl)}
            errors={validationErrors}
            loading={isSubmitting}
          />

          <PricingStep
            id="prices-section"
            dirty={dirtyById.prices}
            data={formData.priceVariants}
            originalData={originalData.priceVariants}
            packageStatus={status}
            onUpdate={(data) => update("priceVariants", data)}
            errors={validationErrors}
            loading={isSubmitting}
          />

          <InclusionsStep
            id="included-section"
            dirty={dirtyById.included}
            data={formData.inclusions}
            originalData={originalData.inclusions}
            packageStatus={status}
            onUpdate={(data) => update("inclusions", data)}
            errors={validationErrors}
            loading={isSubmitting}
          />

          <StopsStep
            id="stops-section"
            dirty={dirtyById.stops}
            data={formData.stops}
            originalData={originalData.stops}
            packageStatus={status}
            onUpdate={(data) => update("stops", data)}
            errors={validationErrors}
            loading={isSubmitting}
          />

          <GalleryStep
            id="gallery-section"
            dirty={dirtyById.gallery}
            packageId={packageData.id}
            data={formData.galleryImages}
            originalData={originalData.galleryImages}
            packageStatus={status}
            onUpdate={(data) => update("galleryImages", data)}
            errors={validationErrors}
            loading={isSubmitting}
          />
        </div>
      </div>

      <StickySaveBar
        changes={changeCount}
        saving={isSubmitting}
        error={submissionError}
        status={
          hasChanges
            ? status === "published"
              ? "These changes go live when you save."
              : "Nothing is saved until you press Save."
            : null
        }
        primaryLabel={saveLabel}
        // A draft keeps the bar: "Submit for review" has to stay reachable once
        // the draft is saved and clean.
        pinned={canSubmit}
        onSave={() => void save({ forReview: false })}
        onDiscard={() => setDiscardOpen(true)}
        secondary={
          canSubmit ? (
            <button
              type="button"
              onClick={() => setSubmitOpen(true)}
              disabled={!submitReady}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold text-daet-ink ring-1 ring-inset ring-daet-ink/20 transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Submit for review
            </button>
          ) : null
        }
      />

      <ConfirmDialog
        open={discardOpen}
        title="Discard your changes?"
        description={`All ${changeCount === 1 ? "1 change" : `${changeCount} changes`} since you opened this page will be undone.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={discard}
        onCancel={() => setDiscardOpen(false)}
      />

      <ConfirmDialog
        open={submitOpen}
        title="Send this package to the Tourism Office?"
        description="The Tourism Office will check it before tourists can book. You can still edit it here until they decide."
        confirmLabel="Send for review"
        confirmVariant="primary"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setSubmitOpen(false);
          void save({ forReview: true });
        }}
        onCancel={() => setSubmitOpen(false)}
      />
    </form>
  );
}
