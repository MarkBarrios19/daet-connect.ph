import {
  getGuideSensitiveDocumentLink,
  reviewGuideApplication,
  submitGuideRegistration,
} from "@/app/(subsystems)/tours/guide/actions";
import {
  INITIAL_GUIDE_DOCUMENT_LINK_STATE,
  INITIAL_GUIDE_REVIEW_STATE,
  INITIAL_GUIDE_SUBMISSION_STATE,
} from "@/lib/tours/guide-action-state";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { auditGuideSensitiveAccess } from "@/lib/tours/guide-audit";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/tours/server-auth", () => ({ getVerifiedSession: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/tours/guide-audit", () => ({ auditGuideSensitiveAccess: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const mockGetSession = getVerifiedSession as jest.MockedFunction<typeof getVerifiedSession>;
const mockCreateAdmin = createSupabaseAdminClient as jest.MockedFunction<typeof createSupabaseAdminClient>;
const mockCreateSessionClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;
const mockAudit = auditGuideSensitiveAccess as jest.MockedFunction<typeof auditGuideSensitiveAccess>;

const guideId = "7f1c1988-d352-46bb-9ac8-37a8d0197a11";
const applicantId = "a18d3d3a-e1f0-4ec4-9f41-8518746ab123";
const adminId = "c47d4b89-1b71-44be-a55d-a024e153bc15";

function makeFormData(entries: Record<string, string> = {}): FormData {
  const data = new FormData();
  Object.entries(entries).forEach(([key, value]) => data.set(key, value));
  return data;
}

function makeGuideApplicationFormData() {
  const data = makeFormData({
    fullName: "Maya Santos",
    contactPhone: "+63 917 123 4567",
    bio: "I have guided visitors around Daet for several years.",
    idType: "philippine_national_id",
    idNumber: "1234-5678-9012",
    consentFullIdDisplay: "true",
    consentGivenAt: "1900-01-01T00:00:00.000Z",
    guideId,
  });
  const pdf = new File([new TextEncoder().encode("%PDF-1.7 private identity document")], "identity.pdf", { type: "application/pdf" });
  data.set("idDocument", pdf, pdf.name);
  return data;
}

describe("guide registration Server Action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAdmin.mockReset();
    mockCreateSessionClient.mockReset();
    mockGetSession.mockReset();
  });

  it("rejects unchecked consent before auth, upload, or database clients are used", async () => {
    const result = await submitGuideRegistration(
      INITIAL_GUIDE_SUBMISSION_STATE,
      makeFormData({ fullName: "Ignored", consentFullIdDisplay: "false" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.consentFullIdDisplay).toMatch(/consent/i);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockCreateSessionClient).not.toHaveBeenCalled();
    expect(mockCreateAdmin).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("inserts the public profile through the session client and writes consented identity data server-side", async () => {
    mockGetSession.mockResolvedValue({ user: { id: applicantId } as never, role: "tourist", error: null });

    const publicQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    const profileUpdateQuery = {
      eq: jest.fn().mockResolvedValue({ error: null }),
    };
    const profileQuery = {
      update: jest.fn().mockReturnValue(profileUpdateQuery),
    };
    const sessionClient = {
      from: jest.fn((table: string) => table === "profiles" ? profileQuery : publicQuery),
    };
    mockCreateSessionClient.mockResolvedValue(sessionClient as never);

    const sensitiveQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const storageBucket = {
      upload: jest.fn().mockResolvedValue({ error: null }),
      remove: jest.fn().mockResolvedValue({ error: null }),
    };
    const admin = {
      from: jest.fn(() => sensitiveQuery),
      storage: { from: jest.fn(() => storageBucket) },
    };
    mockCreateAdmin.mockReturnValue(admin as never);

    const result = await submitGuideRegistration(INITIAL_GUIDE_SUBMISSION_STATE, makeGuideApplicationFormData());

    expect(result.status).toBe("success");
    expect(publicQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: guideId,
      profile_id: applicantId,
      contact_phone: "+63 917 123 4567",
      bio: "I have guided visitors around Daet for several years.",
      consent_full_id_display: true,
      consent_given_at: expect.any(String),
      accreditation_status: "pending",
      accreditation_notes: null,
    }));
    expect(profileQuery.update).toHaveBeenCalledWith({ full_name: "Maya Santos" });
    expect(admin.from).toHaveBeenCalledWith("tours_guide_sensitive_info");
    expect(sensitiveQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      guide_id: guideId,
      full_legal_name: "Maya Santos",
      id_type: "philippine_national_id",
      id_number: "1234-5678-9012",
      id_document_path: expect.stringContaining(`${applicantId}/${guideId}/`),
    }), { onConflict: "guide_id" });

    const publicValues = publicQuery.insert.mock.calls[0][0];
    expect(publicValues).not.toHaveProperty("full_name");
    expect(Date.parse(publicValues.consent_given_at)).not.toBeNaN();
    expect(publicValues.consent_given_at).not.toBe("1900-01-01T00:00:00.000Z");
    const sensitiveValues = sensitiveQuery.upsert.mock.calls[0][0];
    expect(sensitiveValues).not.toHaveProperty("consent_full_id_display");
    expect(sensitiveValues).not.toHaveProperty("consent_given_at");

    const publicInsert = publicQuery.insert.mock.invocationCallOrder[0];
    const profileNameSync = profileQuery.update.mock.invocationCallOrder[0];
    const sensitiveWrite = sensitiveQuery.upsert.mock.invocationCallOrder[0];
    expect(publicInsert).toBeLessThan(profileNameSync);
    expect(profileNameSync).toBeLessThan(sensitiveWrite);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: applicantId,
      guideId,
      operation: "write_sensitive_info",
      outcome: "success",
    }));
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain("1234-5678-9012");
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain("identity.pdf");
  });
});

