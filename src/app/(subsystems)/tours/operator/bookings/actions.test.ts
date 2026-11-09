import { assignGuideToBooking, setGuideNotNeeded } from "@/app/(subsystems)/tours/operator/bookings/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/email/notify-booking", () => ({
  emailBookingConfirmed: jest.fn(),
  emailGuideAssigned: jest.fn(),
  emailTripCalledOff: jest.fn(),
}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const mockClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;
const mockRevalidate = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

const BOOKING_ID = "4d2f0c2e-9d43-4f2a-9c9e-2a1b3c4d5e6f";
const GUIDE_ID = "f66b1fe2-a997-4c0b-be13-22d62cf0dba6";

type Patch = { table: string; values: Record<string, unknown> };

/**
 * A Supabase client that answers like PostgREST for the four reads these
 * actions make (user, operator row, booking, guide) and records every update.
 */
function fakeClient(options: {
  user?: { id: string } | null;
  operator?: { id: string } | null;
  booking?: Record<string, unknown> | null;
  guide?: Record<string, unknown> | null;
  /** One error per update, in order; the last one repeats. null = the write worked. */
  updateError?: { code: string; message: string } | null | Array<{ code: string; message: string } | null>;
}) {
  const patches: Patch[] = [];
  const rows = {
    tours_operators: options.operator === undefined ? { id: "op-1" } : options.operator,
    tours_bookings:
      options.booking === undefined
        ? {
            id: BOOKING_ID,
            status: "confirmed",
            tour_date: "2026-12-05",
            assigned_guide_id: GUIDE_ID,
            tours_packages: { operator_id: "op-1" },
          }
        : options.booking,
    tours_guides:
      options.guide === undefined ? { id: GUIDE_ID, accreditation_status: "approved" } : options.guide,
  };

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: "profile-1" } : options.user },
        error: null,
      }),
    },
    from(table: keyof typeof rows | string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: rows[table as keyof typeof rows] ?? null, error: null }),
        update: (values: Record<string, unknown>) => {
          patches.push({ table, values });
          const queued = options.updateError;
          const error = Array.isArray(queued)
            ? (queued.length > 1 ? queued.shift() : (queued[0] ?? null))
            : (queued ?? null);
          return { eq: async () => ({ error }) };
        },
      };
      return query;
    },
  };

  mockClient.mockResolvedValue(client as never);
  return patches;
}

