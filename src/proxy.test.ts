import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { proxy } from "@/proxy";

jest.mock("@supabase/ssr", () => ({ createServerClient: jest.fn() }));

const mockCreateClient = createServerClient as unknown as jest.Mock;

function request(path: string, method = "GET") {
  return new NextRequest(new URL(path, "https://daet.test"), {
    method,
    headers: { host: "daet.test", "x-forwarded-proto": "https", cookie: "sb-project-auth-token=base64-session" },
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

  it("does nothing at all when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    await proxy(request("/tours/me"));

    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
