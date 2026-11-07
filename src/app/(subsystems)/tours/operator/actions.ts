"use server";

import { revalidatePath } from "next/cache";
import {
  OPERATOR_DOCUMENT_BUCKET,
  OPERATOR_DETAIL_COLUMNS,
  OPERATOR_FILE_COLUMNS,
  OPERATOR_REVIEW_NOTE_COLUMN,
  OPERATOR_STATUS_COLUMN,
  OPERATOR_TABLE,
  OPERATOR_USER_ID_COLUMN,
  PROFILE_ID_COLUMN,
  PROFILE_ROLE_COLUMN,
  PROFILE_TABLE,
} from "@/lib/tours/operator-contract";
import type { OperatorActionState } from "@/lib/tours/operator-action-state";
import { isUuid } from "@/lib/tours/operator-access";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import {
  isAllowedTotalUploadSize,
  inspectOperatorUpload,
  MAX_OPERATOR_FILE_BYTES,
  type DetectedUpload,
  type OperatorUploadField,
} from "@/lib/tours/operator-upload-validation";
import { validateOperatorDetails, zodFieldErrors } from "@/lib/tours/operator-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_REJECTION_REASON_LENGTH = 1000;

function getText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function getUpload(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  if (
    !value ||
    typeof value === "string" ||
    typeof value.arrayBuffer !== "function" ||
    typeof value.size !== "number" ||
    !value.name
  ) {
    return null;
  }
  return value as File;
}

async function removeUploadedFiles(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await admin.storage.from(OPERATOR_DOCUMENT_BUCKET).remove(paths);
    if (error) console.error("Could not clean up an incomplete operator upload.");
  } catch {
    console.error("Could not clean up an incomplete operator upload.");
  }
}

function makeObjectPath(userId: string, field: OperatorUploadField, upload: DetectedUpload): string {
  return `${userId}/${crypto.randomUUID()}-${field}.${upload.extension}`;
}

/**
 * Authenticated tourist/operator applications are submitted through this action.
 * User-provided role values are never read; role and user id come from Supabase.
 */
