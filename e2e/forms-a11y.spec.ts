import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./fixtures";

/**
 * Every form control has an accessible name tied to it (WCAG 1.3.1, 3.3.2, 4.1.2).
 * Runs axe's form rules on the operator forms and on the booking forms once opened.
 */
const FORM_RULES = ["label", "select-name", "form-field-multiple-labels", "aria-input-field-name", "autocomplete-valid", "duplicate-id", "duplicate-id-aria"];

async function expectNamedControls(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withRules(FORM_RULES).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    `${where}: form controls without a name`,
  ).toEqual([]);
}

test.describe("form controls are named", () => {
  test("operator payment settings", async ({ page, context }) => {
    await signInAs(context, "operator");
    await page.goto("/tours/operator/settings", { waitUntil: "networkidle" });
    await expect(page.getByLabel("GCash mobile number")).toBeVisible();
    await expectNamedControls(page, "payment settings");
  });

  test("operator payment recorder opens with named fields", async ({ page, context }) => {
    await signInAs(context, "operator");
    await page.goto("/tours/operator/bookings", { waitUntil: "networkidle" });
    const open = page.getByRole("button", { name: "Record payment" }).first();
    if (await open.count()) {
      await open.click();
      await expect(page.getByLabel("Payment amount (₱)").first()).toBeVisible();
    }
    await expectNamedControls(page, "payment recorder");
  });

  test("operator package wizard", async ({ page, context }) => {
    await signInAs(context, "operator");
    await page.goto("/tours/operator/packages/create", { waitUntil: "networkidle" });
    await expectNamedControls(page, "package wizard, basic details");
    await expect(page.getByLabel("Package title")).toBeVisible();
  });

  test("login and sign-up", async ({ page }) => {
    for (const path of ["/login", "/signup"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expectNamedControls(page, path);
    }
  });
});
