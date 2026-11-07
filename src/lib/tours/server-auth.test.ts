import { getAuthUser, getAuthenticatedSession, getVerifiedSession, getVerifiedUser, userFromClaims } from "@/lib/tours/server-auth";
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
