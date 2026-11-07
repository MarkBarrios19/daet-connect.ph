import { getAuthenticatedSession, getDisplaySession, roleFromClaims } from "@/lib/tours/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

jest.mock("server-only", () => ({}));
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: <T,>(fn: T) => fn }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const mockCreate = createSupabaseServerClient as jest.Mock;
const USER = { id: "u1" };

function client({
  claims,
  claimsThrows = false,
  rpc = { data: "operator", error: null },
}: {
  claims?: unknown;
  claimsThrows?: boolean;
  rpc?: { data: unknown; error: unknown };
}) {
  const getClaims = claimsThrows
    ? jest.fn().mockRejectedValue(new Error("boom"))
    : jest.fn().mockResolvedValue({ data: claims === undefined ? null : { claims }, error: null });
  const c = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: USER }, error: null }), getClaims },
    rpc: jest.fn().mockResolvedValue(rpc),
  };
  mockCreate.mockResolvedValue(c);
  return c;
}

describe("roleFromClaims", () => {
  it("reads and normalises the claim", () => {
    expect(roleFromClaims({ sub: "u1", app_role: " Admin " }, "u1")).toBe("admin");
  });
  it.each([
    ["no claim", { sub: "u1" }],
    ["unknown role", { sub: "u1", app_role: "superuser" }],
    ["non-string", { sub: "u1", app_role: { role: "admin" } }],
    ["another user's token", { sub: "u2", app_role: "admin" }],
  ])("ignores %s", (_n, claims) => {
    expect(roleFromClaims(claims, "u1")).toBeNull();
  });
  it("ignores non-objects", () => {
    expect(roleFromClaims(null, "u1")).toBeNull();
  });
});

describe("getDisplaySession", () => {
  it("uses the claim and skips get_my_role", async () => {
    const c = client({ claims: { sub: "u1", app_role: "guide" } });
    const s = await getDisplaySession();
    expect(s).toMatchObject({ role: "guide", roleSource: "claim", error: null });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("falls back to get_my_role when the hook is not enabled", async () => {
    const c = client({ claims: { sub: "u1" } });
    const s = await getDisplaySession();
    expect(s).toMatchObject({ role: "operator", roleSource: "rpc" });
    expect(c.rpc).toHaveBeenCalledWith("get_my_role");
  });

  it("falls back when getClaims throws", async () => {
    const c = client({ claimsThrows: true });
    expect((await getDisplaySession()).role).toBe("operator");
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not trust a mismatching claim (unknown value or other user's token)", async () => {
    for (const claims of [{ sub: "u1", app_role: "root" }, { sub: "other", app_role: "admin" }]) {
      const c = client({ claims });
      const s = await getDisplaySession();
      expect(s).toMatchObject({ role: "operator", roleSource: "rpc" });
      expect(c.rpc).toHaveBeenCalled();
    }
  });

  it("reports signed-out without any role lookup", async () => {
    const c = client({});
    c.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getDisplaySession()).toMatchObject({ user: null, role: null, roleSource: "none" });
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe("getAuthenticatedSession stays authoritative", () => {
  it("ignores a stale admin claim and returns the get_my_role answer", async () => {
    const c = client({ claims: { sub: "u1", app_role: "admin" }, rpc: { data: "tourist", error: null } });
    const s = await getAuthenticatedSession();
    expect(s.role).toBe("tourist");
    expect(c.auth.getClaims).not.toHaveBeenCalled();
  });

  it("reports an error rather than guessing when the lookup fails", async () => {
    client({ claims: { sub: "u1", app_role: "admin" }, rpc: { data: null, error: { message: "x" } } });
    expect(await getAuthenticatedSession()).toMatchObject({ role: null, error: expect.any(String) });
  });
});
