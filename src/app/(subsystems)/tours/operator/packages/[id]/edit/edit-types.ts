/**
 * Client-safe types shared by the edit-package server actions, form and steps.
 * Keep this file free of server-only imports.
 */

export type EditPackageStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected"
  | "archived";

export type DurationType = "hours" | "days";

export interface EditPriceVariant {
  id?: string;
  variantName: string;
  minPax: number;
  maxPax: number | null;
  pricePerPax: number | null;
  flatPrice: number | null;
  isDefault: boolean;
}

export interface EditInclusion {
  id?: string;
  text: string;
  isIncluded: boolean;
  displayOrder: number;
}

export interface EditStop {
  id?: string;
  locationName: string;
  description: string | null;
  latitude: number;
  longitude: number;
  estimatedDurationMinutes: number | null;
  stopOrder: number;
}

export interface EditGalleryImage {
  id?: string;
  imageUrl: string;
  caption: string | null;
  displayOrder: number;
}

export interface BasicDetailsData {
  title: string;
  locationName: string;
  description: string | null;
  durationValue: number;
  durationType: DurationType;
}

export interface EditPackageFormData extends BasicDetailsData {
  coverImageUrl: string | null;
  priceVariants: EditPriceVariant[];
  inclusions: EditInclusion[];
  stops: EditStop[];
  galleryImages: EditGalleryImage[];
}

export interface EditPackageRecord {
  id: string;
  status: EditPackageStatus;
  rejectionReason: string | null;
  updatedAt: string;
  formData: EditPackageFormData;
}

/** Flat error map. Keys: "title", "priceVariants", "priceVariants.0.minPax", ... */
export type ValidationErrors = Record<string, string>;

export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrors;
}

export type ActionStatusCode = 200 | 400 | 401 | 403 | 404 | 409 | 500;

export interface UpdatePackageResponse {
  success: boolean;
  status?: ActionStatusCode;
  message: string;
  errors?: ValidationErrors;
  updatedAt?: string;
  data?: {
    packageId: string;
    status: EditPackageStatus;
    redirectTo?: string;
  };
}

export type LoadPackageResult =
  | { success: true; data: EditPackageRecord }
  | { success: false; status: 401 | 403 | 404 | 500; message: string };

export interface ImageActionResult {
  success: boolean;
  url?: string;
  error?: string;
  message?: string;
}

export interface StepProps<T> {
  data: T;
  originalData: T;
  packageStatus: EditPackageStatus;
  onUpdate: (value: T) => void;
  errors: ValidationErrors;
  loading: boolean;
}
