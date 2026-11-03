import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearAttempts } from "@/lib/auth/rate-limit";
import { NEXT_COOKIE } from "@/lib/auth/next-cookie";
import { GET } from "@/app/auth/oauth/route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const mockClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

function request(path = "/auth/oauth", next?: string) {
  return new NextRequest(new URL(path, "https://daet.test"), {
    headers: { host: "daet.test", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.9" },
  });
}

function clientWith(url: string | null, error: { code?: string; message?: string } | null = null) {
  const client = {
    auth: {
      signInWithOAuth: jest.fn(async () => ({ data: { provider: "google", url }, error })),
    },
  };
  mockClient.mockImplementation(async (options) => {
    // The PKCE verifier is a cookie; without it the callback cannot finish.
    options?.onCookiesSet?.([{ name: "sb-project-auth-token-code-verifier", value: "verifier", options: { httpOnly: true } }]);
    return client as never;
  });
  return client;
}

const AUTHORIZE =
  "https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fdaet.test%2Fauth%2Fcallback&scopes=openid+email+profile&prompt=select_account";

describe("Continue with Google", () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    clearAttempts();
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  });
  afterAll(() => {
    process.env = env;
  });

  it("asks for Google with a callback on this site and an account chooser", async () => {
    const client = clientWith(AUTHORIZE);

    const response = await GET(request());

    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: expect.objectContaining({
        redirectTo: "https://daet.test/auth/callback",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      }),
    });
    expect(response.headers.get("location")).toBe(AUTHORIZE);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("carries the PKCE verifier cookie to the redirect", async () => {
    clientWith(AUTHORIZE);

    const response = await GET(request());

    expect(response.cookies.get("sb-project-auth-token-code-verifier")?.value).toBe("verifier");
  });

  it("keeps the page the visitor wanted in an http-only cookie", async () => {
    clientWith(AUTHORIZE);

    const response = await GET(request("/auth/oauth?next=/tours/me"));

    expect(response.cookies.get(NEXT_COOKIE)?.value).toBe("/tours/me");
    expect(response.cookies.get(NEXT_COOKIE)?.httpOnly).toBe(true);
    expect(response.cookies.get(NEXT_COOKIE)?.sameSite).toBe("lax");
  });

  it("drops an off-site next before it reaches the cookie", async () => {
    clientWith(AUTHORIZE);
    const response = await GET(request("/auth/oauth?next=https://evil.example/steal"));
    expect(response.cookies.get(NEXT_COOKIE)?.value).toBe("/dashboard");
  });

  it("refuses to follow a URL that is not the configured auth service", async () => {
    clientWith("https://evil.example/auth/v1/authorize?provider=google");

    const response = await GET(request());

    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("goes back to the form with a sentence when Google is not set up", async () => {
    clientWith(null, { code: "validation_failed", message: "Unsupported provider: provider is not enabled" });

    const response = await GET(request());

    const url = new URL(response.headers.get("location") ?? "");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("message")).toMatch(/Google sign-in is not available right now/i);
    expect(url.searchParams.get("message")).not.toMatch(/provider is not enabled/i);
  });

  it("says so plainly when the project has no auth configured at all", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await GET(request());

    expect(mockClient).not.toHaveBeenCalled();
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });
});
