import {
  reviewOperatorApplication,
  submitOperatorRegistration,
} from "@/app/(subsystems)/tours/operator/actions";
import { INITIAL_OPERATOR_REVIEW_STATE, INITIAL_OPERATOR_SUBMISSION_STATE } from "@/lib/tours/operator-action-state";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

jest.mock("@/lib/tours/server-auth", () => ({
  getVerifiedSession: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

const mockGetSession = getVerifiedSession as jest.MockedFunction<typeof getVerifiedSession>;
const mockCreateAdmin = createSupabaseAdminClient as jest.MockedFunction<typeof createSupabaseAdminClient>;

function makeFormData(entries: Record<string, string> = {}): FormData {
  const data = new FormData();
  Object.entries(entries).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("operator Server Action authorization", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateAdmin.mockReset();
  });

  it("does not construct the service-role client for an unauthenticated registration", async () => {
    mockGetSession.mockResolvedValue({ user: null, role: null, error: null });

    const result = await submitOperatorRegistration(
      INITIAL_OPERATOR_SUBMISSION_STATE,
      makeFormData(),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/sign in/i);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it("stores a valid applicant's files and creates a pending application", async () => {
    const applicantId = "7f1c1988-d352-46bb-9ac8-37a8d0197a11";
    mockGetSession.mockResolvedValue({
      user: { id: applicantId } as never,
      role: "tourist",
      error: null,
    });

    const operatorQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { id: "saved-operator-id" }, error: null }),
      insert: jest.fn().mockReturnThis(),
    };
    const storageBucket = {
      upload: jest.fn().mockResolvedValue({ error: null }),
      remove: jest.fn().mockResolvedValue({ error: null }),
    };
    const admin = {
      from: jest.fn(() => operatorQuery),
      storage: { from: jest.fn(() => storageBucket) },
    };
    mockCreateAdmin.mockReturnValue(admin as never);

    const formData = makeFormData({
      businessName: "Bagasbas Coast Tours",
      contactPerson: "Maya Santos",
      contactEmail: "maya@example.ph",
      contactPhone: "09171234567",
      businessAddress: "Brgy. Bagasbas, Daet, Camarines Norte",
    });
    const pdf = new File([new TextEncoder().encode("%PDF-1.4 document")], "registration.pdf", { type: "application/pdf" });
    const qrPng = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "gcash.png", { type: "image/png" });
    formData.set("dtiDocument", pdf, pdf.name);
    formData.set("businessPermit", pdf, "permit.pdf");
    formData.set("gcashQr", qrPng, qrPng.name);

    const result = await submitOperatorRegistration(INITIAL_OPERATOR_SUBMISSION_STATE, formData);

    expect(result.status).toBe("success");
    expect(storageBucket.upload).toHaveBeenCalledTimes(3);
    expect(operatorQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      profile_id: applicantId,
      accreditation_status: "pending",
      accreditation_notes: null,
      business_name: "Bagasbas Coast Tours",
    }));
    // tours_operators has no rejection_reason column; sending it makes the insert fail.
    expect(operatorQuery.insert.mock.calls[0][0]).not.toHaveProperty("rejection_reason");
  });

  it("prevents a non-admin from reviewing an application before service-role access", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "tourist-user" } as never,
      role: "tourist",
      error: null,
    });

    const result = await reviewOperatorApplication(
      INITIAL_OPERATOR_REVIEW_STATE,
      makeFormData({
        operatorId: "a18d3d3a-e1f0-4ec4-9f41-8518746ab123",
        decision: "approved",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/only an admin/i);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it("promotes the profile and approves the pending application for an admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "admin-user" } as never,
      role: "admin",
      error: null,
    });

    const operatorQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn()
        .mockResolvedValueOnce({ data: { id: "a18d3d3a-e1f0-4ec4-9f41-8518746ab123", profile_id: "7f1c1988-d352-46bb-9ac8-37a8d0197a11" }, error: null })
        .mockResolvedValueOnce({ data: { id: "a18d3d3a-e1f0-4ec4-9f41-8518746ab123" }, error: null }),
    };
    const profileQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn()
        .mockResolvedValueOnce({ data: { id: "7f1c1988-d352-46bb-9ac8-37a8d0197a11", role: "tourist" }, error: null })
        .mockResolvedValueOnce({ data: { id: "7f1c1988-d352-46bb-9ac8-37a8d0197a11" }, error: null }),
    };
    const admin = {
      from: jest.fn((table: string) => table === "profiles" ? profileQuery : operatorQuery),
    };
    mockCreateAdmin.mockReturnValue(admin as never);

    const result = await reviewOperatorApplication(
      INITIAL_OPERATOR_REVIEW_STATE,
      makeFormData({
        operatorId: "a18d3d3a-e1f0-4ec4-9f41-8518746ab123",
        decision: "approved",
      }),
    );

    expect(result.status).toBe("success");
    expect(profileQuery.update).toHaveBeenCalledWith({ role: "operator" });
    expect(operatorQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      accreditation_status: "approved",
      reviewed_by: "admin-user",
    }));
  });
});
