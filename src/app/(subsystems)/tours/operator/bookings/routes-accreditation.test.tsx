import OperatorBookingsPage from "@/app/(subsystems)/tours/(signed-in)/operator/bookings/page";
import OperatorLivePage from "../live/page";
import OperatorLiveTourPage from "../live/[bookingId]/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadLiveTour } from "@/app/(subsystems)/tours/live/load-live-tour";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/tours/server-auth", () => ({ getAuthUser: jest.fn(async () => ({ id: "user-1" })) }));
jest.mock("@/app/(subsystems)/tours/live/load-live-tour", () => ({ loadLiveTour: jest.fn() }));
jest.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); }, redirect: () => { throw new Error("redirect"); } }));

const id = "46f8a59e-3d31-4508-86a8-d2b8919eec31";
function setup(status: string) {
  const query: any = {};
  for (const key of ["select", "eq", "gte", "lte", "order"]) query[key] = jest.fn().mockReturnValue(query);
  query.maybeSingle = jest.fn(async () => ({ data: { id: "op", accreditation_status: status } }));
  query.then = (resolve: (value: unknown) => void) => resolve({ data: [] });
  const from = jest.fn((_table: string) => query);
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({ from });
  return from;
}

describe("operator booking and live pages", () => {
  it.each(["pending", "rejected"])("%s stops before reading bookings or loading a live tour", async (status) => {
    const from = setup(status);
    // Evaluate the async Suspense child, not just the static page shell.
    const page: any = OperatorBookingsPage({ searchParams: Promise.resolve({}) });
    const content = page.props.children.props.children[1].props.children;
    await content.type(content.props);
    await OperatorLivePage();
    await expect(OperatorLiveTourPage({ params: Promise.resolve({ bookingId: id }) })).rejects.toThrow("not found");
    expect(from.mock.calls.every(([table]) => table === "tours_operators")).toBe(true);
    expect(loadLiveTour).not.toHaveBeenCalled();
  });

  it("loads the tour for an approved owner but rejects another operator's tour", async () => {
    setup("approved");
    (loadLiveTour as jest.Mock).mockResolvedValueOnce({ isOperator: false });
    await expect(OperatorLiveTourPage({ params: Promise.resolve({ bookingId: id }) })).rejects.toThrow("not found");
    (loadLiveTour as jest.Mock).mockResolvedValueOnce({ isOperator: true, hasGuide: true });
    await expect(OperatorLiveTourPage({ params: Promise.resolve({ bookingId: id }) })).resolves.toBeTruthy();
  });
});
