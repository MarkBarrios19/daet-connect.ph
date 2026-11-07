"use client";

import React, { useState, useCallback, useMemo, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  EditPackageRecord,
  EditPackageFormData,
  UpdatePackageResponse,
  ValidationErrors,
  ActionStatusCode,
} from "./edit-types";
import { updatePackageCore, submitPackageForReview } from "./actions";
import { detectChanges, hasConcurrencyConflict } from "./change-detection";
import { EDIT_MESSAGES, SUCCESS_TOAST_MS } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { RejectionNotice } from "./RejectionNotice";
import { BasicDetailsStep } from "./BasicDetailsStep";
import { CoverImageStep } from "./CoverImageStep";
import { PricingStep } from "./PricingStep";
import { InclusionsStep } from "./InclusionsStep";
import { StopsStep } from "./StopsStep";
import { GalleryStep } from "./GalleryStep";

interface FormState {
  originalData: EditPackageFormData;
  formData: EditPackageFormData;
  updatedAt: string;
  hasChanges: boolean;
  isSubmitting: boolean;
  submissionError: string | null;
  successMessage: string | null;
  concurrencyError: string | null;
  validationErrors: ValidationErrors;
}

interface EditPackageFormProps {
  packageData: EditPackageRecord;
}

/**
 * Toast notification component
 */
