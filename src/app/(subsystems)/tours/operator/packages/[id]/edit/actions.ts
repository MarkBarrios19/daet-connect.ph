"use server";

import { getVerifiedSession } from "@/lib/tours/server-auth";
import { isUuid } from "@/lib/tours/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PACKAGE_DETAIL_SELECT,
  PACKAGE_FIELDS,
  PACKAGE_LIST_SELECT,
  PACKAGE_STATUS,
  PACKAGE_TABLE,
  PACKAGE_STORAGE_BUCKET,
  PRICE_VARIANT_FIELDS,
  PRICE_VARIANT_TABLE,
  STOP_FIELDS,
  STOP_TABLE,
  type PackageDetailRecord,
  type PackageStatus,
  type PriceVariantInput,
  type PackageStopInput,
  type PriceVariantRecord,
  type PackageStopRecord,
} from "@/lib/tours/package-contract";
import { OPERATOR_TABLE } from "@/lib/tours/operator-contract";
import { EDIT_PACKAGE_SELECT, mapPackageRowToRecord } from "./edit-mappers";
import { requireEditablePackageStatus as requireStatusPermissions } from "./permissions";
import type { EditPackageRecord, EditPackageStatus } from "./edit-types";

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const OPERATOR_PROFILE_ID_COLUMN = "profile_id";

/**
 * Result type for requirePackageOwnership helper.
 * 
 * Returns either:
 * - error object with status code (404 or 403)
 * - data object with package ownership details
 */
interface RequirePackageOwnershipResult {
  packageId: string;
  operatorId: string;
  status: PackageStatus;
}

/**
 * Result type for authentication helper.
 * 
 * Returns either:
 * - error object with status code (401 or 403) and message
 * - data object with authenticated session info
 */
interface AuthenticatedSessionResult {
  operatorId: string;
  userId: string;
}

/**
 * Result type for requireEditablePackageStatus helper.
 * 
 * Returns either:
 * - error object with status code (403) and status-specific message
 * - data object with editability flag, status, and optional allowed/restricted field lists
 */
interface EditablePackageStatusResult {
  isEditable: true;
  status: PackageStatus;
  allowedFields?: string[];
  restrictedFields?: string[];
}

/**
 * Server action response result type.
 * 
 * Used for all save/submit operations to provide consistent feedback.
 */
interface UpdatePackageResponse {
  success: boolean;
  /** HTTP-style code for cases the client handles specially (409 = concurrency conflict). */
  status?: 409;
  message: string;
  error?: string;
  errors?: Record<string, string>;
  updatedAt?: string;
  data?: {
    packageId: string;
    status: PackageStatus;
  };
}

/**
 * Input type for package form data with related entities.
 * 
 * This represents the complete package edit form state before server-side normalization.
 */
interface EditPackageFormInput {
  title: string;
  description: string | null;
  locationName: string;
  durationValue: number;
  durationType: "hours" | "days";
  coverImageUrl: string | null;
  priceVariants: PriceVariantInput[];
  inclusions: Array<{
    id?: string;
    text: string;
    isIncluded: boolean;
    displayOrder: number;
  }>;
  stops: PackageStopInput[];
  galleryImages: Array<{
    id?: string;
    imageUrl: string;
    caption: string | null;
    displayOrder: number;
  }>;
}

/**
 * Async helper function to verify user authentication and operator status.
 * 
 * Purpose:
 * - Verifies user session exists and is authenticated
 * - Verifies user has operator role
 * - Verifies operator profile is approved
 * - Returns authenticated operator details on success
 * 
 * This ensures only authenticated, approved operators can access editing features.
 * 
 * Parameters:
 * - sessionClient: Supabase server client for database queries
 * 
 * Returns:
 * - { error: { status: 401, message: string } } if not authenticated
 * - { error: { status: 403, message: string } } if not operator or not approved
 * - { data: AuthenticatedSessionResult } on success with operatorId and userId
 * 
 * Validates: Requirements 1.1-1.2 (authentication and operator verification)
 */
export async function requireAuthenticated(
  sessionClient: SessionClient,
): Promise<
  | { error: { status: 401; message: string } }
  | { error: { status: 403; message: string } }
  | { data: AuthenticatedSessionResult }
> {
  try {
    // Get the authenticated session (user + role)
    const session = await getVerifiedSession();

    // Check if user is authenticated (401 if not)
    if (session.error || !session.user) {
      return {
        error: {
          status: 401,
          message: "Authentication required. Please log in.",
        },
      };
    }

    // Check if user has operator role (403 if not)
    if (session.role !== "operator") {
      return {
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      };
    }

    // Query the operator profile to verify it exists and is approved
    const { data: operator, error } = await sessionClient
      .from(OPERATOR_TABLE)
      .select("id,accreditation_status")
      .eq(OPERATOR_PROFILE_ID_COLUMN, session.user.id)
      .maybeSingle();

    // Handle database error or missing operator profile
    if (error || !operator) {
      return {
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      };
    }

    // Verify operator is approved (403 if not)
    if (operator.accreditation_status !== "approved") {
      return {
        error: {
          status: 403,
          message:
            "Access denied: your operator account must be approved to edit packages",
        },
      };
    }

    // Return authenticated operator details on success
    return {
      data: {
        operatorId: operator.id as string,
        userId: session.user.id,
      },
    };
  } catch (error) {
    // Treat unexpected errors as 401 (not authenticated)
    return {
      error: {
        status: 401,
        message: "Authentication required. Please log in.",
      },
    };
  }
}

