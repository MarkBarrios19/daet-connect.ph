"use server";

import { revalidatePath } from "next/cache";
import { OPERATOR_TABLE } from "@/lib/tours/operator-contract";
import { isUuid } from "@/lib/tours/operator-access";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EDITABLE_PACKAGE_STATUSES,
  PACKAGE_DETAIL_SELECT,
  PACKAGE_FIELDS,
  PACKAGE_LIST_SELECT,
  PACKAGE_STATUS,
  PACKAGE_TABLE,
  PRICE_VARIANT_FIELDS,
  PRICE_VARIANT_TABLE,
  STOP_FIELDS,
  STOP_TABLE,
  validatePackageStop,
  validatePriceVariant,
  type PackageDetailRecord,
  type PackageListRecord,
  type PackageStatus,
  type PackageStopInput,
  type PriceVariantInput,
} from "@/lib/tours/package-contract";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const OPERATOR_PROFILE_ID_COLUMN = "profile_id";

/** Resolves the caller's own approved operator row, or returns an error. */
async function requireApprovedOperator(sessionClient: SessionClient) {
  const session = await getVerifiedSession();
  if (session.error || !session.user) {
    return { error: "You must be signed in." as const };
  }
  if (session.role !== "operator") {
    return { error: "Only an approved operator can manage packages." as const };
  }

  const { data: operator, error } = await sessionClient
    .from(OPERATOR_TABLE)
    .select("id,accreditation_status")
    .eq(OPERATOR_PROFILE_ID_COLUMN, session.user.id)
    .maybeSingle();

  if (error || !operator || typeof operator.id !== "string") {
    return { error: "No operator profile found for this account." as const };
  }
  if (operator.accreditation_status !== "approved") {
    return { error: "Your operator account is not yet approved." as const };
  }

  return { operatorId: operator.id as string };
}

/** Confirms package ownership and that the package is still a draft. */
async function requireEditablePackage(
  sessionClient: SessionClient,
  packageId: string,
  operatorId: string,
) {
  if (!isUuid(packageId)) {
    return { error: "The package identifier is invalid." as const };
  }

  const { data: pkg, error } = await sessionClient
    .from(PACKAGE_TABLE)
    .select("id,operator_id,status")
    .eq("id", packageId)
    .maybeSingle();

  if (error || !pkg) {
    return { error: "Package not found." as const };
  }
  if (pkg.operator_id !== operatorId) {
    return { error: "You do not have access to this package." as const };
  }
  if (!EDITABLE_PACKAGE_STATUSES.includes(pkg.status as PackageStatus)) {
    return { error: `Package cannot be edited while status is \"${pkg.status}\".` as const };
  }

  return { package: pkg };
}

export interface PackageCoreInput {
  title: string;
  description: string | null;
  locationName: string;
  durationValue: number;
  durationType: "hours" | "days";
  inclusions: string[];
  exclusions: string[];
  coverImageUrl: string | null;
  galleryUrls: string[];
}

function validatePackageCore(input: PackageCoreInput): string | null {
  if (!input || typeof input !== "object") return "Package details are invalid.";
  if (typeof input.title !== "string" || !input.title.trim()) return "Title is required.";
  if (typeof input.locationName !== "string" || !input.locationName.trim()) return "Location is required.";
  if (!Number.isFinite(input.durationValue) || input.durationValue <= 0) {
    return "Duration must be a positive number.";
  }
  if (input.durationType !== "hours" && input.durationType !== "days") {
    return "Invalid duration type.";
  }
  if (input.description !== null && typeof input.description !== "string") {
    return "Description must be text.";
  }
  if (!Array.isArray(input.inclusions) || !input.inclusions.every((value) => typeof value === "string")) {
    return "Package inclusions are invalid.";
  }
  if (!Array.isArray(input.exclusions) || !input.exclusions.every((value) => typeof value === "string")) {
    return "Package exclusions are invalid.";
  }
  if (input.coverImageUrl !== null && typeof input.coverImageUrl !== "string") {
    return "Cover image reference is invalid.";
  }
  if (!Array.isArray(input.galleryUrls) || !input.galleryUrls.every((value) => typeof value === "string")) {
    return "Package gallery references are invalid.";
  }
  return null;
}

