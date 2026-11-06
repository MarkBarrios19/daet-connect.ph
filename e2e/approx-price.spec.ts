import { expect, test } from "@playwright/test";

test.describe("a visitor from abroad", () => {
  test.use({ locale: "en-GB", timezoneId: "Europe/London" });

  test("sees a rough amount in their currency next to peso prices", async ({ page }) => {
    await page.route("**/api/rates", (route) => route.fulfill({ json: { rates: { GBP: 0.0135, USD: 0.0172 } } }));
    await page.goto("/tours/browse");
    await expect(page.getByText(/^≈ £\d+(\.\d\d)? approx\.$/).first()).toBeVisible();
  });
});

test.describe("a visitor in the Philippines", () => {
  test.use({ locale: "en-US", timezoneId: "Asia/Manila" });

  test("sees pesos only", async ({ page }) => {
    await page.route("**/api/rates", (route) => route.fulfill({ json: { rates: { USD: 0.0172 } } }));
    await page.goto("/tours/browse");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByText(/approx\.$/)).toHaveCount(0);
  });
});
