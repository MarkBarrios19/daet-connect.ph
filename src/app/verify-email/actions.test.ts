import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearAttempts } from "@/lib/auth/rate-limit";
import { resendVerification } from "@/app/verify-email/actions";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("next/headers", () => ({
  headers: jest.fn(async () => new Headers({ host: "daet.test", "x-forwarded-proto": "https" })),
  cookies: jest.fn(async () => ({ set: jest.fn(), get: jest.fn(), getAll: jest.fn(() => []) })),
}));

const mockClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

function form(email: string) {
  const data = new FormData();
  data.set("email", email);
  return data;
}

function clientWith(resend: jest.Mock) {
  mockClient.mockResolvedValue({ auth: { resend } } as never);
  return resend;
}

describe("resending the confirmation email", () => {
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

  it("asks Supabase to send a sign-up link back to our callback", async () => {
    const resend = clientWith(jest.fn(async () => ({ data: {}, error: null })));

    const state = await resendVerification({ status: "idle" }, form(" Juan@Example.PH "));

    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "juan@example.ph",
      options: { emailRedirectTo: "https://daet.test/auth/callback" },
    });
    expect(state.status).toBe("success");
    expect(state.message).toMatch(/if juan@example\.ph is waiting/i);
  });

  it("answers the same way for an address that is already confirmed", async () => {
    const resend = clientWith(
      jest.fn(async () => ({ data: {}, error: { code: "user_already_confirmed", message: "Email already confirmed" } })),
    );

    const state = await resendVerification({ status: "idle" }, form("juan@example.ph"));

    expect(resend).toHaveBeenCalled();
    expect(state.status).toBe("success");
    expect(state.message).not.toMatch(/already confirmed/i);
  });

  it("rejects a malformed address without calling the auth service", async () => {
    clientWith(jest.fn());

    const state = await resendVerification({ status: "idle" }, form("nope"));

    expect(mockClient).not.toHaveBeenCalled();
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.email).toMatch(/valid email/i);
  });

  it("stops a loop of resends to one address", async () => {
    clientWith(jest.fn(async () => ({ data: {}, error: null })));

    const answers = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      answers.push(await resendVerification({ status: "idle" }, form("juan@example.ph")));
    }

    expect(answers.some((state) => /too many attempts/i.test(state.message ?? ""))).toBe(true);
  });
});
