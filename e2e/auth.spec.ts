import { expect, test, type Page } from "@playwright/test";
import { signInAs, visit } from "./fixtures";

const MOCK = "http://127.0.0.1:54329";
const PASSWORD = "Bagasbas-Waves-2026";

type AuthEntry = { kind: string; email?: string; redirectTo?: string | null; provider?: string; prompt?: string; data?: { full_name?: string } };

async function authLog(page: Page): Promise<AuthEntry[]> {
  const response = await page.request.get(`${MOCK}/testing/auth-log`);
  return (await response.json()) as AuthEntry[];
}

async function clearAuthLog(page: Page) {
  await page.request.get(`${MOCK}/testing/auth-log/clear`);
}

/**
 * Is there a Supabase *session* cookie for this browser? Not just any `sb-…`
 * cookie: sign-up legitimately leaves a `-code-verifier` behind, which is what
 * proves the confirmation link belongs to this browser.
 */
async function hasSession(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  return cookies.some((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name) && cookie.value.length > 0);
}

test.describe("signing up, signing in and proving the address", () => {
  test("does not sign a new account in until the email is confirmed", async ({ page }) => {
    await clearAuthLog(page);
    await visit(page, "/signup", /create account/i);

    await page.getByLabel("Full name").fill("Juan Dela Cruz");
    await page.getByLabel("Email address").fill("maria.santos@example.ph");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Check your inbox")).toBeVisible();
    await expect(page.getByText("maria.santos@example.ph").first()).toBeVisible();
    // The account exists but is not usable: no session, no dashboard.
    expect(await hasSession(page)).toBe(false);

    const [signup] = await authLog(page);
    expect(signup.kind).toBe("signup");
    expect(signup.email).toBe("maria.santos@example.ph");
    // The link Supabase sends has to come back to this site's callback.
    expect(signup.redirectTo).toContain("/auth/callback");
    expect(signup.data?.full_name).toBe("Juan Dela Cruz");
  });

  test("answers an address that already has an account exactly as it answers a new one", async ({ page }) => {
    await clearAuthLog(page);
    await visit(page, "/signup", /create account/i);

    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Email address").fill("taken@example.ph");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    // Same panel, same promise — nothing says "that email is taken".
    await expect(page.getByText("Check your inbox")).toBeVisible();
    const body = await page.locator("main").innerText();
    expect(body).not.toMatch(/already registered|already taken|already in use/i);
    expect(await hasSession(page)).toBe(false);
  });

  test("refuses a badly formed sign-up before anything is sent", async ({ page }) => {
    await clearAuthLog(page);
    await visit(page, "/signup", /create account/i);

    await page.getByLabel("Full name").fill("J");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter your full name.")).toBeVisible();
    await expect(page.getByText(/valid email address/i)).toBeVisible();
    await expect(page.getByText(/at least 8 characters/i).first()).toBeVisible();
    expect(await authLog(page)).toEqual([]);
  });

  test("stops an unconfirmed account at the door, with a way to get a new link", async ({ page }) => {
    await visit(page, "/login", /sign in/i);

    await page.getByLabel("Email address").fill("unverified@example.ph");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Confirm your email first")).toBeVisible();
    const resend = page.getByRole("link", { name: /send a new verification email/i });
    await expect(resend).toHaveAttribute("href", /\/verify-email\?email=unverified%40example\.ph/);
    expect(await hasSession(page)).toBe(false);
    await expect(page).toHaveURL(/\/login/);
  });

  test("says the same vague sentence for a wrong password, and stays put", async ({ page }) => {
    await visit(page, "/login", /sign in/i);

    await page.getByLabel("Email address").fill("juan@example.ph");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Next renders its own route announcer with role="alert", so pick ours out
    // by its words rather than by the role alone.
    await expect(page.getByRole("alert").filter({ hasText: "do not match an account" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    expect(await hasSession(page)).toBe(false);
  });

  test("signs in with a confirmed password", async ({ page }) => {
    await visit(page, "/login", /sign in/i);

    await page.getByLabel("Email address").fill("juan@example.ph");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    expect(await hasSession(page)).toBe(true);
  });

  test("Continue with Google goes to Google and comes back signed in", async ({ page }) => {
    await clearAuthLog(page);
    await visit(page, "/login?next=/tours/me", /sign in/i);

    await page.getByRole("link", { name: /continue with google/i }).click();

    // The mock stands in for Google: it hands back a one-time code, the app
    // exchanges it on the server and the visitor arrives signed in.
    await expect(page).toHaveURL(/\/tours\/me/, { timeout: 15_000 });
    expect(await hasSession(page)).toBe(true);

    const authorize = (await authLog(page)).find((entry) => entry.kind === "authorize");
    expect(authorize?.provider).toBe("google");
    expect(authorize?.redirectTo).toContain("/auth/callback");
    // A shared laptop should offer the account chooser, not reuse the last one.
    expect(authorize?.prompt).toBe("select_account");
  });

  test("turns a link that cannot be used into advice, not an error page", async ({ page }) => {
    await page.goto("/auth/callback?code=expired-code");

    await expect(page).toHaveURL(/\/login\?message=/);
    await expect(page.getByRole("status").first()).toContainText(/could not be used in this browser/i);
    expect(await hasSession(page)).toBe(false);
  });

  test("completes a verification link and signs the visitor in", async ({ page }) => {
    await clearAuthLog(page);
    await page.goto("/auth/callback?token_hash=fine-hash&type=signup");

    await expect(page).toHaveURL(/\/tours\/me/, { timeout: 15_000 });
    expect(await hasSession(page)).toBe(true);
    const verify = (await authLog(page)).find((entry) => entry.kind === "verify");
    expect(verify?.kind).toBe("verify");
  });
});

test.describe("signing out", () => {
  // The account menu lives in the header from `xl` up; below that the same menu
  // is the last tab of the bottom bar.
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("signs out from the account menu and forgets the session", async ({ page, context }) => {
    await signInAs(context, "tourist");
    await visit(page, "/");
    expect(await hasSession(page)).toBe(true);

    await page.getByRole("button", { name: /your account/i }).click();
    await page.getByRole("button", { name: "Sign out" }).click();

    // Home, with no session left — this is the path that failed with a preview
    // host and a production NEXT_PUBLIC_APP_URL configured.
    await expect(page).toHaveURL(/localhost:3101\/?$/, { timeout: 15_000 });
    expect(await hasSession(page)).toBe(false);
    await expect(page.getByRole("button", { name: /your account/i })).toHaveCount(0);
  });
});
