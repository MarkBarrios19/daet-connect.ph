import { syncRoleClaim } from "@/app/role-sync/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/tours/server-auth", () => ({ getAuthenticatedSession: jest.fn() }));

const session = getAuthenticatedSession as jest.Mock;
const refreshSession = jest.fn();

beforeEach(() => {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({ auth: { refreshSession } });
  refreshSession.mockResolvedValue({ error: null });
});

it("refreshes when the real role differs from the one shown", async () => {
  session.mockResolvedValue({ user: { id: "u" }, role: "operator", error: null });
  expect(await syncRoleClaim("tourist")).toEqual({ refreshed: true });
  expect(refreshSession).toHaveBeenCalledTimes(1);
});

it("does nothing when they match", async () => {
  session.mockResolvedValue({ user: { id: "u" }, role: "guide", error: null });
  expect(await syncRoleClaim("guide")).toEqual({ refreshed: false });
  expect(refreshSession).not.toHaveBeenCalled();
});

it("does nothing when signed out or the role cannot be verified", async () => {
  session.mockResolvedValue({ user: null, role: null, error: null });
  expect(await syncRoleClaim("guide")).toEqual({ refreshed: false });
  session.mockResolvedValue({ user: { id: "u" }, role: null, error: "x" });
  expect(await syncRoleClaim("guide")).toEqual({ refreshed: false });
  expect(refreshSession).not.toHaveBeenCalled();
});