function normalizedPackageCore(input: PackageCoreInput) {
  return {
    [PACKAGE_FIELDS.title]: input.title.trim(),
    [PACKAGE_FIELDS.description]: input.description?.trim() || null,
    [PACKAGE_FIELDS.locationName]: input.locationName.trim(),
    [PACKAGE_FIELDS.durationValue]: input.durationValue,
    [PACKAGE_FIELDS.durationType]: input.durationType,
    [PACKAGE_FIELDS.inclusions]: input.inclusions.map((value) => value.trim()).filter(Boolean),
    [PACKAGE_FIELDS.exclusions]: input.exclusions.map((value) => value.trim()).filter(Boolean),
    [PACKAGE_FIELDS.coverImageUrl]: input.coverImageUrl?.trim() || null,
    [PACKAGE_FIELDS.galleryUrls]: input.galleryUrls.map((value) => value.trim()).filter(Boolean),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePriceVariants(value: unknown): { data?: PriceVariantInput[]; error?: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "At least one price variant is required." };
  }

  const variants: PriceVariantInput[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) return { error: "A price variant is invalid." };
    if (candidate.id !== undefined && (typeof candidate.id !== "string" || !isUuid(candidate.id))) {
      return { error: "A price variant identifier is invalid." };
    }

    const variant = {
      ...(typeof candidate.id === "string" ? { id: candidate.id } : {}),
      variantName: candidate.variantName as string,
      minPax: candidate.minPax as number,
      maxPax: candidate.maxPax as number | null,
      pricePerPax: candidate.pricePerPax as number | null,
      flatPrice: candidate.flatPrice as number | null,
      isDefault: candidate.isDefault as boolean,
    } satisfies PriceVariantInput;

    if (typeof variant.isDefault !== "boolean") {
      return { error: "Choose exactly one default price variant." };
    }
    const validationError = validatePriceVariant(variant);
    if (validationError) return { error: validationError };
    variants.push({
      ...variant,
      variantName: variant.variantName.trim(),
    });
  }

  if (variants.filter((variant) => variant.isDefault).length !== 1) {
    return { error: "Exactly one price variant must be marked as default." };
  }
  return { data: variants };
}

function normalizePackageStops(value: unknown): { data?: PackageStopInput[]; error?: string } {
  if (!Array.isArray(value)) return { error: "Map stops are invalid." };

  const stops: PackageStopInput[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) return { error: "A map stop is invalid." };
    if (candidate.id !== undefined && (typeof candidate.id !== "string" || !isUuid(candidate.id))) {
      return { error: "A map stop identifier is invalid." };
    }

    const stop = {
      ...(typeof candidate.id === "string" ? { id: candidate.id } : {}),
      locationName: candidate.locationName as string,
      latitude: candidate.latitude as number,
      longitude: candidate.longitude as number,
      description: candidate.description as string | null,
      estimatedDurationMinutes: candidate.estimatedDurationMinutes as number | null,
    } satisfies PackageStopInput;

    const validationError = validatePackageStop(stop);
    if (validationError) return { error: validationError };
    stops.push({
      ...stop,
      locationName: stop.locationName.trim(),
      description: stop.description?.trim() || null,
    });
  }
  return { data: stops };
}

function actionError(action: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : "Unexpected error";
  console.error(`${action} failed: ${detail}`);
}

/** Creates a new draft package. Returns the new package id. */
export async function createPackage(
  input: PackageCoreInput,
): Promise<ActionResult<{ packageId: string }>> {
  const validationError = validatePackageCore(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const sessionClient = await createSupabaseServerClient();
    const auth = await requireApprovedOperator(sessionClient);
    if ("error" in auth) return { success: false, error: auth.error };

    const { data, error } = await sessionClient
      .from(PACKAGE_TABLE)
      .insert({
        [PACKAGE_FIELDS.operatorId]: auth.operatorId,
        ...normalizedPackageCore(input),
        [PACKAGE_FIELDS.status]: PACKAGE_STATUS.DRAFT,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      actionError("createPackage", error);
      return { success: false, error: "Could not create package. Please try again." };
    }

    revalidatePath("/tours/operator/packages");
    return { success: true, data: { packageId: data.id as string } };
  } catch (error) {
    actionError("createPackage", error);
    return { success: false, error: "Could not create package. Please try again." };
  }
}

/** Updates core fields of an existing draft package (not variants/stops). */
export async function updatePackageCore(
  packageId: string,
  input: PackageCoreInput,
): Promise<ActionResult> {
  const validationError = validatePackageCore(input);
  if (validationError) return { success: false, error: validationError };
  if (!isUuid(packageId)) return { success: false, error: "The package identifier is invalid." };

  try {
    const sessionClient = await createSupabaseServerClient();
    const auth = await requireApprovedOperator(sessionClient);
    if ("error" in auth) return { success: false, error: auth.error };

    const editable = await requireEditablePackage(sessionClient, packageId, auth.operatorId);
    if ("error" in editable) return { success: false, error: editable.error };

    const { data, error } = await sessionClient
      .from(PACKAGE_TABLE)
      .update(normalizedPackageCore(input))
      .eq("id", packageId)
      .eq(PACKAGE_FIELDS.operatorId, auth.operatorId)
      .eq(PACKAGE_FIELDS.status, PACKAGE_STATUS.DRAFT)
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      actionError("updatePackageCore", error);
      return { success: false, error: "Package could not be updated; it may no longer be editable." };
    }

    revalidatePath("/tours/operator/packages");
    revalidatePath(`/tours/operator/packages/${packageId}`);
    return { success: true };
  } catch (error) {
    actionError("updatePackageCore", error);
    return { success: false, error: "Could not update package. Please try again." };
  }
}

