"use server";

import { revalidatePath } from "next/cache";
import {
  guideFieldErrors,
  hasGuideIdConsent,
  validateGuideRegistration,
} from "@/lib/tours/guide-validation";
import {
  GUIDE_NOTES_COLUMN,
  GUIDE_PUBLIC_FIELDS,
  GUIDE_SENSITIVE_DOCUMENT_BUCKET,
  GUIDE_SENSITIVE_FIELDS,
  GUIDE_SENSITIVE_TABLE,
  GUIDE_STATUS_COLUMN,
  GUIDE_TABLE,
  GUIDE_USER_ID_COLUMN,
} from "@/lib/tours/guide-contract";
import type { GuideActionState, GuideQrPreviewResult } from "@/lib/tours/guide-action-state";
import { auditGuideSensitiveAccess } from "@/lib/tours/guide-audit";
import { isUuid } from "@/lib/tours/operator-access";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { createGuideQrPngDataUrl } from "@/lib/tours/guide-qr";
import { inspectGuideIdDocument } from "@/lib/tours/guide-upload-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_REJECTION_REASON_LENGTH = 1000;
const GUIDE_SIGNED_URL_TTL_SECONDS = 180;

function getText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
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

async function removeGuideDocument(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  path: string | null,
): Promise<void> {
  if (!path) return;
  try {
    const { error } = await admin.storage.from(GUIDE_SENSITIVE_DOCUMENT_BUCKET).remove([path]);
    if (error) console.error("Could not clean up an incomplete guide ID upload.");
  } catch {
    console.error("Could not clean up an incomplete guide ID upload.");
  }
}

function guideDocumentPath(userId: string, guideId: string, extension: string): string {
  return `${userId}/${guideId}/${crypto.randomUUID()}-identity.${extension}`;
}

function makeGuideQrResult(guideId: string): Promise<string> {
  return createGuideQrPngDataUrl(guideId);
}

/**
 * Creates the QR preview identifier used by the form. It is only a public row
 * identifier; no identity number, document path, or other sensitive data is encoded.
 */
export async function prepareGuideQrPreview(): Promise<GuideQrPreviewResult> {
  try {
    const session = await getVerifiedSession();
    if (!session.user) {
      return { status: "error", message: "Sign in before preparing your guide application." };
    }
    if (session.error || !session.role) {
      return { status: "error", message: session.error ?? "Your account role could not be verified." };
    }
    if (session.role !== "tourist" && session.role !== "guide") {
      return { status: "error", message: "This account cannot apply as a guide." };
    }

    const supabase = await createSupabaseServerClient();
    const { data: existing, error } = await supabase
      .from(GUIDE_TABLE)
      .select(`id,${GUIDE_STATUS_COLUMN}`)
      .eq(GUIDE_USER_ID_COLUMN, session.user.id)
      .maybeSingle();

    if (error) {
      return { status: "error", message: "Your existing guide application could not be checked." };
    }
    if (existing?.accreditation_status === "pending") {
      return { status: "error", message: "A guide application is already awaiting review." };
    }
    if (existing?.accreditation_status === "approved") {
      return { status: "error", message: "This account is already an approved guide." };
    }

    const guideId = existing?.accreditation_status === "rejected" ? existing.id : crypto.randomUUID();
    const qrDataUrl = await makeGuideQrResult(guideId);
    return {
      status: "success",
      message: "Badge QR preview ready. It will remain unavailable after submission until approval.",
      guideId,
      qrDataUrl,
    };
  } catch {
    return { status: "error", message: "We could not prepare the QR preview. Please try again." };
  }
}

/**
 * Registration writes the public row with the caller's authenticated session,
 * then writes the sensitive record with service_role. Consent is checked before
 * validation, upload, public-row writes, or any access to the sensitive table.
 */