describe("guide application review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAdmin.mockReset();
    mockGetSession.mockReset();
  });

  it("stores an admin rejection note in accreditation_notes", async () => {
    mockGetSession.mockResolvedValue({ user: { id: adminId } as never, role: "admin", error: null });

    const guideLookupQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: guideId, profile_id: applicantId }, error: null }),
    };
    const guideUpdateQuery = {
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: guideId }, error: null }),
    };
    const guideTable = {
      select: jest.fn(() => guideLookupQuery),
      update: jest.fn((_values: Record<string, unknown>) => guideUpdateQuery),
    };
    const admin = { from: jest.fn(() => guideTable) };
    mockCreateAdmin.mockReturnValue(admin as never);

    const accreditationNotes = "Please upload a clearer image of your government-issued ID.";
    const result = await reviewGuideApplication(
      INITIAL_GUIDE_REVIEW_STATE,
      makeFormData({ guideId, decision: "rejected", rejectionReason: accreditationNotes }),
    );

    expect(result.status).toBe("success");
    expect(guideTable.update).toHaveBeenCalledWith(expect.objectContaining({
      accreditation_status: "rejected",
      accreditation_notes: accreditationNotes,
      reviewed_by: adminId,
      reviewed_at: expect.any(String),
    }));
    expect(guideTable.update.mock.calls[0][0]).not.toHaveProperty("rejection_reason");
  });
});

describe("guide private document access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAdmin.mockReset();
    mockGetSession.mockReset();
  });

  it("denies non-admin callers before creating the service-role client", async () => {
    mockGetSession.mockResolvedValue({ user: { id: applicantId } as never, role: "tourist", error: null });
    const result = await getGuideSensitiveDocumentLink(
      INITIAL_GUIDE_DOCUMENT_LINK_STATE,
      makeFormData({ guideId }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/only an admin/i);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("returns a three-minute signed link from an admin-only Server Action and audits the sensitive read", async () => {
    mockGetSession.mockResolvedValue({ user: { id: adminId } as never, role: "admin", error: null });
    const publicGuideQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: guideId, accreditation_status: "pending" }, error: null }),
    };
    const sensitiveQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id_document_path: "private/guide/identity.pdf" }, error: null }),
    };
    const storageBucket = {
      createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: "https://storage.example/signed?token=temporary" }, error: null }),
    };
    const admin = {
      from: jest.fn((table: string) => table === "tours_guides" ? publicGuideQuery : sensitiveQuery),
      storage: { from: jest.fn(() => storageBucket) },
    };
    mockCreateAdmin.mockReturnValue(admin as never);

    const result = await getGuideSensitiveDocumentLink(INITIAL_GUIDE_DOCUMENT_LINK_STATE, makeFormData({ guideId }));

    expect(result.status).toBe("success");
    expect(result.signedUrl).toBe("https://storage.example/signed?token=temporary");
    expect(JSON.stringify(result)).not.toContain("private/guide/identity.pdf");
    expect(sensitiveQuery.select).toHaveBeenCalledWith("id_document_path");
    expect(storageBucket.createSignedUrl).toHaveBeenCalledWith(
      "private/guide/identity.pdf",
      180,
      { download: true },
    );
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: adminId,
      guideId,
      operation: "read_document_path_for_review",
      outcome: "success",
    }));
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: adminId,
      guideId,
      operation: "create_private_document_link",
      outcome: "success",
    }));
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain("private/guide/identity.pdf");
  });
});
