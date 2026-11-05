import { EDIT_MESSAGES } from "./edit-constants";
import type { EditPackageFormData, EditPackageStatus } from "./edit-types";

/**
 * Status-based edit rules. Shared by the UI (field disabling) and the server
 * (enforcement), so both sides always agree.
 *
 * - draft / rejected: everything editable
 * - published: limited edits (text details, pax ranges, captions, cover); no add/remove/reorder
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
    case "published": {
      const locked = allowAll(false);
      return {
        ...locked,
        canEdit: true,
        canSubmitForReview: false,
        readOnlyReason: null,
        basic: { title: true, locationName: true, description: true, durationValue: false, durationType: true },
        coverImage: true,
        pricing: { ...locked.pricing, editPax: true },
        inclusions: { ...locked.inclusions, editText: true },
        stops: { ...locked.stops, editDetails: true },
        // Photos go live only after review: a structural gallery change on a
        // published package is allowed here, and update_package_and_relations
        // sends the package back to pending_review when one happens.
        gallery: { add: true, remove: true, editCaption: true, reorder: true },
      };
    }
    case "pending_review":
      return { ...allowAll(false), canSubmitForReview: false, readOnlyReason: EDIT_MESSAGES.pendingReview };
    case "archived":
    default:
      return { ...allowAll(false), canSubmitForReview: false, readOnlyReason: EDIT_MESSAGES.archived };
  }
}

/**
 * Lists edits that the package status does not allow. Empty array = allowed.
 * Only published packages have partial restrictions; read-only statuses are
 * rejected outright by requireEditablePackageStatus.
 */
export function findRestrictedChanges(
  original: EditPackageFormData,
  next: EditPackageFormData,
  status: EditPackageStatus,
): string[] {
  if (status !== "published") return [];
  const violations: string[] = [];

  if (original.durationValue !== next.durationValue || original.durationType !== next.durationType) {
    violations.push("Duration length cannot change on a published package.");
  }

  if (original.priceVariants.length !== next.priceVariants.length) {
    violations.push("Price variants cannot be added or removed on a published package.");
  } else {
    original.priceVariants.forEach((before, index) => {
      const after = next.priceVariants[index];
      if (
        before.id !== after.id ||
        before.variantName.trim() !== after.variantName.trim() ||
        before.pricePerPax !== after.pricePerPax ||
        before.flatPrice !== after.flatPrice ||
        before.isDefault !== after.isDefault
      ) {
        violations.push("Only pax ranges can change on a published package's price variants.");
      }
    });
  }

  if (original.inclusions.length !== next.inclusions.length) {
    violations.push("Inclusions cannot be added or removed on a published package.");
  } else {
    original.inclusions.forEach((before, index) => {
      const after = next.inclusions[index];
      if (
        before.id !== after.id ||
        before.isIncluded !== after.isIncluded ||
        before.displayOrder !== after.displayOrder
      ) {
        violations.push("Only inclusion text can change on a published package.");
      }
    });
  }

  if (original.stops.length !== next.stops.length) {
    violations.push("Stops cannot be added or removed on a published package.");
  } else {
    original.stops.forEach((before, index) => {
      const after = next.stops[index];
      if (
        before.id !== after.id ||
        before.stopOrder !== after.stopOrder ||
        before.estimatedDurationMinutes !== after.estimatedDurationMinutes
      ) {
        violations.push("Stops cannot be reordered on a published package.");
      }
    });
  }

  return Array.from(new Set(violations));
}

/**
 * Checks status-based edit permission. When `changes` is provided for a
 * published package, also verifies only allowed fields are being edited.
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
