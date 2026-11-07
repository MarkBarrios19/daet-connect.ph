import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { proxy } from "@/proxy";

jest.mock("@supabase/ssr", () => ({ createServerClient: jest.fn() }));

const mockCreateClient = createServerClient as unknown as jest.Mock;

function request(path: string, method = "GET", cookie = "sb-project-auth-token=base64-session") {
  return new NextRequest(new URL(path, "https://daet.test"), {
    method,
    headers: { host: "daet.test", "x-forwarded-proto": "https", cookie },
  });
}

describe("the session refresher", () => {
  const env = process.env;
  let getUser: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
    getUser = jest.fn(async () => ({ data: { user: null }, error: null }));
    mockCreateClient.mockReturnValue({ auth: { getUser } });
  });
  afterAll(() => {
    process.env = env;
  });

  it("refreshes an ordinary page", async () => {
    await proxy(request("/tours/me"));
    expect(getUser).toHaveBeenCalled();
  });

  it("leaves the auth routes alone, so they can end or replace the session themselves", async () => {
    for (const path of ["/auth/logout", "/auth/callback", "/auth/oauth"]) {
      await proxy(request(path, path === "/auth/logout" ? "POST" : "GET"));
    }
    // A refresh in front of POST /auth/logout re-wrote the very cookie the route
    // was deleting, and the browser kept a session the visitor had ended.
    expect(getUser).not.toHaveBeenCalled();
  });

  it("takes a sign-in code that landed on the root to the route that exchanges it", async () => {
    // Supabase falls back to the project's Site URL when it will not accept the
    // address it was given, which drops `?code=` on the home page. When this
    // browser holds the verifier, the code is still good — finish the sign-in.
    const response = await proxy(
      request("/?code=8f14e45f-ceea-467f-a1ce-45d1b6a2e1f0", "GET", "sb-project-auth-token-code-verifier=verifier"),
    );

    expect(response?.headers.get("location")).toBe(
      "https://daet.test/auth/callback?code=8f14e45f-ceea-467f-a1ce-45d1b6a2e1f0",
    );
    // Nothing to refresh on the way: the callback ends or replaces the session.
    expect(getUser).not.toHaveBeenCalled();
  });

  it("leaves a code on the root alone when this browser did not start the sign-in", async () => {
    const response = await proxy(request("/?code=8f14e45f-ceea-467f-a1ce-45d1b6a2e1f0"));

    expect(response?.headers.get("location")).toBeNull();
    expect(getUser).toHaveBeenCalled();
  });

  it("does nothing at all when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    await proxy(request("/tours/me"));

    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session from a signed-in page to sign-in with a 307", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: Object.assign(new Error("Auth session missing!"), { name: "AuthSessionMissingError", status: 400 }) });

    for (const path of ["/tours/my-bookings", "/tours/messages", "/tours/me", "/tours/operator/bookings", "/tours/operator/packages", "/tours/operator/payments"]) {
      const response = await proxy(request(path));
      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toBe(`https://daet.test/login?next=${encodeURIComponent(path)}`);
    }
  });

  it("lets a signed-in person through, and pages that work signed out", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    expect((await proxy(request("/tours/my-bookings")))?.headers.get("location")).toBeNull();

    getUser.mockResolvedValue({ data: { user: null }, error: Object.assign(new Error("none"), { name: "AuthSessionMissingError", status: 400 }) });
    for (const path of ["/tours/plan", "/tours/browse", "/tours/operator/payments/export", "/tours/messages/abc"]) {
      expect((await proxy(request(path)))?.headers.get("location")).toBeNull();
    }
  });

  it("does not call a failed lookup 'signed out' when Auth could not be reached", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError", status: 0 }) });
    expect((await proxy(request("/tours/my-bookings")))?.headers.get("location")).toBeNull();
  });

  it("reports only a duration in Server-Timing, and only when asked", async () => {
    expect((await proxy(request("/tours/browse")))?.headers.get("server-timing")).toBeNull();
    process.env.SERVER_TIMING = "1";
    expect((await proxy(request("/tours/browse")))?.headers.get("server-timing")).toMatch(/^proxy-auth;dur=\d+(\.\d)?$/);
  });
});
