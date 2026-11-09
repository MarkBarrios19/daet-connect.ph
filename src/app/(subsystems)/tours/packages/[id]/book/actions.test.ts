import { createBooking } from "@/app/(subsystems)/tours/packages/[id]/book/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import type { CreateBookingInput } from "@/lib/tours/booking-contract";

jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/tours/server-auth", () => ({ getVerifiedSession: jest.fn() }));
jest.mock("@/lib/email/notify-booking", () => ({ emailBookingReceived: jest.fn() }));

const mockSession = getVerifiedSession as jest.MockedFunction<typeof getVerifiedSession>;
const mockCreateClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;
const invalidInput = {} as CreateBookingInput;

describe("createBooking role authorization", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(["admin", "guide", "operator", null])("refuses the %s role before accessing booking data", async (role) => {
    mockSession.mockResolvedValue({ user: { id: "staff-user" } as never, role, error: null });

    await expect(createBooking(invalidInput)).resolves.toEqual({
      success: false,
      error: "Only tourist accounts can create bookings.",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("fails closed when the role lookup fails", async () => {
    mockSession.mockResolvedValue({
      user: { id: "user-1" } as never,
      role: null,
      error: "Your account role could not be verified. Please try again later.",
    });

    await expect(createBooking(invalidInput)).resolves.toMatchObject({
      success: false,
      error: "Your account role could not be verified. Please try again later.",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("requires a verified signed-in user", async () => {
    mockSession.mockResolvedValue({ user: null, role: null, error: null });

    await expect(createBooking(invalidInput)).resolves.toEqual({
      success: false,
      error: "You must be logged in to book.",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
