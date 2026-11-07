import { getAuthUser, getAuthenticatedSession, getDisplaySession, getVerifiedSession, getVerifiedUser, roleFromClaims, userFromClaims } from "@/lib/tours/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

jest.mock("server-only", () => ({}));
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: <T,>(fn: T) => fn }));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const mockClient = createSupabaseServerClient as unknown as jest.Mock;

const claims = {
  sub: "user-1",
  aud: "authenticated",
  role: "authenticated",
  email: "juan@example.ph",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Juan Dela Cruz" },
  exp: 4102444800,
  iat: 0,
  iss: "x",
  session_id: "s",
  aal: "aal1",
};

describe("server auth", () => {
  const getClaims = jest.fn();
  const getUser = jest.fn();
  const rpc = jest.fn();

  beforeEach(() => {
    mockClient.mockResolvedValue({ auth: { getClaims, getUser }, rpc });
    getClaims.mockResolvedValue({ data: { claims, header: {}, signature: new Uint8Array() }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "juan@example.ph", identities: [] } }, error: null });
    rpc.mockResolvedValue({ data: "tourist", error: null });
  });

  it("reads the user from verified claims without asking Supabase Auth", async () => {
    await expect(getAuthUser()).resolves.toEqual({
      id: "user-1",
      aud: "authenticated",
      role: "authenticated",
      email: "juan@example.ph",
      phone: undefined,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: "Juan Dela Cruz" },
      is_anonymous: undefined,
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("is signed out when the claims are missing or fail verification", async () => {
    getClaims.mockResolvedValueOnce({ data: null, error: null });
    await expect(getAuthUser()).resolves.toBeNull();
    getClaims.mockResolvedValueOnce({ data: null, error: new Error("Invalid JWT signature") });
    await expect(getAuthUser()).resolves.toBeNull();
  });

  it("defaults metadata and takes the first audience", () => {
    expect(userFromClaims({ ...claims, aud: ["authenticated", "x"], app_metadata: undefined, user_metadata: undefined, email: "" })).toMatchObject({
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      email: undefined,
    });
  });

  it("builds the page session from claims plus the server-side role", async () => {
    await expect(getAuthenticatedSession()).resolves.toMatchObject({ user: { id: "user-1" }, role: "tourist", error: null });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("confirms the user with Supabase Auth for writes", async () => {
    await expect(getVerifiedUser()).resolves.toMatchObject({ id: "user-1" });
    await expect(getVerifiedSession()).resolves.toMatchObject({ user: { id: "user-1" }, role: "tourist" });
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("does not honour a token Supabase Auth rejects, even if it still verifies locally", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("session_not_found") });
    await expect(getVerifiedSession()).resolves.toEqual({ user: null, role: null, error: null });
    await expect(getAuthUser()).resolves.not.toBeNull();
  });

  it("reports a role lookup failure without dropping the user", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(getAuthenticatedSession()).resolves.toMatchObject({ user: { id: "user-1" }, role: null, error: expect.any(String) });
  });
});

// --- The role claim (display only) -------------------------------------------

function claimsClient({ claims, claimsThrows = false, rpc = { data: "operator", error: null } }: { claims?: unknown; claimsThrows?: boolean; rpc?: { data: unknown; error: unknown } }) {
  const getClaims = claimsThrows
    ? jest.fn().mockRejectedValue(new Error("boom"))
    : jest.fn().mockResolvedValue({ data: claims === undefined ? null : { claims }, error: null });
  const c = { auth: { getUser: jest.fn(), getClaims }, rpc: jest.fn().mockResolvedValue(rpc) };
  mockClient.mockResolvedValue(c);
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
  ])("ignores %s", (_n, c) => {
    expect(roleFromClaims(c, "u1")).toBeNull();
  });
  it("ignores non-objects", () => {
    expect(roleFromClaims(null, "u1")).toBeNull();
  });
});

describe("getDisplaySession", () => {
  it("uses the claim and skips get_my_role", async () => {
    const c = claimsClient({ claims: { ...claims, sub: "u1", app_role: "guide" } });
    expect(await getDisplaySession()).toMatchObject({ role: "guide", roleSource: "claim", error: null, user: { id: "u1" } });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("falls back to get_my_role when the hook is not enabled", async () => {
    const c = claimsClient({ claims: { ...claims, sub: "u1" } });
    expect(await getDisplaySession()).toMatchObject({ role: "operator", roleSource: "rpc" });
    expect(c.rpc).toHaveBeenCalledWith("get_my_role");
  });

  it("does not trust an unknown role value", async () => {
    const c = claimsClient({ claims: { ...claims, sub: "u1", app_role: "root" } });
    expect(await getDisplaySession()).toMatchObject({ role: "operator", roleSource: "rpc" });
    expect(c.rpc).toHaveBeenCalled();
  });

  it("is signed out, with no role lookup, when the claims cannot be read", async () => {
    const c = claimsClient({ claimsThrows: true });
    expect(await getDisplaySession()).toMatchObject({ user: null, role: null, roleSource: "none" });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("reports signed-out without any role lookup", async () => {
    const c = claimsClient({});
    expect(await getDisplaySession()).toMatchObject({ user: null, role: null, roleSource: "none" });
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe("getAuthenticatedSession stays authoritative about the role", () => {
  it("ignores a stale admin claim and returns the get_my_role answer", async () => {
    claimsClient({ claims: { ...claims, sub: "u1", app_role: "admin" }, rpc: { data: "tourist", error: null } });
    expect((await getAuthenticatedSession()).role).toBe("tourist");
  });
});