export async function submitOperatorRegistration(
  _previousState: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  let applicationSaved = false;
  const newlyUploadedPaths: string[] = [];

  try {
    const session = await getVerifiedSession();
    if (!session.user) {
      return { status: "error", message: "Please sign in before submitting an operator application." };
    }
    if (session.error || !session.role) {
      return {
        status: "error",
        message: session.error ?? "Your account role could not be verified. Please try again later.",
      };
    }
    if (session.role !== "tourist" && session.role !== "operator" && session.role !== "guide") {
      return { status: "error", message: "This account is not allowed to submit an operator application." };
    }

    const detailsResult = validateOperatorDetails({
      businessName: getText(formData, "businessName"),
      contactPerson: getText(formData, "contactPerson"),
      contactEmail: getText(formData, "contactEmail"),
      contactPhone: getText(formData, "contactPhone"),
      businessAddress: getText(formData, "businessAddress"),
    });

    const fields: OperatorUploadField[] = ["dtiDocument", "businessPermit", "gcashQr"];
    const files = fields.map((field) => ({ field, file: getUpload(formData, field) }));
    const fileErrors: Record<string, string> = {};
    for (const { field, file } of files) {
      if (!file) fileErrors[field] = "Choose a file to continue.";
    }

    const totalBytes = files.reduce((sum, item) => sum + (item.file?.size ?? 0), 0);
    if (files.every((item) => item.file) && !isAllowedTotalUploadSize(totalBytes)) {
      fileErrors.dtiDocument = "The combined upload size must be 15 MB or less.";
    }

    if (!detailsResult.success || Object.keys(fileErrors).length > 0) {
      const fieldErrors = detailsResult.success ? {} : zodFieldErrors(detailsResult.error);
      return {
        status: "error",
        message: "Please check the highlighted information and try again.",
        fieldErrors: { ...fieldErrors, ...fileErrors },
      };
    }

    const inspectedFiles: Array<{
      field: OperatorUploadField;
      file: File;
      detected: DetectedUpload;
    }> = [];
    for (const { field, file } of files) {
      // Missing files have already been returned above; this guard narrows the type.
      if (!file) continue;
      const inspected = await inspectOperatorUpload(file, field);
      if (!inspected.ok) {
        return {
          status: "error",
          message: "Please check the highlighted files and try again.",
          fieldErrors: { [field]: inspected.message },
        };
      }
      inspectedFiles.push({ field, file, detected: inspected.detected });
    }

    // This privileged client is only constructed after the authenticated session
    // and server-side role have both been checked.
    admin = createSupabaseAdminClient();
    const { data: existing, error: existingError } = await admin
      .from(OPERATOR_TABLE)
      .select(
        `id,${OPERATOR_STATUS_COLUMN},${OPERATOR_FILE_COLUMNS.dtiDocument},${OPERATOR_FILE_COLUMNS.businessPermit},${OPERATOR_FILE_COLUMNS.gcashQr}`,
      )
      .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
      .maybeSingle();

    if (existingError) {
      return { status: "error", message: "We could not check your application status. Please try again." };
    }
    if (existing?.accreditation_status === "pending") {
      return {
        status: "error",
        message: "An operator application is already awaiting review.",
      };
    }
    if (existing?.accreditation_status === "approved") {
      return {
        status: "error",
        message: "This account is already an accredited operator.",
      };
    }

    const storedPaths: Partial<Record<OperatorUploadField, string>> = {};
    for (const { field, file, detected } of inspectedFiles) {
      if (file.size > MAX_OPERATOR_FILE_BYTES) {
        await removeUploadedFiles(admin, newlyUploadedPaths);
        return {
          status: "error",
          message: "Please check the highlighted files and try again.",
          fieldErrors: { [field]: "Each file must be 5 MB or smaller after image compression." },
        };
      }

      const path = makeObjectPath(session.user.id, field, detected);
      const { error: uploadError } = await admin.storage
        .from(OPERATOR_DOCUMENT_BUCKET)
        .upload(path, file, {
          contentType: detected.mimeType,
          // Application records and payment identifiers should not be cached by shared proxies.
          cacheControl: "0",
          upsert: false,
        });

      if (uploadError) {
        await removeUploadedFiles(admin, newlyUploadedPaths);
        return {
          status: "error",
          message: "A document could not be uploaded. Please try again; your application has not been submitted.",
        };
      }

      newlyUploadedPaths.push(path);
      storedPaths[field] = path;
    }

    const details = detailsResult.data;
    const applicationValues = {
      [OPERATOR_DETAIL_COLUMNS.businessName]: details.businessName,
      [OPERATOR_DETAIL_COLUMNS.contactPerson]: details.contactPerson,
      [OPERATOR_DETAIL_COLUMNS.contactEmail]: details.contactEmail,
      [OPERATOR_DETAIL_COLUMNS.contactPhone]: details.contactPhone,
      [OPERATOR_DETAIL_COLUMNS.businessAddress]: details.businessAddress,
      [OPERATOR_FILE_COLUMNS.dtiDocument]: storedPaths.dtiDocument,
      [OPERATOR_FILE_COLUMNS.businessPermit]: storedPaths.businessPermit,
      [OPERATOR_FILE_COLUMNS.gcashQr]: storedPaths.gcashQr,
      [OPERATOR_STATUS_COLUMN]: "pending",
      [OPERATOR_REVIEW_NOTE_COLUMN]: null,
      reviewed_by: null,
      reviewed_at: null,
    };

    let saveError: { message?: string } | null = null;
    let saved = false;
    if (existing) {
      const { data, error } = await admin
        .from(OPERATOR_TABLE)
        .update(applicationValues)
        .eq("id", existing.id)
        .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
        .eq(OPERATOR_STATUS_COLUMN, "rejected")
        .select("id")
        .maybeSingle();
      saveError = error;
      saved = Boolean(data?.id);
    } else {
      const { data, error } = await admin
        .from(OPERATOR_TABLE)
        .insert({
          ...applicationValues,
          [OPERATOR_USER_ID_COLUMN]: session.user.id,
        })
        .select("id")
        .maybeSingle();
      saveError = error;
      saved = Boolean(data?.id);
    }

    if (saveError || !saved) {
      await removeUploadedFiles(admin, newlyUploadedPaths);
      return {
        status: "error",
        message: "We could not save your application. Your uploaded files were not attached; please try again.",
      };
    }
    applicationSaved = true;

    // A rejected application may be resubmitted. Remove its old private objects
    // only after the new paths have been saved successfully.
    if (existing) {
      const oldPaths = [
        existing[OPERATOR_FILE_COLUMNS.dtiDocument],
        existing[OPERATOR_FILE_COLUMNS.businessPermit],
        existing[OPERATOR_FILE_COLUMNS.gcashQr],
      ].filter((path): path is string => typeof path === "string" && path.length > 0);
      await removeUploadedFiles(admin, oldPaths);
    }

    revalidatePath("/tours/operator/register");
    revalidatePath("/tours/operator/pending");
    revalidatePath("/tours/operator/dashboard");

    return {
      status: "success",
      message: "Your application is in. We will notify you after the Tourism Office reviews it.",
    };
  } catch {
    if (admin && !applicationSaved) await removeUploadedFiles(admin, newlyUploadedPaths);
    return {
      status: "error",
      message: "We could not submit your application right now. Please try again in a moment.",
    };
  }
}

