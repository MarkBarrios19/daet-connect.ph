import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NEXT_COOKIE } from "@/lib/auth/next-cookie";
import { GET } from "@/app/auth/callback/route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const mockClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

function request(path: string, next?: string) {
  const built = new NextRequest(new URL(path, "https://daet.test"), {
    headers: { host: "daet.test", "x-forwarded-proto": "https" },
  });
  if (next) built.cookies.set(NEXT_COOKIE, next);
  return built;
}

function clientWith({ exchange, verify }: { exchange?: jest.Mock; verify?: jest.Mock } = {}) {
  const client = {
    auth: {
      exchangeCodeForSession: exchange ?? jest.fn(async () => ({ data: { session: {} }, error: null })),
      verifyOtp: verify ?? jest.fn(async () => ({ data: { session: {} }, error: null })),
    },
  };
  // A real exchange writes the session cookies through this callback; the route
  // has to put them on its own redirect.
  mockClient.mockImplementation(async (options) => {
    options?.onCookiesSet?.([{ name: "sb-project-auth-token", value: "session-cookie", options: { httpOnly: true, path: "/" } }]);
    return client as never;
  });
  return client;
}

function location(response: Response) {
  return response.headers.get("location") ?? "";
}

describe("the callback's own address", () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env = {
      ...env,
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      NEXT_PUBLIC_APP_URL: "https://daet-connect-ph.vercel.app",
    };
  });
  afterAll(() => {
    process.env = env;
  });

  it("finishes the sign-in on the host the code arrived on, not the configured site", async () => {
    clientWith();

    const response = await GET(request("/auth/callback?code=one-time-code", "/tours/me"));

    // Moving the visitor to another alias mid-sign-in is how a Google round trip
    // ended up somewhere its verifier cookie was never written (round 47).
    expect(location(response)).toBe("https://daet.test/tours/me");
  });
});

describe("what a failed Google sign-in says", () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  });
  afterAll(() => {
    process.env = env;
  });

  const said = async (path: string) => {
    const response = await GET(request(path));
    const url = new URL(location(response));
    return { path: url.pathname, message: url.searchParams.get("message") ?? "" };
  };

  it("says it was cancelled when the visitor closes the Google prompt", async () => {
    clientWith();
    const { path, message } = await said("/auth/callback?error=access_denied&error_description=User+denied+access");
    expect(path).toBe("/login");
    expect(message).toMatch(/cancelled/i);
  });

  it("says Google is not switched on when the provider is still off in the dashboard", async () => {
    clientWith();
    const { message } = await said(
      "/auth/callback?error=server_error&error_description=Unsupported+provider%3A+provider+is+not+enabled",
    );
    expect(message).toMatch(/not switched on/i);
    expect(message).toMatch(/email and password/i);
  });

  it("says Google refused when the client credentials are wrong", async () => {
    clientWith();
    const { message } = await said("/auth/callback?error=server_error&error_description=Unable+to+exchange+external+code");
    expect(message).toMatch(/did not accept that sign-in/i);
  });

  it("keeps the email-link sentence for anything it cannot name", async () => {
    clientWith();
    const { path, message } = await said("/auth/callback?error=server_error&error_description=Something+odd");
    expect(path).toBe("/login");
    expect(message).toMatch(/could not be used in this browser/i);
    expect(message).not.toMatch(/something odd/i);
  });
});

describe("the email-link callback", () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  });
  afterAll(() => {
    process.env = env;
  });

  it("exchanges the code for a session and lands on the page that was asked for", async () => {
    const client = clientWith();

    const response = await GET(request("/auth/callback?code=one-time-code", "/tours/me"));

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(location(response)).toBe("https://daet.test/tours/me");
    // The code is gone from the address bar, and the remembered page with it.
    expect(response.cookies.get(NEXT_COOKIE)?.value).toBeFalsy();
  });

  it("puts the session cookies the exchange wrote onto the redirect", async () => {
    clientWith();

    const response = await GET(request("/auth/callback?code=abc"));

    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("session-cookie");
  });

  it("defaults to the dashboard when nothing was remembered", async () => {
    clientWith();
    const response = await GET(request("/auth/callback?code=abc"));
    expect(location(response)).toBe("https://daet.test/dashboard");
  });

  it("will not turn a tampered cookie into an open redirect", async () => {
    clientWith();
    const response = await GET(request("/auth/callback?code=abc", "https://evil.example/steal"));
    expect(location(response)).toBe("https://daet.test/dashboard");
  });

  it("verifies a token_hash link in the type the template named", async () => {
    const client = clientWith();

    const response = await GET(request("/auth/callback?token_hash=hash-1&type=signup"));

    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-1", type: "signup" });
    expect(location(response)).toBe("https://daet.test/dashboard");
  });

  it("takes a recovery link to the form that changes the password", async () => {
    clientWith();
    const response = await GET(request("/auth/callback?token_hash=hash-2&type=recovery"));
    expect(location(response)).toBe("https://daet.test/reset-password");
  });

  it("refuses a token type that is not on the list", async () => {
    const client = clientWith();
    const response = await GET(request("/auth/callback?token_hash=hash-3&type=made_up"));
    expect(client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(location(response)).toContain("https://daet.test/login?message=");
  });

  it("says a used or expired link is expired, without echoing the provider's words", async () => {
    clientWith({
      exchange: jest.fn(async () => ({ data: { session: null }, error: { code: "flow_state_not_found", message: "invalid flow state" } })),
    });

    const response = await GET(request("/auth/callback?code=stale"));

    const url = new URL(location(response));
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("message")).toMatch(/could not be used in this browser/i);
    expect(url.searchParams.get("message")).not.toMatch(/flow state/i);
  });

  it("sends a failed recovery link back to the form that can issue another", async () => {
    clientWith({
      exchange: jest.fn(async () => ({ data: { session: null }, error: { message: "invalid" } })),
    });

    const response = await GET(request("/auth/callback?code=stale", "/reset-password"));

    expect(new URL(location(response)).pathname).toBe("/forgot-password");
  });

  it("handles the error Supabase puts in the query string when a link is refused", async () => {
    const client = clientWith();
    const response = await GET(request("/auth/callback?error=access_denied&error_description=Email+link+is+invalid"));

    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(new URL(location(response)).pathname).toBe("/login");
  });

  it("does nothing at all for a bare visit", async () => {
    const client = clientWith();
    const response = await GET(request("/auth/callback"));
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(new URL(location(response)).pathname).toBe("/login");
  });
});
