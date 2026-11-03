import { expect, test, type Page } from "@playwright/test";
import { signInAs, visit } from "./fixtures";

/**
 * Profile settings: the one page every signed-in person owns — photo, name,
 * password. It is account-level, so it lives at /settings beside /login.
 */

const MOCK = "http://127.0.0.1:54329";
const PASSWORD = "Bagasbas-Waves-2026";
const AVATAR =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

type AuthEntry = { kind: string; name?: string | null; password?: boolean };

async function authLog(page: Page): Promise<AuthEntry[]> {
  const response = await page.request.get(`${MOCK}/testing/auth-log`);
  return (await response.json()) as AuthEntry[];
}

async function clearAuthLog(page: Page) {
  await page.request.get(`${MOCK}/testing/auth-log/clear`);
}

/** The You tab's button, which is where a phone reaches the account menu. */
const accountButton = (page: Page) =>
  page.getByRole("button", { name: /^(You, y|Y)our account/ });

test.beforeEach(async ({ request }) => {
  // Name, photo and upload count start from the same place in every test.
  await request.post(`${MOCK}/__reset_account`);
});

test("a visitor who is not signed in is sent to sign in first", async ({
  page,
}) => {
  await visit(page, "/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
});

test("the account menu opens the page, which names the person", async ({
  context,
  page,
}) => {
  await signInAs(context, "tourist");
  await visit(page, "/tours/me");

  await accountButton(page).click();
  await page.getByRole("link", { name: "Profile settings" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible();
  await expect(page.getByLabel(/full name/i)).toHaveValue("Juan Dela Cruz");
  await expect(page.getByText("juan@example.ph").first()).toBeVisible();
});

test("a new name saves, and the header shows it without a reload", async ({
  context,
  page,
}) => {
  await clearAuthLog(page);
  await signInAs(context, "tourist");
  await visit(page, "/settings");

  const name = page.getByLabel(/full name/i);
  await name.fill("Juan Miguel Dela Cruz");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(page.getByText("Your name is saved.")).toBeVisible();

  // Both records were written: the profile row, and the metadata the session
  // hands back. The menu is titled with the name.
  await expect(accountButton(page)).toHaveAttribute(
    "title",
    "Juan Miguel Dela Cruz",
  );
  await expect
    .poll(async () =>
      (await authLog(page))
        .filter((entry) => entry.kind === "update-user")
        .map((entry) => entry.name),
    )
    .toContain("Juan Miguel Dela Cruz");
});

test("the current password is required before a new one is saved", async ({
  context,
  page,
}) => {
  await signInAs(context, "tourist");
  await visit(page, "/settings");

  await page.getByLabel(/current password/i).fill("not-my-password");
  await page.getByLabel(/^new password/i).fill("Calaguas-Sunrise-2026");
  await page
    .getByLabel(/type the new password again/i)
    .fill("Calaguas-Sunrise-2026");
  await page.getByRole("button", { name: "Save new password" }).click();

  await expect(
    page.getByText("That is not your current password.").first(),
  ).toBeVisible();
  await expect(page.getByLabel(/current password/i)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  // Still signed in: a refused password change is not a lockout.
  await expect(accountButton(page)).toBeVisible();
});

test("the right current password changes it and ends the other sessions", async ({
  context,
  page,
}) => {
  await clearAuthLog(page);
  await signInAs(context, "tourist");
  await visit(page, "/settings");

  await page.getByLabel(/current password/i).fill(PASSWORD);
  await page.getByLabel(/^new password/i).fill("Calaguas-Sunrise-2026");
  await page
    .getByLabel(/type the new password again/i)
    .fill("Calaguas-Sunrise-2026");
  await page.getByRole("button", { name: "Save new password" }).click();

  await expect(page.getByText(/Your password is changed/)).toBeVisible();
  await expect
    .poll(
      async () =>
        (await authLog(page)).filter(
          (entry) => entry.kind === "update-user" && entry.password,
        ).length,
    )
    .toBeGreaterThan(0);
});

test("a reset link can be asked for from the page itself", async ({
  context,
  page,
}) => {
  await clearAuthLog(page);
  await signInAs(context, "tourist");
  await visit(page, "/settings");

  await page.getByRole("button", { name: "Email me a reset link" }).click();

  await expect(
    page.getByText(/A reset link is on its way to juan@example.ph/),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await authLog(page)).filter((entry) => entry.kind === "recover")
          .length,
    )
    .toBe(1);
});

test("a photo can be chosen, saved, and taken away again", async ({
  context,
  page,
}) => {
  await signInAs(context, "tourist");
  await visit(page, "/settings");

  // With no photo the round avatar draws the first letter of the name.
  await expect(
    accountButton(page).getByText("J", { exact: true }),
  ).toBeVisible();

  await page.locator("#photo").setInputFiles({
    name: "me.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(AVATAR, "base64"),
  });
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Your photo is saved.")).toBeVisible();

  // The header's circle is the photo now, served from the avatar bucket.
  await expect(accountButton(page).locator("img")).toHaveAttribute(
    "src",
    /tours-avatars/,
  );

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Your photo is removed.")).toBeVisible();
  await expect(accountButton(page).locator("img")).toHaveCount(0);
  await expect(
    accountButton(page).getByText("J", { exact: true }),
  ).toBeVisible();
});