/** Admin-only action for deciding a pending accreditation application. */
export async function reviewOperatorApplication(
  _previousState: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  try {
    const session = await getVerifiedSession();
    if (!session.user) {
      return { status: "error", message: "Please sign in with an admin account." };
    }
    if (session.error || session.role !== "admin") {
      return {
        status: "error",
        message: session.error ?? "Only an admin can review operator applications.",
      };
    }

    const operatorId = getText(formData, "operatorId").trim();
    const decision = getText(formData, "decision");
    const rejectionReason = getText(formData, "rejectionReason").trim();

    if (!isUuid(operatorId)) {
      return { status: "error", message: "The application identifier is invalid." };
    }
    if (decision !== "approved" && decision !== "rejected") {
      return { status: "error", message: "Choose approve or reject." };
    }
    if (decision === "rejected" && rejectionReason.length < 10) {
      return {
        status: "error",
        message: "Please give the applicant a short reason (at least 10 characters).",
        fieldErrors: { rejectionReason: "Add a clear reason so the operator knows what to fix." },
      };
    }
    if (rejectionReason.length > MAX_REJECTION_REASON_LENGTH) {
      return {
        status: "error",
        message: "The rejection reason must be 1,000 characters or fewer.",
        fieldErrors: { rejectionReason: "Keep the reason under 1,000 characters." },
      };
    }

    const admin = createSupabaseAdminClient();
    const { data: application, error: applicationError } = await admin
      .from(OPERATOR_TABLE)
      .select(`id,${OPERATOR_USER_ID_COLUMN}`)
      .eq("id", operatorId)
      .eq(OPERATOR_STATUS_COLUMN, "pending")
      .maybeSingle();

    if (applicationError || !application) {
      return {
        status: "error",
        message: "This application is no longer pending or could not be found. Refresh the queue.",
      };
    }

    let priorRole: string | null = null;
    let roleWasChanged = false;
    if (decision === "approved") {
      const { data: profile, error: profileError } = await admin
        .from(PROFILE_TABLE)
        .select(`${PROFILE_ID_COLUMN},${PROFILE_ROLE_COLUMN}`)
        .eq(PROFILE_ID_COLUMN, application[OPERATOR_USER_ID_COLUMN])
        .maybeSingle();

      if (profileError || !profile || !["tourist", "operator"].includes(profile[PROFILE_ROLE_COLUMN])) {
        return {
          status: "error",
          message: "The applicant's account role could not be safely updated. Contact the system administrator.",
        };
      }

      priorRole = profile[PROFILE_ROLE_COLUMN];
      if (priorRole === "tourist") {
        const { data: updatedProfile, error: roleError } = await admin
          .from(PROFILE_TABLE)
          .update({ [PROFILE_ROLE_COLUMN]: "operator" })
          .eq(PROFILE_ID_COLUMN, application[OPERATOR_USER_ID_COLUMN])
          .eq(PROFILE_ROLE_COLUMN, "tourist")
          .select(PROFILE_ID_COLUMN)
          .maybeSingle();

        if (roleError || !updatedProfile) {
          return {
            status: "error",
            message: "The applicant's role changed while this page was open. Refresh and review again.",
          };
        }
        roleWasChanged = true;
      }
    }

    const reviewValues = {
      [OPERATOR_STATUS_COLUMN]: decision,
      [OPERATOR_REVIEW_NOTE_COLUMN]: decision === "rejected" ? rejectionReason : null,
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
    };
    const { data: updatedApplication, error: reviewError } = await admin
      .from(OPERATOR_TABLE)
      .update(reviewValues)
      .eq("id", operatorId)
      .eq(OPERATOR_STATUS_COLUMN, "pending")
      .select("id")
      .maybeSingle();

    if (reviewError || !updatedApplication) {
      if (roleWasChanged && priorRole) {
        await admin
          .from(PROFILE_TABLE)
          .update({ [PROFILE_ROLE_COLUMN]: priorRole })
          .eq(PROFILE_ID_COLUMN, application[OPERATOR_USER_ID_COLUMN])
          .eq(PROFILE_ROLE_COLUMN, "operator");
      }
      return {
        status: "error",
        message: "The application changed before this decision was saved. Refresh the queue and try again.",
      };
    }

    revalidatePath("/tours/admin/operators");
    revalidatePath("/tours/operator/register");
    revalidatePath("/tours/operator/pending");
    revalidatePath("/tours/operator/dashboard");

    return {
      status: "success",
      message: decision === "approved" ? "Operator approved." : "Application rejected; the applicant can resubmit.",
    };
  } catch {
    return {
      status: "error",
      message: "The review could not be saved. Please refresh the queue and try again.",
    };
  }
}