/** Atomically replaces all price variants for a package via the database RPC. */
export async function replacePriceVariants(
  packageId: string,
  variants: PriceVariantInput[],
): Promise<ActionResult> {
  if (!isUuid(packageId)) return { success: false, error: "The package identifier is invalid." };
  const normalized = normalizePriceVariants(variants);
  if (!normalized.data) return { success: false, error: normalized.error };

  try {
    const sessionClient = await createSupabaseServerClient();
    const auth = await requireApprovedOperator(sessionClient);
    if ("error" in auth) return { success: false, error: auth.error };

    const editable = await requireEditablePackage(sessionClient, packageId, auth.operatorId);
    if ("error" in editable) return { success: false, error: editable.error };

    const { error } = await sessionClient.rpc("replace_package_price_variants", {
      p_package_id: packageId,
      p_variants: normalized.data,
    });

    if (error) {
      actionError("replacePriceVariants", error);
      return { success: false, error: "Could not save price variants. Please try again." };
    }

    revalidatePath(`/tours/operator/packages/${packageId}`);
    revalidatePath("/tours/operator/packages");
    return { success: true };
  } catch (error) {
    actionError("replacePriceVariants", error);
    return { success: false, error: "Could not save price variants. Please try again." };
  }
}

/** Atomically replaces all map stops via RPC; order is array position, never client stop_order. */
export async function replacePackageStops(
  packageId: string,
  stops: PackageStopInput[],
): Promise<ActionResult> {
  if (!isUuid(packageId)) return { success: false, error: "The package identifier is invalid." };
  const normalized = normalizePackageStops(stops);
  if (!normalized.data) return { success: false, error: normalized.error };

  try {
    const sessionClient = await createSupabaseServerClient();
    const auth = await requireApprovedOperator(sessionClient);
    if ("error" in auth) return { success: false, error: auth.error };

    const editable = await requireEditablePackage(sessionClient, packageId, auth.operatorId);
    if ("error" in editable) return { success: false, error: editable.error };

    const { error } = await sessionClient.rpc("replace_package_stops", {
      p_package_id: packageId,
      p_stops: normalized.data,
    });

    if (error) {
      actionError("replacePackageStops", error);
      return { success: false, error: "Could not save map stops. Please try again." };
    }

    revalidatePath(`/tours/operator/packages/${packageId}`);
    revalidatePath("/tours/operator/packages");
    return { success: true };
  } catch (error) {
    actionError("replacePackageStops", error);
    return { success: false, error: "Could not save map stops. Please try again." };
  }
}

