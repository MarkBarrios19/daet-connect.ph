/** Field limits for the edit-package feature. Shared by client and server validation. */
export const EDIT_LIMITS = {
  title: { min: 3, max: 150 },
  locationName: { min: 2, max: 100 },
  description: { min: 10, max: 3000 },
  duration: { min: 0.5, max: 365 },
  variantName: { min: 1, max: 100 },
  pax: { min: 1, max: 10_000 },
  price: { min: 0.01, max: 999_999.99 },
  inclusionText: { min: 1, max: 500 },
  maxInclusions: 50,
  stopLocation: { min: 2, max: 100 },
  stopDescription: { min: 10, max: 1000 },
  maxStops: 50,
  caption: { max: 500 },
  maxGalleryImages: 20,
  imageBytes: 5 * 1024 * 1024,
  rejectionReason: 1000,
} as const;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;
export const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

export const SUCCESS_TOAST_MS = 2500;

export const DEFAULT_COORDINATES = { latitude: 14.1122, longitude: 122.9553 } as const;

export const STATUS_LABELS = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  rejected: "Rejected",
  archived: "Archived",
} as const;

export const EDIT_MESSAGES = {
  saved: "Changes saved.",
  sentForReview:
    "Saved. Because the photos changed, this package is with the Tourism Office for review and is hidden from tourists until they approve it.",
  submitted: "Package submitted for review.",
  conflict:
    "This package was changed elsewhere since you opened it. Reload to get the latest version, then re-apply your edits.",
  validation: "Some fields need attention before saving.",
  unexpected: "Something went wrong while saving. Your edits are still here; please try again.",
  notFound: "Package not found.",
  forbidden: "You do not have access to this package.",
  unauthenticated: "Authentication required. Please log in.",
  pendingReview: "This package is under review and cannot be edited.",
  archived: "Archived packages cannot be edited.",
  loadFailed: "Unable to load package data.",
} as const;
