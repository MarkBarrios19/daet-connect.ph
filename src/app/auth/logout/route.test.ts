import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { POST } from "@/app/auth/logout/route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const mockClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

function request(origin?: string, host = "daet.test") {
  const headers: Record<string, string> = { host, "x-forwarded-proto": "https" };
  if (origin) headers.origin = origin;
  return new NextRequest(new URL("/auth/logout", `https://${host}`), { method: "POST", headers });
}

/** A client whose sign-out calls are recorded, and which writes cleared cookies. */
function clientWith(globalError: { message: string; code?: string } | null = null) {
  const signOut = jest.fn(async (): Promise<{ error: { message: string; code?: string } | null }> => ({ error: null }));
  if (globalError) signOut.mockResolvedValueOnce({ error: globalError }).mockResolvedValue({ error: null });
  const client = { auth: { signOut } };
  mockClient.mockImplementation(async (options) => {
    options?.onCookiesSet?.([
      { name: "sb-project-auth-token", value: "", options: { maxAge: 0, httpOnly: true, path: "/" } },
    ]);
    return client as never;
  });
  return { signOut };
}

describe("signing out", () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env = { ...env };
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
  afterAll(() => {
    process.env = env;
  });

  it("ends every session of the account, not only this browser's copy", async () => {
    const { signOut } = clientWith();

    const response = await POST(request("https://daet.test"));

    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("hands the cleared cookies to the reply", async () => {
    clientWith();

    const response = await POST(request("https://daet.test"));

    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("");
    expect(await response.json()).toEqual({ success: true });
  });

  it("refuses a POST started by another site", async () => {
    clientWith();

    const response = await POST(request("https://evil.example"));

    expect(response.status).toBe(403);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("still works for a client that sends no Origin, which can carry no session", async () => {
    clientWith();
    const response = await POST(request());
    expect(response.status).toBe(200);
  });

  // The regression: a preview deployment is still this site, even with the
  // production address configured. Comparing whole origins signed nobody out.
  it("accepts a preview host while a production NEXT_PUBLIC_APP_URL is configured", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://daet-connect.ph";
    clientWith();

    const response = await POST(request("https://daet-connect-ph-git-main-team.vercel.app", "daet-connect-ph-git-main-team.vercel.app"));

    expect(response.status).toBe(200);
  });

  it("accepts a production host while a local NEXT_PUBLIC_APP_URL is configured", async () => {
    // The value shipped in .env.example; copying it into a deployment is normal.
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    clientWith();

    const response = await POST(request("https://daet-connect.ph", "daet-connect.ph"));

    expect(response.status).toBe(200);
  });

  it("does not care whether the scheme the two sides see is the same", async () => {
    // A LAN address on plain HTTP, behind a proxy that forwards no proto header.
    const built = new NextRequest(new URL("http://192.168.1.20:3000/auth/logout"), {
      method: "POST",
      headers: { host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" },
    });
    clientWith();

    expect((await POST(built)).status).toBe(200);
  });

  it("accepts the host a proxy forwarded, not only the one it rewrote", async () => {
    const built = new NextRequest(new URL("http://internal:3000/auth/logout"), {
      method: "POST",
      headers: {
        host: "internal:3000",
        "x-forwarded-host": "preview.e2b.app",
        "x-forwarded-proto": "https",
        origin: "https://preview.e2b.app",
      },
    });
    clientWith();

    expect((await POST(built)).status).toBe(200);
  });

  it("ends the session in this browser even when the auth service cannot be reached", async () => {
    const { signOut } = clientWith({ message: "fetch failed" });

    const response = await POST(request("https://daet.test"));

    expect(signOut).toHaveBeenNthCalledWith(1, { scope: "global" });
    expect(signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("");
  });

  it("does not report success when it could not even build the client", async () => {
    mockClient.mockRejectedValue(new Error("no supabase configured"));

    const response = await POST(request("https://daet.test"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Sign out failed" });
  });
});
