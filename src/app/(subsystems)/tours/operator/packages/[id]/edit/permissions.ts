import { EDIT_MESSAGES } from "./edit-constants";
import type { EditPackageFormData, EditPackageStatus } from "./edit-types";

/**
 * Status-based edit rules. Shared by the UI (field disabling) and the server
 * (enforcement), so both sides always agree.
 *
 * - draft / rejected / published: all package fields are editable
 * - published changes go live immediately; the database still enforces data integrity
 * - pending_review / archived: read-only
 */
export interface EditPermissions {
  canEdit: boolean;
  canSubmitForReview: boolean;
  readOnlyReason: string | null;
  basic: {
    title: boolean;
    locationName: boolean;
    description: boolean;
    durationValue: boolean;
    durationType: boolean;
  };
  coverImage: boolean;
  pricing: { add: boolean; remove: boolean; editName: boolean; editPax: boolean; editPrices: boolean; setDefault: boolean };
  inclusions: { add: boolean; remove: boolean; editText: boolean; toggleIncluded: boolean; reorder: boolean };
  stops: { add: boolean; remove: boolean; editDetails: boolean; reorder: boolean };
  gallery: { add: boolean; remove: boolean; editCaption: boolean; reorder: boolean };
}

function allowAll(value: boolean): Omit<EditPermissions, "canSubmitForReview" | "readOnlyReason"> {
  return {
    canEdit: value,
    basic: { title: value, locationName: value, description: value, durationValue: value, durationType: value },
    coverImage: value,
    pricing: { add: value, remove: value, editName: value, editPax: value, editPrices: value, setDefault: value },
    inclusions: { add: value, remove: value, editText: value, toggleIncluded: value, reorder: value },
    stops: { add: value, remove: value, editDetails: value, reorder: value },
    gallery: { add: value, remove: value, editCaption: value, reorder: value },
  };
}

export function getEditPermissions(status: EditPackageStatus): EditPermissions {
  switch (status) {
    case "draft":
    case "rejected":
      return { ...allowAll(true), canSubmitForReview: true, readOnlyReason: null };
    case "published":
      // Published edits are saved live, including structural changes. The
      // server/RPC still validates the package and prevents stale overwrites.
      return { ...allowAll(true), canSubmitForReview: false, readOnlyReason: null };
    case "pending_review":
      return { ...allowAll(false), canSubmitForReview: false, readOnlyReason: EDIT_MESSAGES.pendingReview };
    case "archived":
    default:
      return { ...allowAll(false), canSubmitForReview: false, readOnlyReason: EDIT_MESSAGES.archived };
  }
}

/**
 * Compatibility helper for callers that used to check published field-level
 * restrictions. Published edits are all allowed; read-only statuses are
 * rejected outright by requireEditablePackageStatus.
 */
export function findRestrictedChanges(
  _original: EditPackageFormData,
  _next: EditPackageFormData,
  _status: EditPackageStatus,
): string[] {
  // Published packages are edited live. Package-level validation and database
  // constraints (including booked price-variant references) remain in force.
  return [];
}

/**
 * Checks status-based edit permission. The optional `changes` input remains
 * for compatibility; published fields are all editable.
 */
export function requireEditablePackageStatus(
  status: EditPackageStatus,
  changes?: { original: EditPackageFormData; next: EditPackageFormData },
): { error: { status: 403; message: string } } | { data: { status: EditPackageStatus; permissions: EditPermissions } } {
  const permissions = getEditPermissions(status);
  if (!permissions.canEdit) {
    return { error: { status: 403, message: permissions.readOnlyReason ?? EDIT_MESSAGES.forbidden } };
  }
  if (changes) {
    const violations = findRestrictedChanges(changes.original, changes.next, status);
    if (violations.length > 0) {
      return { error: { status: 403, message: violations.join(" ") } };
    }
  }
  return { data: { status, permissions } };
}
