import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearAttempts } from "@/lib/auth/rate-limit";
import { NEXT_COOKIE } from "@/lib/auth/next-cookie";
import { signUpWithPassword } from "@/app/signup/actions";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: jest.fn() }));

const cookieSet = jest.fn();
jest.mock("next/headers", () => ({
  headers: jest.fn(async () => new Headers({ host: "daet.test", "x-forwarded-proto": "https" })),
  cookies: jest.fn(async () => ({ set: cookieSet, get: jest.fn(), getAll: jest.fn(() => []) })),
}));

const mockClient = createSupabaseServerClient as jest.MockedFunction<typeof createSupabaseServerClient>;

const GOOD = {
  fullName: "Juan Dela Cruz",
  email: "juan@example.ph",
  password: "bagasbas-waves-at-sunrise",
};

function form(entries: Record<string, string> = GOOD) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function clientWith(overrides: Record<string, unknown> = {}) {
  const client = {
    auth: {
      signUp: jest.fn(async () => ({ data: { user: { id: "u1", identities: [{}] }, session: null }, error: null })),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(async () => ({ error: null })),
      ...overrides,
    },
  };
  mockClient.mockResolvedValue(client as never);
  return client;
}

describe("signing up", () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    clearAttempts();
    process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  });
  afterAll(() => {
    process.env = env;
  });

  it("never reaches the auth service when a field is wrong", async () => {
    const state = await signUpWithPassword(
      { status: "idle" },
      form({ fullName: "J", email: "not-an-email", password: "short" }),
    );

    expect(state.status).toBe("error");
    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(["email", "fullName", "password"]);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("creates an account that must be confirmed, and does not sign it in", async () => {
    const client = clientWith();

    const state = await signUpWithPassword({ status: "idle" }, form());

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "juan@example.ph",
      password: GOOD.password,
      options: {
        data: { full_name: "Juan Dela Cruz" },
        emailRedirectTo: "https://daet.test/auth/callback",
      },
    });
    // The old flow signed in straight after signing up. It must not.
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(state.status).toBe("check-email");
    expect(state.email).toBe("juan@example.ph");
    expect(state.message).toMatch(/open the link/i);
  });

  it("remembers where the visitor was going, in a cookie of their browser", async () => {
    clientWith();

    await signUpWithPassword({ status: "idle" }, form({ ...GOOD, next: "/tours/me" }));

    expect(cookieSet).toHaveBeenCalledWith(
      NEXT_COOKIE,
      "/tours/me",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("does not carry an off-site next through the confirmation email", async () => {
    clientWith();

    await signUpWithPassword({ status: "idle" }, form({ ...GOOD, next: "https://evil.example/steal" }));

    expect(cookieSet).toHaveBeenCalledWith(NEXT_COOKIE, "/dashboard", expect.anything());
  });

  it("answers an address that already exists exactly as it answers a new one", async () => {
    // Supabase returns the existing user with no identities and sends no mail.
    const existing = clientWith({
      signUp: jest.fn(async () => ({ data: { user: { id: "u1", identities: [] }, session: null }, error: null })),
    });
    const first = await signUpWithPassword({ status: "idle" }, form());
    clearAttempts();

    const fresh = clientWith();
    const second = await signUpWithPassword({ status: "idle" }, form());

    expect(fresh.auth.signUp).toHaveBeenCalled();
    expect(existing.auth.signUp).toHaveBeenCalled();
    expect(second.status).toBe(first.status);
    expect(second.message).toBe(first.message);
    expect(second.email).toBe(first.email);
  });

  it("answers a 'user already exists' error the same way, instead of confirming the address", async () => {
    const client = clientWith({
      signUp: jest.fn(async () => ({
        data: { user: null, session: null },
        error: { code: "user_already_exists", message: "User already registered", status: 422 },
      })),
    });

    const state = await signUpWithPassword({ status: "idle" }, form());

    expect(client.auth.signUp).toHaveBeenCalled();
    expect(state.status).toBe("check-email");
    expect(state.message).not.toMatch(/already registered/i);
  });

  it("throws away a session handed out without confirming the address, and says why", async () => {
    // This is what an unconfigured project does: confirmation switched off.
    const client = clientWith({
      signUp: jest.fn(async () => ({
        data: { user: { id: "u1", identities: [{}] }, session: { access_token: "a" } },
        error: null,
      })),
    });

    const state = await signUpWithPassword({ status: "idle" }, form());

    expect(client.auth.signOut).toHaveBeenCalled();
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/confirm their email address first/i);
  });

  it("does not say whether an internal failure was the mailer or the database", async () => {
    clientWith({
      signUp: jest.fn(async () => ({
        data: { user: null, session: null },
        error: { code: "unexpected_failure", message: "Database error saving new user", status: 500 },
      })),
    });

    const state = await signUpWithPassword({ status: "idle" }, form());

    expect(state.status).toBe("error");
    expect(state.message).not.toMatch(/database/i);
  });

  it("stops a script from creating accounts in a loop", async () => {
    clientWith();
    const answers = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      answers.push(await signUpWithPassword({ status: "idle" }, form({ ...GOOD, email: `person${attempt}@example.ph` })));
    }

    const refused = answers.filter((state) => /too many attempts/i.test(state.message ?? ""));
    expect(refused.length).toBeGreaterThan(0);
    expect(answers[answers.length - 1].status).toBe("error");
  });
});