/** Moves a draft package to pending_review after checking its variants and stops. */
export async function submitPackageForReview(packageId: string): Promise<ActionResult> {
  if (!isUuid(packageId)) return { success: false, error: "The package identifier is invalid." };

  try {
    const sessionClient = await createSupabaseServerClient();
    const auth = await requireApprovedOperator(sessionClient);
    if ("error" in auth) return { success: false, error: auth.error };

    const editable = await requireEditablePackage(sessionClient, packageId, auth.operatorId);
    if ("error" in editable) return { success: false, error: editable.error };

    const { data: variantRows, error: variantsError } = await sessionClient
      .from(PRICE_VARIANT_TABLE)
      .select("variant_name,min_pax,max_pax,price_per_pax,flat_price,is_default")
      .eq(PRICE_VARIANT_FIELDS.packageId, packageId);

    if (variantsError || !variantRows || variantRows.length === 0) {
      return { success: false, error: "Add at least one price variant before submitting." };
    }
    const variants = variantRows.map((row) => ({
      variantName: row.variant_name,
      minPax: row.min_pax,
      maxPax: row.max_pax,
      pricePerPax: row.price_per_pax,
      flatPrice: row.flat_price,
      isDefault: row.is_default,
    }));
    if (variants.filter((variant) => variant.isDefault).length !== 1) {
      return { success: false, error: "Set exactly one price variant as the default before submitting." };
    }
    for (const variant of variants) {
      const validationError = validatePriceVariant(variant);
      if (validationError) return { success: false, error: validationError };
    }

    const { data: stopRows, error: stopsError } = await sessionClient
      .from(STOP_TABLE)
      .select("stop_order,location_name,latitude,longitude,description,estimated_duration_minutes")
      .eq(STOP_FIELDS.packageId, packageId)
      .order(STOP_FIELDS.stopOrder, { ascending: true });

    if (stopsError || !stopRows || stopRows.length === 0) {
      return { success: false, error: "Add at least one map stop before submitting." };
    }
    const stops = stopRows.map((row) => ({
      locationName: row.location_name,
      latitude: row.latitude,
      longitude: row.longitude,
      description: row.description,
      estimatedDurationMinutes: row.estimated_duration_minutes,
    }));
    for (const [index, stop] of stops.entries()) {
      if (stopRows[index].stop_order !== index + 1) {
        return { success: false, error: "Save the map stops again to restore their order before submitting." };
      }
      const validationError = validatePackageStop(stop);
      if (validationError) return { success: false, error: validationError };
    }

    const { data, error } = await sessionClient
      .from(PACKAGE_TABLE)
      .update({ [PACKAGE_FIELDS.status]: PACKAGE_STATUS.PENDING_REVIEW })
      .eq("id", packageId)
      .eq(PACKAGE_FIELDS.operatorId, auth.operatorId)
      .eq(PACKAGE_FIELDS.status, PACKAGE_STATUS.DRAFT)
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      actionError("submitPackageForReview", error);
      return { success: false, error: "Package could not be submitted; it may no longer be a draft." };
    }

    revalidatePath("/tours/operator/packages");
    revalidatePath(`/tours/operator/packages/${packageId}`);
    return { success: true };
  } catch (error) {
    actionError("submitPackageForReview", error);
    return { success: false, error: "Could not submit package for review. Please try again." };
  }
}

/** Lists packages owned by the current approved operator. */
export async function listOperatorPackages(): Promise<ActionResult<PackageListRecord[]>> {
  try {
    const sessionClient = await createSupabaseServerClient();
    const auth = await requireApprovedOperator(sessionClient);
    if ("error" in auth) return { success: false, error: auth.error };

    const { data, error } = await sessionClient
      .from(PACKAGE_TABLE)
      .select(PACKAGE_LIST_SELECT)
      .eq(PACKAGE_FIELDS.operatorId, auth.operatorId)
      .order("updated_at", { ascending: false });

    if (error) {
      actionError("listOperatorPackages", error);
      return { success: false, error: "Could not load packages." };
    }

    return { success: true, data: (data ?? []) as unknown as PackageListRecord[] };
  } catch (error) {
    actionError("listOperatorPackages", error);
    return { success: false, error: "Could not load packages." };
  }
}

/** Fetches one package with its variants and stops for the edit page. */
export async function getPackageDetail(
  packageId: string,
): Promise<ActionResult<PackageDetailRecord>> {
  if (!isUuid(packageId)) return { success: false, error: "Package not found or you do not have access." };

  try {
    const sessionClient = await createSupabaseServerClient();
    const auth = await requireApprovedOperator(sessionClient);
    if ("error" in auth) return { success: false, error: auth.error };

    const { data, error } = await sessionClient
      .from(PACKAGE_TABLE)
      .select(PACKAGE_DETAIL_SELECT)
      .eq("id", packageId)
      .eq(PACKAGE_FIELDS.operatorId, auth.operatorId)
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: "Package not found or you do not have access." };
    }

    return { success: true, data: data as unknown as PackageDetailRecord };
  } catch (error) {
    actionError("getPackageDetail", error);
    return { success: false, error: "Could not load package details." };
  }
}