export async function submitGuideRegistration(
  _previousState: GuideActionState,
  formData: FormData,
): Promise<GuideActionState> {
  // This is deliberately the first form-data check: unchecked consent must cause
  // no sensitive table access, no Storage upload, and no guide row creation.
  if (!hasGuideIdConsent(formData.get("consentFullIdDisplay"))) {
    return {
      status: "error",
      message: "Consent is required. We will not save your identity information unless you explicitly agree.",
      fieldErrors: { consentFullIdDisplay: "Check the consent box to allow the required ID verification." },
    };
  }

  let sessionClient: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  let uploadedPath: string | null = null;
  let publicRowWritten = false;
  let sensitiveRowWritten = false;
  let resubmittingRejected = false;
  let previousAccreditationNotes: string | null = null;
  let guideId = "";

  try {
    const session = await getVerifiedSession();
    if (!session.user) {
      return { status: "error", message: "Please sign in before submitting a guide application." };
    }
    if (session.error || !session.role) {
      return { status: "error", message: session.error ?? "Your account role could not be verified." };
    }
    if (session.role !== "tourist" && session.role !== "guide") {
      return { status: "error", message: "This account cannot submit a guide application." };
    }

    const profile = validateGuideRegistration({
      fullName: getText(formData, "fullName"),
      contactPhone: getText(formData, "contactPhone"),
      bio: getText(formData, "bio"),
      idType: getText(formData, "idType"),
      idNumber: getText(formData, "idNumber"),
    });
    if (!profile.success) {
      return {
        status: "error",
        message: "Please correct the highlighted information.",
        fieldErrors: guideFieldErrors(profile.error),
      };
    }

    const idDocument = getFile(formData, "idDocument");
    if (!idDocument) {
      return {
        status: "error",
        message: "Upload a clear image or PDF of your government-issued ID.",
        fieldErrors: { idDocument: "Choose a government-issued ID file." },
      };
    }
    const inspected = await inspectGuideIdDocument(idDocument);
    if (!inspected.ok) {
      return {
        status: "error",
        message: "The ID document could not be accepted.",
        fieldErrors: { idDocument: inspected.message },
      };
    }

    const requestedGuideId = getText(formData, "guideId").trim();
    if (!isUuid(requestedGuideId)) {
      return { status: "error", message: "The QR preview expired. Return to step 3 to generate a new one." };
    }

    sessionClient = await createSupabaseServerClient();
    const { data: existing, error: existingError } = await sessionClient
      .from(GUIDE_TABLE)
      .select(`id,${GUIDE_STATUS_COLUMN},${GUIDE_NOTES_COLUMN}`)
      .eq(GUIDE_USER_ID_COLUMN, session.user.id)
      .maybeSingle();

    if (existingError) {
      return { status: "error", message: "We could not check your guide application status." };
    }
    if (existing?.accreditation_status === "pending") {
      return { status: "error", message: "A guide application is already awaiting review." };
    }
    if (existing?.accreditation_status === "approved") {
      return { status: "error", message: "This account is already an approved guide." };
    }
    if (existing?.accreditation_status === "rejected" && existing.id !== requestedGuideId) {
      return { status: "error", message: "Refresh the QR preview before resubmitting your application." };
    }

    guideId = requestedGuideId;
    resubmittingRejected = existing?.accreditation_status === "rejected";
    previousAccreditationNotes = existing?.[GUIDE_NOTES_COLUMN] ?? null;

    // Server timestamp is captured only after explicit true consent, before the
    // private row is created. It is never accepted from a client-provided field.
    const consentGivenAt = new Date().toISOString();
    admin = createSupabaseAdminClient();

    let oldDocumentPath: string | null = null;
    if (resubmittingRejected) {
      // Sensitive reads happen only inside this Server Action, via service_role.
      let previousSensitivePath: string | null = null;
      let previousSensitiveReadFailed = false;
      try {
        const { data, error } = await admin
          .from(GUIDE_SENSITIVE_TABLE)
          .select(GUIDE_SENSITIVE_FIELDS.documentPath)
          .eq(GUIDE_SENSITIVE_FIELDS.guideId, guideId)
          .maybeSingle();
        previousSensitiveReadFailed = Boolean(error);
        previousSensitivePath = typeof data?.[GUIDE_SENSITIVE_FIELDS.documentPath] === "string"
          ? data[GUIDE_SENSITIVE_FIELDS.documentPath]
          : null;
      } catch {
        previousSensitiveReadFailed = true;
      }
      auditGuideSensitiveAccess({
        actorUserId: session.user.id,
        guideId,
        operation: "read_existing_document_path",
        outcome: previousSensitiveReadFailed ? "failure" : previousSensitivePath ? "success" : "not_found",
      });
      if (previousSensitiveReadFailed) {
        return { status: "error", message: "The previous identity record could not be safely replaced." };
      }
      oldDocumentPath = previousSensitivePath;
    }

    const objectPath = guideDocumentPath(session.user.id, guideId, inspected.detected.extension);
    const { error: storageError } = await admin.storage
      .from(GUIDE_SENSITIVE_DOCUMENT_BUCKET)
      .upload(objectPath, idDocument, {
        contentType: inspected.detected.mimeType,
        cacheControl: "0",
        upsert: false,
      });

    if (storageError) {
      return {
        status: "error",
        message: "Your ID document could not be uploaded to private storage. No application was saved.",
      };
    }
    uploadedPath = objectPath;

    const publicValues = {
      [GUIDE_PUBLIC_FIELDS.contactPhone]: profile.data.contactPhone,
      [GUIDE_PUBLIC_FIELDS.bio]: profile.data.bio,
      [GUIDE_PUBLIC_FIELDS.consent]: true,
      [GUIDE_PUBLIC_FIELDS.consentAt]: consentGivenAt,
      [GUIDE_STATUS_COLUMN]: "pending",
      [GUIDE_NOTES_COLUMN]: null,
      reviewed_by: null,
      reviewed_at: null,
    };

    if (resubmittingRejected && existing) {
      const { data: updatedGuide, error: publicUpdateError } = await sessionClient
        .from(GUIDE_TABLE)
        .update(publicValues)
        .eq("id", existing.id)
        .eq(GUIDE_USER_ID_COLUMN, session.user.id)
        .eq(GUIDE_STATUS_COLUMN, "rejected")
        .select("id")
        .maybeSingle();
      if (publicUpdateError || !updatedGuide) {
        await removeGuideDocument(admin, uploadedPath);
        uploadedPath = null;
        return { status: "error", message: "Your rejected guide application changed. Refresh and try again." };
      }
    } else {
      const { error: publicInsertError } = await sessionClient.from(GUIDE_TABLE).insert({
        id: guideId,
        [GUIDE_USER_ID_COLUMN]: session.user.id,
        ...publicValues,
      });
      if (publicInsertError) {
        await removeGuideDocument(admin, uploadedPath);
        uploadedPath = null;
        return { status: "error", message: "Your public guide profile could not be saved. Please try again." };
      }
    }
    publicRowWritten = true;

    try {
      const { error: profileNameSyncError } = await sessionClient
        .from("profiles")
        .update({ full_name: profile.data.fullName })
        .eq("id", session.user.id);
      if (profileNameSyncError) {
        console.error("Could not sync guide applicant name to profile.");
      }
    } catch {
      console.error("Could not sync guide applicant name to profile.");
    }

    const sensitiveValues = {
      [GUIDE_SENSITIVE_FIELDS.guideId]: guideId,
      [GUIDE_SENSITIVE_FIELDS.fullLegalName]: profile.data.fullName,
      [GUIDE_SENSITIVE_FIELDS.idType]: profile.data.idType,
      [GUIDE_SENSITIVE_FIELDS.idNumber]: profile.data.idNumber,
      [GUIDE_SENSITIVE_FIELDS.documentPath]: objectPath,
    };

    // The service-role client is used only in this Server Action. The sensitive
    // table has no RLS policies; the server-generated consent timestamp and true
    // consent flag are stored on the public guide row before this write.
    let sensitiveWriteFailed = false;
    try {
      const { error } = await admin
        .from(GUIDE_SENSITIVE_TABLE)
        .upsert(sensitiveValues, { onConflict: GUIDE_SENSITIVE_FIELDS.guideId });
      sensitiveWriteFailed = Boolean(error);
    } catch {
      sensitiveWriteFailed = true;
    }
    auditGuideSensitiveAccess({
      actorUserId: session.user.id,
      guideId,
      operation: "write_sensitive_info",
      outcome: sensitiveWriteFailed ? "failure" : "success",
    });

    if (sensitiveWriteFailed) {
      if (resubmittingRejected && existing) {
        await sessionClient
          .from(GUIDE_TABLE)
          .update({
            [GUIDE_STATUS_COLUMN]: "rejected",
            [GUIDE_NOTES_COLUMN]: previousAccreditationNotes,
          })
          .eq("id", existing.id)
          .eq(GUIDE_USER_ID_COLUMN, session.user.id);
      } else {
        // Compensate the public insert if the sensitive write fails; service_role
        // is used only for cleanup after the normal authenticated insert.
        await admin.from(GUIDE_TABLE).delete().eq("id", guideId).eq(GUIDE_USER_ID_COLUMN, session.user.id);
      }
      publicRowWritten = false;
      await removeGuideDocument(admin, uploadedPath);
      uploadedPath = null;
      return {
        status: "error",
        message: "Your identity details could not be stored securely. No guide application was submitted.",
      };
    }

    sensitiveRowWritten = true;
    if (oldDocumentPath && oldDocumentPath !== objectPath) await removeGuideDocument(admin, oldDocumentPath);

    revalidatePath("/tours/guide/register");
    revalidatePath("/tours/guide/pending");
    revalidatePath("/tours/guide/dashboard");
    revalidatePath("/tours/guide/my-qr");

    return {
      status: "success",
      message: "Your guide application is submitted and pending Tourism Office approval.",
    };
  } catch {
    if (admin && uploadedPath && !sensitiveRowWritten) {
      await removeGuideDocument(admin, uploadedPath);
    }
    if (admin && publicRowWritten && !sensitiveRowWritten && guideId && !resubmittingRejected) {
      await admin.from(GUIDE_TABLE).delete().eq("id", guideId);
    }
    return {
      status: "error",
      message: "We could not submit your guide application. Please try again in a moment.",
    };
  }
}

