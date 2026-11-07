import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updatePaymentSettings } from "./actions";

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));
jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

const mockCreateClient = createSupabaseServerClient as jest.MockedFunction<
  typeof createSupabaseServerClient
>;
const mockRevalidate = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

const USER_ID = "7f1c1988-d352-46bb-9ac8-37a8d0197a11";
const OPERATOR_ID = "a18d3d3a-e1f0-4ec4-9f41-8518746ab123";
const input = {
  operatorId: OPERATOR_ID,
  gcashNumber: "0917 999 0000",
  gcashName: "Maya Santos",
  bankName: "Test Bank",
  bankAccountNumber: "1234567890",
  bankAccountName: "Bagasbas Coast Tours",
  paymentInstructions: "Include the booking reference.",
};

function makeClient({ ownerId = USER_ID, signedIn = true } = {}) {
  const verifyQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: OPERATOR_ID, profile_id: ownerId },
      error: null,
    }),
  };
  const updateQuery: Record<string, unknown> = {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  };
  updateQuery.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ error: null }).then(resolve);

  const from = jest
    .fn()
    .mockReturnValueOnce(verifyQuery)
    .mockReturnValueOnce(updateQuery);
  const client = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: signedIn ? { id: USER_ID } : null },
      }),
    },
    from,
  };
  mockCreateClient.mockResolvedValue(client as never);
  return { verifyQuery, updateQuery, from };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("operator payment settings", () => {
  it("updates only the six permitted payment columns for the owner", async () => {
    const { updateQuery } = makeClient();

    const result = await updatePaymentSettings(input);

    expect(result).toEqual({ success: true });
    expect(updateQuery.update).toHaveBeenCalledWith({
      gcash_number: input.gcashNumber,
      gcash_name: input.gcashName,
      bank_name: input.bankName,
      bank_account_number: input.bankAccountNumber,
      bank_account_name: input.bankAccountName,
      payment_instructions: input.paymentInstructions,
    });
    const payload = (updateQuery.update as jest.Mock).mock.calls[0][0];
    expect(payload).not.toHaveProperty("accreditation_status");
    expect(payload).not.toHaveProperty("accreditation_notes");
    expect(payload).not.toHaveProperty("reviewed_by");
    expect(payload).not.toHaveProperty("reviewed_at");
    expect(mockRevalidate).toHaveBeenCalledWith("/tours/operator/settings");
    expect(mockRevalidate).toHaveBeenCalledWith("/tours/my-bookings");
  });

  it("ignores accreditation and reviewer properties injected into the action input", async () => {
    const { updateQuery } = makeClient();

    const craftedInput = {
      ...input,
      accreditation_status: "approved",
      accreditation_notes: "self-approved",
      reviewed_by: USER_ID,
      reviewed_at: new Date().toISOString(),
    };
    const result = await updatePaymentSettings(craftedInput);

    expect(result).toEqual({ success: true });
    expect(updateQuery.update).toHaveBeenCalledWith({
      gcash_number: input.gcashNumber,
      gcash_name: input.gcashName,
      bank_name: input.bankName,
      bank_account_number: input.bankAccountNumber,
      bank_account_name: input.bankAccountName,
      payment_instructions: input.paymentInstructions,
    });
  });

  it("does not write another user's operator row", async () => {
    const { updateQuery } = makeClient({ ownerId: "someone-else" });

    const result = await updatePaymentSettings(input);

    expect(result).toEqual({ success: false, error: "Not authorized" });
    expect(updateQuery.update).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("does not query or write when signed out", async () => {
    const { from, updateQuery } = makeClient({ signedIn: false });

    const result = await updatePaymentSettings(input);

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(from).not.toHaveBeenCalled();
    expect(updateQuery.update).not.toHaveBeenCalled();
  });
});