export function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={`fixed bottom-4 right-4 px-6 py-4 rounded-2xl shadow-[var(--shadow-float)] z-50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ${
        type === "success" ? "bg-green-500 text-slate-950" : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? (
        <svg aria-hidden="true" className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )}
      <span className="text-sm font-medium">{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="-my-2 -mr-2 ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-inherit hover:opacity-75"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Loading overlay component
 */
function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="card-edge bg-surface rounded-2xl p-8 flex flex-col items-center gap-4">
        <div className="animate-spin">
          <svg className="w-8 h-8 text-daet-leaf dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <p className="text-daet-ink/80 font-medium">Saving changes...</p>
      </div>
    </div>
  );
}

/**
 * Error banner component
 */
function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 rounded-2xl flex items-start gap-4">
      <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      <div className="flex-1">
        <p className="text-red-800 dark:text-red-300 text-sm font-medium">{message}</p>
      </div>
      <button onClick={onDismiss} className="text-red-500 hover:text-red-700 dark:hover:text-red-300">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Concurrency conflict banner component
 */
function ConcurrencyConflictBanner({
  onReload,
  onDismiss,
}: {
  onReload: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-950/40 rounded-2xl flex items-start gap-4">
      <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-200 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <div className="flex-1">
        <p className="text-yellow-800 dark:text-yellow-200 text-sm font-medium mb-2">{EDIT_MESSAGES.conflict}</p>
        <div className="flex gap-2">
          <button
            onClick={onReload}
            className="inline-flex min-h-11 items-center justify-center px-3 py-1 bg-yellow-600 text-white text-sm rounded-2xl hover:bg-yellow-700 transition"
          >
            Reload
          </button>
          <button
            onClick={onDismiss}
            className="inline-flex min-h-11 items-center justify-center px-3 py-1 border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-200 text-sm rounded-2xl hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * EditPackageForm Component
 *
 * Main client component for editing a package with:
 * - Form state management (originalData, formData, hasChanges, isSubmitting)
 * - Change detection for dirty state
 * - Field change handlers with validation
 * - Save Draft and Submit for Review handlers
 * - Proper error handling and user feedback
 * - Step-based form rendering
 * - Status-aware field disabling
 */
export function EditPackageForm({ packageData }: EditPackageFormProps) {
  const router = useRouter();

  // Initialize form state
  const [state, setState] = useState<FormState>({
    originalData: packageData.formData,
    formData: { ...packageData.formData },
    updatedAt: packageData.updatedAt,
    hasChanges: false,
    isSubmitting: false,
    submissionError: null,
    successMessage: null,
    concurrencyError: null,
    validationErrors: {},
  });

  // Get edit permissions based on package status
  const permissions = useMemo(() => getEditPermissions(packageData.status), [packageData.status]);

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: keyof EditPackageFormData, value: unknown) => {
      setState((prev) => {
        const updated = { ...prev.formData, [field]: value };
        const hasChanges = detectChanges(prev.originalData, updated);

        return {
          ...prev,
          formData: updated,
          hasChanges,
          // Let the operator retry after correcting a server-reported field
          // error instead of leaving Save disabled with stale validation.
          submissionError: null,
          validationErrors: {},
        };
      });
    },
    []
  );

  // Handle Save Draft
  const handleSaveDraft = useCallback(async () => {
    if (!state.hasChanges || state.isSubmitting) return;

    setState((prev) => ({
      ...prev,
      isSubmitting: true,
      submissionError: null,
      concurrencyError: null,
    }));

    try {
      const response: UpdatePackageResponse = await updatePackageCore(packageData.id, state.formData, state.updatedAt);

      if (response.success) {
        setState((prev) => ({
          ...prev,
          originalData: state.formData,
          updatedAt: response.updatedAt ?? prev.updatedAt,
          hasChanges: false,
          isSubmitting: false,
          successMessage:
            response.data?.status === "pending_review" ? EDIT_MESSAGES.sentForReview : EDIT_MESSAGES.saved,
          submissionError: null,
          concurrencyError: null,
        }));

        // Refresh server-rendered data while retaining the version returned by
        // the save, so the next edit uses the new timestamp instead of sending
        // a stale version and triggering a false concurrency conflict.
        router.refresh();

        // Auto-dismiss success message
        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            successMessage: null,
          }));
        }, SUCCESS_TOAST_MS);
      } else {
        if (response.status === 409) {
          setState((prev) => ({
            ...prev,
            isSubmitting: false,
            concurrencyError: EDIT_MESSAGES.conflict,
            submissionError: null,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            isSubmitting: false,
            submissionError: response.message || EDIT_MESSAGES.unexpected,
            validationErrors: response.errors || {},
          }));
        }
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isSubmitting: false,
        submissionError: EDIT_MESSAGES.unexpected,
      }));
    }
  }, [state, packageData.id, router]);

  // Handle Submit for Review
  const handleSubmitForReview = useCallback(async () => {
    if (!state.hasChanges || state.isSubmitting) return;

    setState((prev) => ({
      ...prev,
      isSubmitting: true,
      submissionError: null,
      concurrencyError: null,
    }));

    try {
      const response: UpdatePackageResponse = await submitPackageForReview(packageData.id, state.formData, state.updatedAt);

      if (response.success) {
        setState((prev) => ({
          ...prev,
          isSubmitting: false,
          successMessage: EDIT_MESSAGES.submitted,
        }));

        // Redirect after success
        setTimeout(() => {
          router.push(`/tours/operator/packages/${packageData.id}`);
        }, 500);
      } else {
        if (response.status === 409) {
          setState((prev) => ({
            ...prev,
            isSubmitting: false,
            concurrencyError: EDIT_MESSAGES.conflict,
            submissionError: null,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            isSubmitting: false,
            submissionError: response.message || EDIT_MESSAGES.unexpected,
            validationErrors: response.errors || {},
          }));
        }
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isSubmitting: false,
        submissionError: EDIT_MESSAGES.unexpected,
      }));
    }
  }, [state, packageData.id, router]);

  // Determine button states
  const isButtonDisabled =
    state.isSubmitting ||
    !state.hasChanges ||
    Object.keys(state.validationErrors).length > 0;

  const hasPermissionToSubmit = permissions.canSubmitForReview;

  // Handle reload for concurrency conflict
  const handleReloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  // Handle dismiss concurrency error
  const handleDismissConcurrency = useCallback(() => {
    setState((prev) => ({
      ...prev,
      concurrencyError: null,
    }));
  }, []);

  // Handle dismiss submission error
  const handleDismissError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      submissionError: null,
    }));
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
      }}
      className="space-y-8"
    >
      {state.isSubmitting && <LoadingOverlay />}

      {/* Rejection Notice */}
      {packageData.status === "rejected" && packageData.rejectionReason && (
        <RejectionNotice reason={packageData.rejectionReason} />
      )}

      {packageData.status === "published" && (
        <div
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          This package is live. Saving updates the public listing immediately without a review step and may affect existing bookings. If another session saves first, refresh and reapply your changes.
        </div>
      )}

      {/* Concurrency Conflict Banner */}
      {state.concurrencyError && (
        <ConcurrencyConflictBanner onReload={handleReloadPage} onDismiss={handleDismissConcurrency} />
      )}

      {/* Error Banner */}
      {state.submissionError && (
        <ErrorBanner message={state.submissionError} onDismiss={handleDismissError} />
      )}

      {/* Success Toast */}
      {state.successMessage && (
        <Toast
          message={state.successMessage}
          type="success"
          onClose={() =>
            setState((prev) => ({
              ...prev,
              successMessage: null,
            }))
          }
        />
      )}

      {/* Basic Details Step */}
      <BasicDetailsStep
        data={state.formData}
        originalData={state.originalData}
        packageStatus={packageData.status}
        onUpdate={(data) => {
          handleFieldChange("title", data.title);
          handleFieldChange("locationName", data.locationName);
          handleFieldChange("description", data.description);
          handleFieldChange("durationValue", data.durationValue);
          handleFieldChange("durationType", data.durationType);
        }}
        errors={state.validationErrors}
        loading={state.isSubmitting}
      />

      {/* Cover Image Step */}
      <CoverImageStep
        packageId={packageData.id}
        data={{
          coverImageUrl: state.formData.coverImageUrl,
        }}
        originalData={{
          coverImageUrl: state.originalData.coverImageUrl,
        }}
        packageStatus={packageData.status}
        onUpdate={(data) => handleFieldChange("coverImageUrl", data.coverImageUrl)}
        errors={state.validationErrors}
        loading={state.isSubmitting}
      />

      {/* Pricing Step */}
      <PricingStep
        data={state.formData.priceVariants}
        originalData={state.originalData.priceVariants}
        packageStatus={packageData.status}
        onUpdate={(data) => handleFieldChange("priceVariants", data)}
        errors={state.validationErrors}
        loading={state.isSubmitting}
      />

      {/* Inclusions Step */}
      <InclusionsStep
        data={state.formData.inclusions}
        originalData={state.originalData.inclusions}
        packageStatus={packageData.status}
        onUpdate={(data) => handleFieldChange("inclusions", data)}
        errors={state.validationErrors}
        loading={state.isSubmitting}
      />

      {/* Stops Step */}
      <StopsStep
        data={state.formData.stops}
        originalData={state.originalData.stops}
        packageStatus={packageData.status}
        onUpdate={(data) => handleFieldChange("stops", data)}
        errors={state.validationErrors}
        loading={state.isSubmitting}
      />

      {/* Gallery Step */}
      <GalleryStep
        packageId={packageData.id}
        data={state.formData.galleryImages}
        originalData={state.originalData.galleryImages}
        packageStatus={packageData.status}
        onUpdate={(data) => handleFieldChange("galleryImages", data)}
        errors={state.validationErrors}
        loading={state.isSubmitting}
      />

      {/* Action Buttons */}
      <div className="flex gap-4 justify-end pt-8 border-t">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isButtonDisabled}
          className="inline-flex min-h-11 items-center justify-center px-6 py-2 border border-daet-ink/20 text-daet-ink/80 rounded-2xl font-medium hover:bg-canvas transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {packageData.status === "published" ? "Save changes" : "Save as Draft"}
        </button>
        {hasPermissionToSubmit && (
          <button
            type="button"
            onClick={handleSubmitForReview}
            disabled={isButtonDisabled}
            className="inline-flex min-h-11 items-center justify-center px-6 py-2 bg-daet-forest text-white rounded-2xl font-medium hover:bg-daet-leaf transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit for Review
          </button>
        )}
      </div>
    </form>
  );
}