/** Admin Server Action: reads only the private document path and returns a short-lived signed download URL. */
export async function getGuideSensitiveDocumentLink(
  _previousState: GuideActionState,
  formData: FormData,
): Promise<GuideActionState> {
  try {
    const session = await getVerifiedSession();
    if (!session.user) return { status: "error", message: "Sign in with an admin account to view ID documents." };
    if (session.error || session.role !== "admin") {
      return { status: "error", message: session.error ?? "Only an admin can view guide ID documents." };
    }

    const guideId = getText(formData, "guideId").trim();
    if (!isUuid(guideId)) return { status: "error", message: "Invalid guide application." };

    const admin = createSupabaseAdminClient();
    const { data: guide, error: guideError } = await admin
      .from(GUIDE_TABLE)
      .select(`id,${GUIDE_STATUS_COLUMN}`)
      .eq("id", guideId)
      .eq(GUIDE_STATUS_COLUMN, "pending")
      .maybeSingle();
    if (guideError || !guide) {
      return { status: "error", message: "This guide is not awaiting review or could not be found." };
    }

    // No sensitive row is ever sent to the client. This action selects the one
    // object path needed to mint a short-lived, private download URL.
    let documentPath: string | null = null;
    let sensitiveReadFailed = false;
    try {
      const { data, error } = await admin
        .from(GUIDE_SENSITIVE_TABLE)
        .select(GUIDE_SENSITIVE_FIELDS.documentPath)
        .eq(GUIDE_SENSITIVE_FIELDS.guideId, guideId)
        .maybeSingle();
      sensitiveReadFailed = Boolean(error);
      documentPath = typeof data?.[GUIDE_SENSITIVE_FIELDS.documentPath] === "string"
        ? data[GUIDE_SENSITIVE_FIELDS.documentPath]
        : null;
    } catch {
      sensitiveReadFailed = true;
    }
    auditGuideSensitiveAccess({
      actorUserId: session.user.id,
      guideId,
      operation: "read_document_path_for_review",
      outcome: sensitiveReadFailed ? "failure" : documentPath ? "success" : "not_found",
    });
    if (sensitiveReadFailed || !documentPath) {
      return { status: "error", message: "The private ID document is unavailable." };
    }

    let signedUrl: string | null = null;
    try {
      const { data, error } = await admin.storage
        .from(GUIDE_SENSITIVE_DOCUMENT_BUCKET)
        .createSignedUrl(documentPath, GUIDE_SIGNED_URL_TTL_SECONDS, { download: true });
      if (!error && typeof data?.signedUrl === "string") signedUrl = data.signedUrl;
    } catch {
      signedUrl = null;
    }
    auditGuideSensitiveAccess({
      actorUserId: session.user.id,
      guideId,
      operation: "create_private_document_link",
      outcome: signedUrl ? "success" : "failure",
    });
    if (!signedUrl) {
      return { status: "error", message: "A temporary ID document link could not be created." };
    }

    return {
      status: "success",
      message: "Private ID document link ready. It expires in 3 minutes.",
      signedUrl,
    };
  } catch {
    return { status: "error", message: "The ID document could not be opened securely." };
  }
}

