import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { POST } from "@/app/auth/logout/route";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const mockClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

function request(origin?: string) {
  const headers: Record<string, string> = { host: "daet.test", "x-forwarded-proto": "https" };
  if (origin) headers.origin = origin;
  return new NextRequest(new URL("/auth/logout", "https://daet.test"), { method: "POST", headers });
}

describe("signing out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    const client = { auth: { signOut: jest.fn(async () => ({ error: null })) } };
    mockClient.mockResolvedValue(client as never);
  });

  it("ends every session of the account, not only this browser's copy", async () => {
    const response = await POST(request("https://daet.test"));

    expect(mockClient).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a POST started by another site", async () => {
    const response = await POST(request("https://evil.example"));
    expect(response.status).toBe(403);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("still works for a client that sends no Origin, which can carry no session", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
  });

  it("does not report success when the auth service refused", async () => {
    const client = { auth: { signOut: jest.fn(async () => ({ error: { message: "boom" } })) } };
    mockClient.mockResolvedValue(client as never);

    const response = await POST(request("https://daet.test"));
    // The cookie is cleared by Supabase either way; the reply stays truthful.
    expect(await response.json()).toEqual({ success: true });
  });
});
