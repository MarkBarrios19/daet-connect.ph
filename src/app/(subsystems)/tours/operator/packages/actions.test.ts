import { replacePriceVariants } from "@/app/(subsystems)/tours/operator/packages/actions";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/tours/server-auth", () => ({ getVerifiedSession: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const mockGetSession = getVerifiedSession as jest.MockedFunction<typeof getVerifiedSession>;
const mockCreateSessionClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

const packageId = "46f8a59e-3d31-4508-86a8-d2b8919eec31";
const operatorId = "39b3e5fc-29e0-4335-b8aa-56f699b34132";
const profileId = "972f6ec1-a283-4d42-a93c-080d13d56467";
const variantId = "27bd88bd-7a58-4a8b-9561-8fb81f4d7fd7";

describe("package price variant Server Action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockReset();
    mockCreateSessionClient.mockReset();
  });

  it("requires the caller's approved operator row and calls the replacement RPC with validated fields", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: profileId } as never,
      role: "operator",
      error: null,
    });

    const operatorQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: operatorId, accreditation_status: "approved" },
        error: null,
      }),
    };
    const packageQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: packageId, operator_id: operatorId, status: "draft" },
        error: null,
      }),
    };
    const sessionClient = {
      from: jest.fn((table: string) => table === "tours_operators" ? operatorQuery : packageQuery),
      rpc: jest.fn().mockResolvedValue({ error: null }),
    };
    mockCreateSessionClient.mockResolvedValue(sessionClient as never);

    const result = await replacePriceVariants(packageId, [{
      id: variantId,
      variantName: "Standard",
      minPax: 1,
      maxPax: null,
      pricePerPax: 125,
      flatPrice: 400,
      isDefault: true,
      // Extra client fields must not be forwarded to the RPC.
      package_id: "foreign-package",
      stop_order: 99,
    } as never]);

    expect(result).toEqual({ success: true });
    expect(operatorQuery.eq).toHaveBeenCalledWith("profile_id", profileId);
    expect(packageQuery.eq).toHaveBeenCalledWith("id", packageId);
    expect(packageQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(sessionClient.rpc).toHaveBeenCalledWith("replace_package_price_variants", {
      p_package_id: packageId,
      p_variants: [{
        id: variantId,
        variantName: "Standard",
        minPax: 1,
        maxPax: null,
        pricePerPax: 125,
        flatPrice: 400,
        isDefault: true,
      }],
    });
  });
});