/** Admin-only review action. The sensitive table is not read or exposed here. */
export async function reviewGuideApplication(
  _previousState: GuideActionState,
  formData: FormData,
): Promise<GuideActionState> {
  try {
    const session = await getVerifiedSession();
    if (!session.user) return { status: "error", message: "Sign in with an admin account to review guides." };
    if (session.error || session.role !== "admin") {
      return { status: "error", message: session.error ?? "Only an admin can review guide applications." };
    }

    const guideId = getText(formData, "guideId").trim();
    const decision = getText(formData, "decision");
    const rejectionReason = getText(formData, "rejectionReason").trim();
    if (!isUuid(guideId)) return { status: "error", message: "The guide application identifier is invalid." };
    if (decision !== "approved" && decision !== "rejected") {
      return { status: "error", message: "Choose approve or reject." };
    }
    if (decision === "rejected" && rejectionReason.length < 10) {
      return {
        status: "error",
        message: "Give the applicant a clear correction note (at least 10 characters).",
        fieldErrors: { rejectionReason: "Explain what the applicant needs to correct." },
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
    const { data: guide, error: guideError } = await admin
      .from(GUIDE_TABLE)
      .select(`id,${GUIDE_USER_ID_COLUMN}`)
      .eq("id", guideId)
      .eq(GUIDE_STATUS_COLUMN, "pending")
      .maybeSingle();
    if (guideError || !guide) {
      return { status: "error", message: "This guide is no longer pending or could not be found. Refresh the queue." };
    }

    let previousRole: string | null = null;
    let roleChanged = false;
    if (decision === "approved") {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id,role")
        .eq("id", guide[GUIDE_USER_ID_COLUMN])
        .maybeSingle();
      if (profileError || !profile || !["tourist", "guide"].includes(profile.role)) {
        return { status: "error", message: "The guide account role could not be safely updated." };
      }
      previousRole = profile.role;
      if (previousRole === "tourist") {
        const { data: updatedProfile, error: roleError } = await admin
          .from("profiles")
          .update({ role: "guide" })
          .eq("id", guide[GUIDE_USER_ID_COLUMN])
          .eq("role", "tourist")
          .select("id")
          .maybeSingle();
        if (roleError || !updatedProfile) {
          return { status: "error", message: "The applicant’s account role changed. Refresh the queue and try again." };
        }
        roleChanged = true;
      }
    }

    const { data: updatedGuide, error: reviewError } = await admin
      .from(GUIDE_TABLE)
      .update({
        [GUIDE_STATUS_COLUMN]: decision,
        [GUIDE_NOTES_COLUMN]: decision === "rejected" ? rejectionReason : null,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", guideId)
      .eq(GUIDE_STATUS_COLUMN, "pending")
      .select("id")
      .maybeSingle();

    if (reviewError || !updatedGuide) {
      if (roleChanged && previousRole) {
        await admin.from("profiles").update({ role: previousRole }).eq("id", guide[GUIDE_USER_ID_COLUMN]).eq("role", "guide");
      }
      return { status: "error", message: "The guide application changed before this decision was saved. Refresh and try again." };
    }

    revalidatePath("/tours/admin/guides");
    revalidatePath("/tours/guide/register");
    revalidatePath("/tours/guide/pending");
    revalidatePath("/tours/guide/dashboard");
    revalidatePath("/tours/guide/my-qr");

    return {
      status: "success",
      message: decision === "approved" ? "Guide approved. Their dashboard and badge QR are now available." : "Guide application rejected; the guide may resubmit.",
    };
  } catch {
    return { status: "error", message: "The review could not be saved. Refresh the queue and try again." };
  }
}