describe("setGuideNotNeeded", () => {
  it("needs a signed-in operator", async () => {
    const patches = fakeClient({ user: null });

    const result = await setGuideNotNeeded(BOOKING_ID, true);

    expect(result).toEqual({ success: false, error: "Authentication required" });
    expect(patches).toHaveLength(0);
  });

  it("records the guest's request and takes the assigned guide off", async () => {
    const patches = fakeClient({});

    const result = await setGuideNotNeeded(BOOKING_ID, true, "  Guest asked\n in chat  ");

    expect(result).toEqual({ success: true });
    expect(patches).toHaveLength(1);
    expect(patches[0].table).toBe("tours_bookings");
    expect(patches[0].values).toMatchObject({
      assigned_guide_id: null,
      guide_not_needed_note: "Guest asked in chat",
    });
    expect(typeof patches[0].values.guide_not_needed_at).toBe("string");
    // The tourist's own page reads the same rows.
    expect(mockRevalidate).toHaveBeenCalledWith(`/tours/bookings/${BOOKING_ID}`);
  });

  it("leaves the note empty when the operator types nothing", async () => {
    const patches = fakeClient({});

    await setGuideNotNeeded(BOOKING_ID, true);

    expect(patches[0].values.guide_not_needed_note).toBeNull();
  });

  it("puts a booking back in the needs-a-guide queue", async () => {
    const booking = {
      id: BOOKING_ID,
      status: "confirmed",
      tour_date: "2026-12-05",
      assigned_guide_id: null,
      tours_packages: { operator_id: "op-1" },
    };
    const patches = fakeClient({ booking });

    const result = await setGuideNotNeeded(BOOKING_ID, false);

    expect(result).toEqual({ success: true });
    expect(patches[0].values).toEqual({ guide_not_needed_at: null, guide_not_needed_note: null });
  });

  it("refuses a closed booking", async () => {
    const booking = {
      id: BOOKING_ID,
      status: "cancelled",
      tour_date: "2026-12-05",
      assigned_guide_id: GUIDE_ID,
      tours_packages: { operator_id: "op-1" },
    };
    const patches = fakeClient({ booking });

    const result = await setGuideNotNeeded(BOOKING_ID, true);

    expect(result.success).toBe(false);
    expect(patches).toHaveLength(0);
  });

  it("refuses another operator's booking", async () => {
    const booking = {
      id: BOOKING_ID,
      status: "confirmed",
      tour_date: "2026-12-05",
      assigned_guide_id: null,
      tours_packages: { operator_id: "someone-else" },
    };
    const patches = fakeClient({ booking });

    const result = await setGuideNotNeeded(BOOKING_ID, true);

    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(patches).toHaveLength(0);
  });

  it("rejects an over-long note before the round trip", async () => {
    const patches = fakeClient({});

    const result = await setGuideNotNeeded(BOOKING_ID, true, "a".repeat(301));

    expect(result.success).toBe(false);
    expect(mockClient).not.toHaveBeenCalled();
    expect(patches).toHaveLength(0);
  });

  it("says the database update is pending while the columns are missing", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const patches = fakeClient({
      updateError: [
        { code: "PGRST204", message: "Could not find the 'guide_not_needed_at' column of 'tours_bookings' in the schema cache" },
      ],
    });

    const result = await setGuideNotNeeded(BOOKING_ID, true);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/database update is still pending/i);
    expect(patches).toHaveLength(1);
    logged.mockRestore();
  });

  it("rejects a booking id that is not a uuid", async () => {
    const result = await setGuideNotNeeded("not-a-uuid", true);

    expect(result).toEqual({ success: false, error: "Booking not found" });
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("assignGuideToBooking", () => {
  it("names a guide and clears a stale no-guide request", async () => {
    const patches = fakeClient({});

    const result = await assignGuideToBooking(BOOKING_ID, GUIDE_ID);

    expect(result).toEqual({ success: true });
    expect(patches[0].values).toEqual({
      assigned_guide_id: GUIDE_ID,
      guide_not_needed_at: null,
      guide_not_needed_note: null,
    });
  });

  it("unassigns without recording a request", async () => {
    const patches = fakeClient({});

    const result = await assignGuideToBooking(BOOKING_ID, null);

    expect(result).toEqual({ success: true });
    // Unassigning is not the guest's decision: the flag is left alone.
    expect(patches[0].values).toEqual({ assigned_guide_id: null });
  });

  it("names the guide anyway on a database without the no-guide columns", async () => {
    // The migration is applied by hand: code can be live before the column is.
    const patches = fakeClient({
      updateError: [
        { code: "PGRST204", message: "Could not find the 'guide_not_needed_at' column of 'tours_bookings' in the schema cache" },
        null,
      ],
    });

    const result = await assignGuideToBooking(BOOKING_ID, GUIDE_ID);

    expect(result).toEqual({ success: true });
    expect(patches).toHaveLength(2);
    expect(patches[1].values).toEqual({ assigned_guide_id: GUIDE_ID });
  });

  it("refuses a guide who is not approved", async () => {
    const patches = fakeClient({ guide: { id: GUIDE_ID, accreditation_status: "pending" } });

    const result = await assignGuideToBooking(BOOKING_ID, GUIDE_ID);

    expect(result).toEqual({ success: false, error: "Guide is not approved" });
    expect(patches).toHaveLength(0);
  });
});