/**
 * Async helper function that verifies operator ownership of a package.
 * 
 * Purpose:
 * - Queries the tours_packages table for the given packageId
 * - Returns 404 if package not found
 * - Returns 403 if operator doesn't own the package (operator_id mismatch)
 * - Returns the package record (with id, operator_id, status) on success
 * 
 * This ensures operators can only edit packages they created.
 * 
 * Validates: Requirements 1.3-1.4 (access control & ownership verification)
 */
export async function requirePackageOwnership(
  sessionClient: SessionClient,
  packageId: string,
  operatorId: string,
): Promise<
  | { error: { status: 404; message: string } }
  | { error: { status: 403; message: string } }
  | { data: RequirePackageOwnershipResult }
> {
  // Validate packageId format before querying database
  if (!isUuid(packageId)) {
    return {
      error: { status: 404, message: "Package not found." },
    };
  }

  try {
    // Query the package from the database with required fields
    const { data: pkg, error } = await sessionClient
      .from(PACKAGE_TABLE)
      .select("id,operator_id,status")
      .eq("id", packageId)
      .maybeSingle();

    // Handle database errors or missing package (404)
    if (error || !pkg) {
      return {
        error: { status: 404, message: "Package not found." },
      };
    }

    // Verify operator ownership by comparing operator_id (403 if mismatch)
    if (pkg.operator_id !== operatorId) {
      return {
        error: {
          status: 403,
          message: "Access denied: you do not own this package",
        },
      };
    }

    // Return the package record on success with all required fields
    return {
      data: {
        packageId: pkg.id as string,
        operatorId: pkg.operator_id as string,
        status: pkg.status as PackageStatus,
      },
    };
  } catch (error) {
    // Treat unexpected errors as 404 for security (no information disclosure)
    return {
      error: { status: 404, message: "Package not found." },
    };
  }
}

/**
 * Checks whether a package status permits editing. Published packages may edit
 * every field and save live; pending-review and archived packages remain locked.
 * `fieldsBeingEdited` is retained for compatibility with existing callers, but
 * status—not a per-field allowlist—now determines editability.
 */
export async function requireEditablePackageStatus(
  packageStatus: PackageStatus,
  _fieldsBeingEdited?: string[],
): Promise<
  | { error: { status: 403; message: string } }
  | { data: { isEditable: true; status: PackageStatus; allowedFields?: string[]; restrictedFields?: string[] } }
> {
  if (packageStatus === "pending_review") {
    return {
      error: {
        status: 403,
        message: "Package is under review and cannot be edited",
      },
    };
  }

  if (packageStatus === "archived") {
    return {
      error: {
        status: 403,
        message: "Archived packages cannot be edited",
      },
    };
  }

  if (packageStatus === "draft" || packageStatus === "rejected" || packageStatus === "published") {
    return {
      data: {
        isEditable: true,
        status: packageStatus,
      },
    };
  }

  return {
    error: {
      status: 403,
      message: "Invalid package status",
    },
  };
}

/**
 * Load complete package data for editing.
 * 
 * Purpose:
 * - Verify authentication and ownership
 * - Load from tours_packages, tours_package_price_variants, tours_package_inclusions,
 *   tours_package_stops, tours_package_gallery
 * - Normalize database format to form data structure
 * - Return complete package record with all relationships
 * 
 * Flow:
 * 1. Create Supabase server client
 * 2. Call requireAuthenticated to verify user is authenticated operator
 * 3. Call requirePackageOwnership to verify operator owns the package
 * 4. Load package from tours_packages with related tables
 * 5. Normalize database records to form data structure
 * 6. Return success with package data
 * 
 * Error Handling:
 * - 401: Not authenticated -> redirect to login
 * - 403: Not operator, not approved, or not owner -> access denied
 * - 404: Package not found -> not found error
 * - 500: Unexpected error during load
 * 
 * Validates: Requirements 3.9-3.10, 11.1-11.5
 */
export async function loadPackageForEdit(
  packageId: string
): Promise<
  | { success: true; data: EditPackageRecord }
  | { success: false; error: { status: 401 | 403 | 404 | 500; message: string } }
> {
  try {
    // Create Supabase server client for database queries
    const sessionClient = await createSupabaseServerClient();

    // Step 1: Verify authentication and get operator details
    const authResult = await requireAuthenticated(sessionClient);
    if ("error" in authResult) {
      return {
        success: false,
        error: {
          status: authResult.error.status,
          message: authResult.error.message,
        },
      };
    }

    const { operatorId } = authResult.data;

    // Step 2: Verify operator owns this package
    const ownershipResult = await requirePackageOwnership(
      sessionClient,
      packageId,
      operatorId
    );
    if ("error" in ownershipResult) {
      return {
        success: false,
        error: {
          status: ownershipResult.error.status,
          message: ownershipResult.error.message,
        },
      };
    }

    // Step 3: Load complete package with all related tables
    const { data: pkg, error: pkgError } = await sessionClient
      .from(PACKAGE_TABLE)
      .select(EDIT_PACKAGE_SELECT)
      .eq("id", packageId)
      .maybeSingle();

    // Handle database errors or missing package
    if (pkgError || !pkg) {
      return {
        success: false,
        error: {
          status: 404,
          message: "Package not found.",
        },
      };
    }

    // Step 4: Normalize database records to the edit form structure
    return {
      success: true,
      data: mapPackageRowToRecord(pkg as unknown as Record<string, unknown>),
    };
  } catch (error) {
    // Log unexpected errors (for debugging)
    console.error("Error in loadPackageForEdit:", error);

    // Return generic error response
    return {
      success: false,
      error: {
        status: 500,
        message: "Unable to load package data. Please try again later.",
      },
    };
  }
}

/**
 * Validate package form data (basic info).
 * 
 * Purpose:
 * - Validate title: 3-150 chars, required
 * - Validate location_name: 2-100 chars, required
 * - Validate description: 10-3000 chars if provided
 * - Validate duration_value: 0.5-365, required
 * - Validate duration_type: "hours" or "days", required
 * 
 * Parameters:
 * - data: Partial object containing title, locationName, description, durationValue, durationType
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
 * 
 * Validates: Requirements 3.1-3.8, 12.1-12.7
 */
function validatePackageFormData(data: unknown): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!data || typeof data !== "object") {
    return { valid: false, errors: { _error: "Form data is invalid" } };
  }

  const formData = data as Partial<{
    title: unknown;
    locationName: unknown;
    description: unknown;
    durationValue: unknown;
    durationType: unknown;
  }>;

  // Validate title: 3-150 chars, required
  const title = typeof formData.title === "string" ? formData.title.trim() : "";
  if (title.length === 0) {
    errors.title = "Title is required.";
  } else if (title.length < 3 || title.length > 150) {
    errors.title = "Title must be 3-150 characters.";
  }

  // Validate location: 2-100 chars, required
  const locationName =
    typeof formData.locationName === "string"
      ? formData.locationName.trim()
      : "";
  if (locationName.length === 0) {
    errors.locationName = "Location is required.";
  } else if (locationName.length < 2 || locationName.length > 100) {
    errors.locationName = "Location must be 2-100 characters.";
  }

  // Validate description: 10-3000 chars if provided
  if (formData.description !== null && formData.description !== undefined) {
    const description =
      typeof formData.description === "string"
        ? formData.description.trim()
        : "";
    if (description.length > 0) {
      if (description.length < 10 || description.length > 3000) {
        errors.description = "Description must be 10-3000 characters.";
      }
    }
  }

  // Validate duration value: 0.5-365, required
  const durationValue = formData.durationValue;
  if (
    typeof durationValue !== "number" ||
    !Number.isFinite(durationValue) ||
    durationValue < 0.5 ||
    durationValue > 365
  ) {
    errors.durationValue =
      "Duration must be between 0.5 and 365.";
  }

  // Validate duration type: "hours" or "days", required
  if (
    formData.durationType !== "hours" &&
    formData.durationType !== "days"
  ) {
    errors.durationType = "Duration type must be 'hours' or 'days'.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate pricing variants array.
 * 
 * Purpose:
 * - Check at least one variant exists
 * - Validate min_pax: 1-10,000 integer, required
 * - Validate max_pax: 1-10,000 integer, ≥ min_pax
 * - Validate price_per_pax OR flat_price exists (not both null)
 * - Validate price range: 0.01-999,999.99
 * - Validate variant_name: 1-100 chars
 * - Enforce exactly one is_default = true
 * 
 * Parameters:
 * - variants: Array of price variant objects to validate
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
 * 
 * Validates: Requirements 5.1-5.8, 12.1-12.7
 */
function validatePricingVariants(variants: unknown[]): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  // Check that variants is an array
  if (!Array.isArray(variants)) {
    return {
      valid: false,
      errors: {
        priceVariants: "Price variants must be an array.",
      },
    };
  }

  // Check at least one variant exists
  if (variants.length === 0) {
    return {
      valid: false,
      errors: {
        priceVariants: "Add at least one price variant.",
      },
    };
  }

  // Track which variants have is_default = true
  let defaultCount = 0;

  // Validate each variant
  variants.forEach((variant, index) => {
    if (!variant || typeof variant !== "object") {
      errors[`priceVariants.${index}`] = "Variant is invalid.";
      return;
    }

    const v = variant as Partial<{
      variantName: unknown;
      minPax: unknown;
      maxPax: unknown;
      pricePerPax: unknown;
      flatPrice: unknown;
      isDefault: unknown;
    }>;

    // Validate variant_name: 1-100 chars
    const variantName =
      typeof v.variantName === "string"
        ? v.variantName.trim()
        : "";
    if (variantName.length === 0 || variantName.length > 100) {
      errors[`priceVariants.${index}.variantName`] =
        "Variant name must be 1-100 characters.";
    }

    // Validate min_pax: 1-10,000 integer
    const minPax = v.minPax;
    if (
      typeof minPax !== "number" ||
      !Number.isInteger(minPax) ||
      minPax < 1 ||
      minPax > 10000
    ) {
      errors[`priceVariants.${index}.minPax`] =
        "Min pax must be a whole number from 1 to 10,000.";
    }

    // Validate max_pax: 1-10,000 integer, >= min_pax
    const maxPax = v.maxPax;
    if (maxPax !== null && maxPax !== undefined) {
      if (
        typeof maxPax !== "number" ||
        !Number.isInteger(maxPax) ||
        maxPax < 1 ||
        maxPax > 10000
      ) {
        errors[`priceVariants.${index}.maxPax`] =
          "Max pax must be a whole number from 1 to 10,000.";
      } else if (
        typeof minPax === "number" &&
        Number.isInteger(minPax) &&
        maxPax < minPax
      ) {
        errors[`priceVariants.${index}.maxPax`] =
          "Max pax cannot be less than min pax.";
      }
    }

    // Validate price_per_pax OR flat_price (not both null)
    const pricePerPax = v.pricePerPax;
    const flatPrice = v.flatPrice;

    if (pricePerPax === null && flatPrice === null) {
      errors[`priceVariants.${index}.price`] =
        "Set a price per pax or a flat price.";
    } else {
      // Validate price_per_pax range: 0.01-999,999.99
      if (pricePerPax !== null && pricePerPax !== undefined) {
        if (
          typeof pricePerPax !== "number" ||
          !Number.isFinite(pricePerPax) ||
          pricePerPax < 0.01 ||
          pricePerPax > 999999.99
        ) {
          errors[`priceVariants.${index}.pricePerPax`] =
            "Price per pax must be between ₱0.01 and ₱999,999.99.";
        }
      }

      // Validate flat_price range: 0.01-999,999.99
      if (flatPrice !== null && flatPrice !== undefined) {
        if (
          typeof flatPrice !== "number" ||
          !Number.isFinite(flatPrice) ||
          flatPrice < 0.01 ||
          flatPrice > 999999.99
        ) {
          errors[`priceVariants.${index}.flatPrice`] =
            "Flat price must be between ₱0.01 and ₱999,999.99.";
        }
      }
    }

    // Track is_default = true count
    if (v.isDefault === true) {
      defaultCount++;
    }
  });

  // Enforce exactly one is_default = true
  if (defaultCount !== 1) {
    errors.priceVariants =
      "Mark exactly one price variant as the default.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate inclusions/exclusions array.
 * 
 * Purpose:
 * - Check at least one inclusion (is_included = true) exists
 * - Check max 50 items total
 * - Validate item_text: 1-500 chars per item
 * - Verify display_order unique and sequential
 * 
 * Parameters:
 * - inclusions: Array of inclusion/exclusion objects to validate
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
 * 
 * Validates: Requirements 6.1-6.10, 12.1-12.7
 */
function validateInclusions(inclusions: unknown[]): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  // Check that inclusions is an array
  if (!Array.isArray(inclusions)) {
    return {
      valid: false,
      errors: {
        inclusions: "Inclusions must be an array.",
      },
    };
  }

  // Check at least one inclusion (is_included = true) exists
  const hasInclusion = inclusions.some(
    (item) =>
      item && typeof item === "object" && "isIncluded" in item && item.isIncluded === true
  );

  if (!hasInclusion) {
    return {
      valid: false,
      errors: {
        inclusions: "Add at least one included item.",
      },
    };
  }

  // Check max 50 items total
  if (inclusions.length > 50) {
    return {
      valid: false,
      errors: {
        inclusions: "You can list up to 50 items.",
      },
    };
  }

  // Validate each item and collect display orders
  const displayOrders: number[] = [];

  inclusions.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors[`inclusions.${index}`] = "Item is invalid.";
      return;
    }

    const i = item as Partial<{
      text: unknown;
      isIncluded: unknown;
      displayOrder: unknown;
    }>;

    // Validate item_text: 1-500 chars per item
    const text = typeof i.text === "string" ? i.text.trim() : "";
    if (text.length < 1 || text.length > 500) {
      errors[`inclusions.${index}.text`] =
        "Item text must be 1-500 characters.";
    }

    // Track display order
    if (
      typeof i.displayOrder === "number" &&
      Number.isInteger(i.displayOrder)
    ) {
      displayOrders.push(i.displayOrder);
    }
  });

  // Verify display_order unique and sequential (only if all items have valid displayOrder)
  if (displayOrders.length === inclusions.length && inclusions.length > 0) {
    const sortedOrders = [...displayOrders].sort((a, b) => a - b);
    const isSequential = sortedOrders.every(
      (order, idx) => order === idx + 1
    );
    const isUnique = new Set(displayOrders).size === displayOrders.length;

    if (!isUnique) {
      errors.inclusions = "Item order must be unique.";
    } else if (!isSequential) {
      errors.inclusions =
        "Item order must be sequential (1, 2, 3...).";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate stops array.
 * 
 * Purpose:
 * - Check at least one stop exists
 * - Check max 50 stops total
 * - Validate location_name: 2-100 chars, required
 * - Validate description: 10-1000 chars if provided
 * - Validate latitude: -90 to 90, required
 * - Validate longitude: -180 to 180, required
 * - Verify stop_order unique and sequential
 * 
 * Parameters:
 * - stops: Array of stop objects to validate
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
 * 
 * Validates: Requirements 7.1-7.13, 12.1-12.7
 */
function validateStops(stops: unknown[]): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  // Check that stops is an array
  if (!Array.isArray(stops)) {
    return {
      valid: false,
      errors: {
        stops: "Stops must be an array.",
      },
    };
  }

  // Check at least one stop exists
  if (stops.length === 0) {
    return {
      valid: false,
      errors: {
        stops: "Add at least one itinerary stop.",
      },
    };
  }

  // Check max 50 stops total
  if (stops.length > 50) {
    return {
      valid: false,
      errors: {
        stops: "You can add up to 50 stops.",
      },
    };
  }

  // Validate each stop and collect stop orders
  const stopOrders: number[] = [];

  stops.forEach((stop, index) => {
    if (!stop || typeof stop !== "object") {
      errors[`stops.${index}`] = "Stop is invalid.";
      return;
    }

    const s = stop as Partial<{
      locationName: unknown;
      description: unknown;
      latitude: unknown;
      longitude: unknown;
      stopOrder: unknown;
    }>;

    // Validate location_name: 2-100 chars, required
    const locationName =
      typeof s.locationName === "string"
        ? s.locationName.trim()
        : "";
    if (locationName.length < 2 || locationName.length > 100) {
      errors[`stops.${index}.locationName`] =
        "Stop location must be 2-100 characters.";
    }

    // Validate description: 10-1000 chars if provided
    if (s.description !== null && s.description !== undefined) {
      const description =
        typeof s.description === "string"
          ? s.description.trim()
          : "";
      if (description.length > 0) {
        if (description.length < 10 || description.length > 1000) {
          errors[`stops.${index}.description`] =
            "Description must be 10-1000 characters.";
        }
      }
    }

    // Validate latitude: -90 to 90, required
    const latitude = s.latitude;
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      errors[`stops.${index}.latitude`] =
        "Latitude must be between -90 and 90.";
    }

    // Validate longitude: -180 to 180, required
    const longitude = s.longitude;
    if (
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      errors[`stops.${index}.longitude`] =
        "Longitude must be between -180 and 180.";
    }

    // Track stop order
    if (
      typeof s.stopOrder === "number" &&
      Number.isInteger(s.stopOrder)
    ) {
      stopOrders.push(s.stopOrder);
    }
  });

  // Verify stop_order unique and sequential (only if all stops have valid stop_order)
  if (stopOrders.length === stops.length) {
    const sortedOrders = [...stopOrders].sort((a, b) => a - b);
    const isSequential = sortedOrders.every(
      (order, idx) => order === idx + 1
    );
    const isUnique = new Set(stopOrders).size === stopOrders.length;

    if (!isUnique) {
      errors.stops = "Stop order must be unique.";
    } else if (!isSequential) {
      errors.stops = "Stop order must be sequential (1, 2, 3...).";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate gallery images array.
 * 
 * Purpose:
 * - Check max 20 images total
 * - Validate caption: 0-500 chars if provided
 * - Verify display_order unique and sequential
 * 
 * Parameters:
 * - images: Array of gallery image objects to validate
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
 * 
 * Validates: Requirements 8.1-8.13, 12.1-12.7
 */
function validateGalleryImages(images: unknown[]): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  // Check that images is an array
  if (!Array.isArray(images)) {
    return {
      valid: false,
      errors: {
        galleryImages: "Gallery images must be an array.",
      },
    };
  }

  // Check max 20 images total
  if (images.length > 20) {
    return {
      valid: false,
      errors: {
        galleryImages: "You can add up to 20 images.",
      },
    };
  }

  // Validate each image and collect display orders
  const displayOrders: number[] = [];

  images.forEach((image, index) => {
    if (!image || typeof image !== "object") {
      errors[`galleryImages.${index}`] = "Image is invalid.";
      return;
    }

    const img = image as Partial<{
      caption: unknown;
      displayOrder: unknown;
    }>;

    // Validate caption: 0-500 chars if provided
    if (img.caption !== null && img.caption !== undefined) {
      const caption =
        typeof img.caption === "string"
          ? img.caption.trim()
          : "";
      if (caption.length > 500) {
        errors[`galleryImages.${index}.caption`] =
          "Caption must be 500 characters or fewer.";
      }
    }

    // Track display order
    if (
      typeof img.displayOrder === "number" &&
      Number.isInteger(img.displayOrder)
    ) {
      displayOrders.push(img.displayOrder);
    }
  });

  // Verify display_order unique and sequential (only if all images have valid displayOrder)
  if (images.length > 0 && displayOrders.length === images.length) {
    const sortedOrders = [...displayOrders].sort((a, b) => a - b);
    const isSequential = sortedOrders.every(
      (order, idx) => order === idx + 1
    );
    const isUnique = new Set(displayOrders).size === displayOrders.length;

    if (!isUnique) {
      errors.galleryImages = "Image order must be unique.";
    } else if (!isSequential) {
      errors.galleryImages =
        "Image order must be sequential (1, 2, 3...).";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/** Conflict copy shared by the save and submit paths (Requirements 10.10, 14.7). */
const CONCURRENCY_CONFLICT_MESSAGE =
  "This package was modified by another session. Please refresh and try again.";

/** Copy returned by a submit, so the client can tell it apart from a plain save. */
const SUBMITTED_FOR_REVIEW_MESSAGE = "Package submitted for review successfully.";
const SUBMIT_FAILED_MESSAGE = "Unable to submit package for review. Please try again.";

/**
 * Update package core fields and all related tables.
 *
 * Thin wrapper over savePackage that never submits: the package keeps whatever
 * status it had (a structural gallery change on a published package still sends
 * it back for review inside the RPC, which reports the new status back).
 *
 * Flow:
 * 1. Create Supabase server client
 * 2. Verify authentication (401 if not)
 * 3. Verify ownership (403 if not owner)
 * 4. Verify editable status (403 if not editable)
 * 5. Validate form data using all validation functions
 * 6. If validation fails, return 400 with field-specific errors
 * 7. Call update_package_and_relations RPC with the expected updated_at; the
 *    version check runs inside that transaction, so a stale version is a 409
 *    and writes nothing
 * 8. If RPC succeeds, return 200 with success flag and updatedAt
 * 9. If RPC fails with database error, return 500
 *
 * Error Handling:
 * - 401: Not authenticated
 * - 403: Not approved, not owner, or status prevents editing
 * - 400: Validation errors (return field-specific errors)
 * - 409: Concurrency conflict (cachedUpdatedAt mismatch)
 * - 500: Unexpected database error
 *
 * Validates: Requirements 3.9-3.10, 10.1-10.10, 14.1-14.8
 */
export async function updatePackageCore(
  packageId: string,
  formData: EditPackageFormInput,
  cachedUpdatedAt: string,
): Promise<UpdatePackageResponse> {
  return savePackage(packageId, formData, cachedUpdatedAt, { submitForReview: false });
}

/**
 * Persist the whole package and, optionally, submit it for review.
 *
 * The write is a single call to update_package_and_relations, so the core
 * fields, price variants, inclusions, stops, gallery and the status transition
 * all commit or roll back together inside one database transaction
 * (Requirement 14.1). Everything that can reject the request — authentication,
 * ownership, status, form validation and the version check — happens before
 * that call, so a rejected submit never leaves edits committed behind a
 * reported failure (Requirement 10.10).
 *
 * `cachedUpdatedAt` is compared once, inside the RPC, under a row lock
 * (`SELECT ... FOR UPDATE`). A stale version raises PT409 before any write, so
 * a conflicting request changes nothing and the operator can retry against the
 * reloaded version.
 *
 * `submitForReview` is passed through to the RPC rather than applied with a
 * second UPDATE afterwards: a second statement would be a second write outside
 * the first transaction and could leave the edits committed while the status
 * change failed.
 */
async function savePackage(
  packageId: string,
  formData: EditPackageFormInput,
  cachedUpdatedAt: string,
  { submitForReview }: { submitForReview: boolean },
): Promise<UpdatePackageResponse> {
  try {
    // Step 1: Create Supabase server client
    const sessionClient = await createSupabaseServerClient();

    // Step 2: Verify authentication and get operator details
    const authResult = await requireAuthenticated(sessionClient);
    if ("error" in authResult) {
      return {
        success: false,
        message: authResult.error.message,
        error: authResult.error.message,
        errors: {},
      };
    }

    const { operatorId } = authResult.data;

    // Step 3: Verify operator owns this package and get package status
    const ownershipResult = await requirePackageOwnership(
      sessionClient,
      packageId,
      operatorId
    );
    if ("error" in ownershipResult) {
      return {
        success: false,
        message: ownershipResult.error.message,
        error: ownershipResult.error.message,
        errors: {},
      };
    }

    const { status: packageStatus } = ownershipResult.data;

    // Step 4: Verify package status allows editing
    const editabilityResult = await requireEditablePackageStatus(
      packageStatus
    );
    if ("error" in editabilityResult) {
      return {
        success: false,
        message: editabilityResult.error.message,
        error: editabilityResult.error.message,
        errors: {},
      };
    }

    // Step 5: Validate form data using all validation functions
    const packageValidation = validatePackageFormData(formData);
    const pricingValidation = validatePricingVariants(formData.priceVariants);
    const inclusionsValidation = validateInclusions(formData.inclusions);
    const stopsValidation = validateStops(formData.stops);
    const galleryValidation = validateGalleryImages(formData.galleryImages);

    // Combine all validation errors
    const allErrors = {
      ...packageValidation.errors,
      ...pricingValidation.errors,
      ...inclusionsValidation.errors,
      ...stopsValidation.errors,
      ...galleryValidation.errors,
    };

    // Step 6: If validation fails, return 400 with field-specific errors
    if (Object.keys(allErrors).length > 0) {
      return {
        success: false,
        message: "Validation failed. Please check the form for errors.",
        error: "Validation failed",
        errors: allErrors,
      };
    }

    // Step 7: Normalize form data to the RPC payload
    const { toRpcPayload } = await import("./edit-mappers");
    const rpcPayload = toRpcPayload(formData as any);

    // Step 8: Write everything — core fields, relations and the optional status
    // transition — in one transaction. The version check lives inside the RPC,
    // under the row lock, so it is the only concurrency check on this path and
    // it cannot be invalidated between the check and the write. A stale version
    // raises PT409 before the first statement touches the database.
    const { data: rpcResult, error: rpcError } = await sessionClient.rpc(
      "update_package_and_relations",
      {
        p_package_id: packageId,
        p_package_data: rpcPayload.p_package_data,
        p_price_variants: rpcPayload.p_price_variants,
        p_inclusions: rpcPayload.p_inclusions,
        p_stops: rpcPayload.p_stops,
        p_gallery: rpcPayload.p_gallery,
        p_expected_updated_at: cachedUpdatedAt,
        p_submit_for_review: submitForReview,
      }
    );

    // Handle RPC errors
    if (rpcError) {
      console.error("RPC error:", rpcError);
      
      // Check if error message indicates validation failure from RPC
      const errorMessage = rpcError.message || "";
      if (rpcError.code === "PT409") {
        return {
          success: false,
          message: CONCURRENCY_CONFLICT_MESSAGE,
          status: 409,
          error: "Concurrency conflict",
          errors: {},
        };
      }
      if (rpcError.code === "PT403" && errorMessage.includes("This change is not allowed on a published package")) {
        return {
          success: false,
          message: "The database still has the old published-package edit restriction. Apply migration 20261127_live_published_package_edits.sql, then reload and retry.",
          error: "Database migration required",
          errors: {},
        };
      }
      if (rpcError.code === "PT403" || rpcError.code === "PT400") {
        return {
          success: false,
          message: errorMessage,
          error: rpcError.code === "PT403" ? "Not allowed" : "Validation error",
          errors: {},
        };
      }
      if (errorMessage.includes("validation") || errorMessage.includes("constraint")) {
        return {
          success: false,
          message: "Package data validation failed on the server.",
          error: "Validation error",
          errors: {},
        };
      }

      return {
        success: false,
        message: submitForReview
          ? SUBMIT_FAILED_MESSAGE
          : "Unable to save package changes. Please try again.",
        error: "Database error",
        errors: {},
      };
    }

    // Step 9: If RPC succeeds, return 200 with success flag and updatedAt
    if (rpcResult && rpcResult.length > 0) {
      const result = rpcResult[0];
      
      if (result.success) {
        const newStatus = result.new_status as EditPackageStatus | null;
        return {
          success: true,
          message: submitForReview
            ? SUBMITTED_FOR_REVIEW_MESSAGE
            : newStatus === "pending_review"
              ? "Photos saved. The package is back with the Tourism Office for review."
              : "Package updated successfully.",
          updatedAt: result.new_updated_at,
          data: {
            packageId,
            status: newStatus ?? packageStatus,
          },
        };
      } else {
        // RPC returned success=false
        return {
          success: false,
          message: submitForReview
            ? SUBMIT_FAILED_MESSAGE
            : "Unable to save package changes. Please try again.",
          error: "Update failed",
          errors: {},
        };
      }
    }

    // Step 10: If RPC returns unexpected result, return 500
    return {
      success: false,
      message: submitForReview
        ? SUBMIT_FAILED_MESSAGE
        : "Unexpected server response. Please try again.",
      error: "Unexpected response",
      errors: {},
    };
  } catch (error) {
    // Catch unexpected exceptions
    console.error("Unexpected error in savePackage:", error);
    return {
      success: false,
      message: submitForReview
        ? SUBMIT_FAILED_MESSAGE
        : "An unexpected error occurred. Please try again.",
      error: "Unexpected error",
      errors: {},
    };
  }
}

/**
 * Submit package for review.
 *
 * Saves every edit and moves the package to pending_review in one atomic
 * operation, with a single version check, so a submit is all-or-nothing
 * (Requirement 10.9, 14.1) and a reported failure never leaves edits committed
 * (Requirement 10.10):
 *
 * - the whole write, including `status = 'pending_review'` and clearing
 *   `rejection_reason`, is one update_package_and_relations call, which runs in
 *   a single database transaction;
 * - `cachedUpdatedAt` is compared once, inside that call, under the row lock.
 *   A stale version raises PT409 and nothing is written, so the operator can
 *   reload and retry;
 * - authentication, ownership, editable status and form validation all run
 *   before the transaction, so their errors change nothing.
 *
 * Only draft and rejected packages can be submitted (enforced by the RPC), which
 * mirrors the UI in permissions.ts.
 *
 * Validates: Requirements 9.4-9.5, 10.7-10.10, 14.1, 14.7-14.8
 */
export async function submitPackageForReview(
  packageId: string,
  formData: EditPackageFormInput,
  cachedUpdatedAt: string,
): Promise<UpdatePackageResponse> {
  return savePackage(packageId, formData, cachedUpdatedAt, { submitForReview: true });
}

/**
 * Which slot an upload is for. Cover and gallery changes on a published package
 * are saved live without a Tourism Office review step.
 */
export type PackageImageKind = "cover" | "gallery";

const IMAGE_KINDS: PackageImageKind[] = ["cover", "gallery"];

/**
 * Uploads one package image to Supabase Storage and returns its public URL.
 *
 * Rules, enforced here and mirrored in the UI by permissions.ts:
 * - the caller must be an approved operator (requireAuthenticated);
 * - the package must belong to that operator ("Package not found." otherwise,
 *   so a stranger cannot probe for package ids);
 * - pending_review and archived packages accept no photos at all;
 * - published packages accept both cover and gallery uploads; saving changes
 *   them live without a review step.
 *
 * The caller passes `kind` ("cover" from CoverImageStep, "gallery" from
 * GalleryStep). Callers that omit it are treated as "cover" for compatibility
 * with older clients.
 *
 * Storage failures are mapped to messages an operator can act on, and the raw
 * error is still logged for the Tourism Office.
 */
export async function uploadPackageImage(
  packageId: string,
  formData: FormData,
  kind: PackageImageKind = "cover",
): Promise<{ success: boolean; imageUrl?: string; error?: { message: string } }> {
  "use server";

  try {
    // Step 1: Create Supabase server client
    const sessionClient = await createSupabaseServerClient();

    // Step 2: Verify authentication and operator status
    const authResult = await requireAuthenticated(sessionClient);
    if ("error" in authResult) {
      return {
        success: false,
        error: { message: authResult.error.message },
      };
    }

    const { operatorId } = authResult.data;

    // Step 3: Validate packageId format
    if (!isUuid(packageId)) {
      return {
        success: false,
        error: { message: "Invalid package ID." },
      };
    }

    // Step 4: Validate the slot being uploaded to
    if (!IMAGE_KINDS.includes(kind)) {
      return {
        success: false,
        error: { message: "Invalid image type." },
      };
    }

    // Step 5: The package must be this operator's
    const { data: packageRow, error: packageError } = await sessionClient
      .from(PACKAGE_TABLE)
      .select("id,status")
      .eq("id", packageId)
      .eq("operator_id", operatorId)
      .maybeSingle();

    if (packageError) {
      console.error("Package lookup error:", packageError);
      return {
        success: false,
        error: { message: "Failed to upload image. Please try again." },
      };
    }

    if (!packageRow) {
      return {
        success: false,
        error: { message: "Package not found." },
      };
    }

    // Step 6: Apply the shared status rules (permissions.ts)
    const statusCheck = requireStatusPermissions(packageRow.status as EditPackageStatus);
    if ("error" in statusCheck) {
      return {
        success: false,
        error: { message: statusCheck.error.message },
      };
    }

    const permissions = statusCheck.data.permissions;
    if (kind === "cover" && !permissions.coverImage) {
      return {
        success: false,
        error: { message: "You do not have access to this package." },
      };
    }
    if (kind === "gallery" && !permissions.gallery.add) {
      return {
        success: false,
        error: { message: "Gallery images cannot be modified for this package status." },
      };
    }

    // Step 7: Extract file from FormData
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return {
        success: false,
        error: { message: "No file provided." },
      };
    }

    // Step 8: Validate file MIME type (jpg, jpeg, png, webp only)
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes(file.type)) {
      return {
        success: false,
        error: {
          message:
            "Invalid file format. Only JPG, PNG, and WebP are allowed.",
        },
      };
    }

    // Step 9: Validate file size (max 5MB = 5242880 bytes)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: {
          message: "File size too large. Maximum size is 5MB.",
        },
      };
    }

    // Step 10: Generate unique imageId (UUID)
    const imageId = crypto.randomUUID();

    // Step 11: Extract file extension from file name
    const fileName = file.name.toLowerCase();
    const extensionMatch = fileName.match(/\.([a-z0-9]+)$/);
    const extension = extensionMatch ? extensionMatch[1] : "jpg";

    // Step 12: Create storage path: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
    const storagePath = `tours-package-media/${operatorId}/${packageId}/${imageId}.${extension}`;

    // Step 13: Upload file to Supabase storage
    const { data, error: uploadError } = await sessionClient.storage
      .from(PACKAGE_STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError || !data) {
      console.error("Storage upload error:", uploadError);

      const message = uploadError?.message ?? "";
      const statusCode = (uploadError as { statusCode?: number | string } | null)?.statusCode;

      // The bucket is missing from the project: nothing the operator can fix.
      if (/bucket not found/i.test(message)) {
        return {
          success: false,
          error: {
            message: "Photo storage isn't set up yet. Please tell the Tourism Office.",
          },
        };
      }

      // Refused by a storage policy: the folder isn't theirs.
      if (
        statusCode === 403 ||
        statusCode === "403" ||
        /row-level security|permission denied|unauthorized/i.test(message)
      ) {
        return {
          success: false,
          error: { message: "You can only add photos to your own packages." },
        };
      }

      return {
        success: false,
        error: {
          message: "Failed to upload image. Please try again.",
        },
      };
    }

    // Step 14: Get public URL
    const { data: urlData } = sessionClient.storage
      .from(PACKAGE_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    // Return success with URL
    return {
      success: true,
      imageUrl: urlData.publicUrl,
    };
  } catch (error) {
    console.error("Error in uploadPackageImage:", error);
    return {
      success: false,
      error: {
        message: "An error occurred while uploading the image.",
      },
    };
  }
}

/**
 * Delete package image from Supabase storage.
 * 
 * Purpose:
 * - Verify authentication and package ownership
 * - Verify package status is "draft" (only draft packages allow deletion)
 * - Extract storage path from public URL
 * - Delete file from Supabase storage
 * - Return success confirmation
 * 
 * Flow:
 * 1. Create Supabase server client
 * 2. Call requireAuthenticated to verify session and operator role
 * 3. Call requirePackageOwnership to verify operator owns the package
 * 4. Load package status from database
 * 5. Check status is "draft" (return 403 if not)
 * 6. Extract storage path from imageUrl
 * 7. Delete file from Supabase storage
 * 8. Return success confirmation
 * 
 * Error Handling:
 * - 401: Not authenticated -> return 401 error
 * - 403: Not approved operator, not owner, or package not in draft status -> return 403 error
 * - 404: Package not found -> return 404 error
 * - 500: Delete failed -> return 500 error
 * 
 * Return type:
 * - { success: boolean; message?: string; error?: { message: string } }
 * 
 * Validates: Requirements 8.7
 */
export async function deletePackageImage(
  packageId: string,
  imageUrl: string,
): Promise<{ success: boolean; message?: string; error?: { message: string } }> {
  "use server";

  try {
    // Step 1: Create Supabase server client
    const sessionClient = await createSupabaseServerClient();

    // Step 2: Verify authentication and operator status
    const authResult = await requireAuthenticated(sessionClient);
    if ("error" in authResult) {
      return {
        success: false,
        error: { message: authResult.error.message },
      };
    }

    const { operatorId } = authResult.data;

    // Step 3: Validate packageId format
    if (!isUuid(packageId)) {
      return {
        success: false,
        error: { message: "Invalid package ID." },
      };
    }

    // Step 4: Verify operator ownership
    const ownershipResult = await requirePackageOwnership(
      sessionClient,
      packageId,
      operatorId
    );
    if ("error" in ownershipResult) {
      return {
        success: false,
        error: {
          message:
            ownershipResult.error.status === 404
              ? "Package not found."
              : "Access denied: you do not own this package",
        },
      };
    }

    const { status } = ownershipResult.data;

    // Step 5: Check package status is "draft" (only draft packages allow deletion)
    if (status !== "draft") {
      return {
        success: false,
        error: {
          message:
            "Images can only be deleted from draft packages. Published or pending review packages are locked.",
        },
      };
    }

    // Step 6: Extract storage path from imageUrl
    // The public URL format from Supabase is:
    // https://<project-id>.supabase.co/storage/v1/object/public/<bucket>/<path>
    // We need to extract: <path> which includes: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
    let storagePath: string | null = null;
    try {
      const url = new URL(imageUrl);
      // Match the path after /public/
      const match = url.pathname.match(
        /\/public\/([a-z0-9-]+)\/(.+)$/i
      );
      if (match) {
        // match[2] contains the full path: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
        storagePath = match[2];
      }
    } catch {
      // URL parsing failed, try direct string parsing
      const publicMatch = imageUrl.split("/public/")[1];
      if (publicMatch) {
        // Remove bucket name to get just the path
        const pathParts = publicMatch.split("/");
        if (pathParts.length > 1) {
          storagePath = pathParts.slice(1).join("/");
        }
      }
    }

    if (!storagePath) {
      return {
        success: false,
        error: {
          message: "Invalid image URL format.",
        },
      };
    }

    // Step 7: Delete file from Supabase storage
    const { error: deleteError } = await sessionClient.storage
      .from(PACKAGE_STORAGE_BUCKET)
      .remove([storagePath]);

    if (deleteError) {
      console.error("Storage delete error:", deleteError);
      return {
        success: false,
        error: {
          message: "Failed to delete image. Please try again.",
        },
      };
    }

    // Step 8: Return success confirmation
    return {
      success: true,
      message: "Image deleted successfully.",
    };
  } catch (error) {
    console.error("Error in deletePackageImage:", error);
    return {
      success: false,
      error: {
        message: "An error occurred while deleting the image.",
      },
    };
  }
}
