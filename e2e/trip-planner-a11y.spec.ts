import { expect, test } from "@playwright/test";
import { checkA11y, draftPlan, signInAs } from "./fixtures";

/** Trip planner screens at phone and desktop width: no axe violations, no sideways scroll. */
for (const viewport of [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({ viewport });

    const noSidewaysScroll = async (page: import("@playwright/test").Page) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    };

    test("the planner with a drafted plan", async ({ page }) => {
      await page.goto("/tours/plan", { waitUntil: "networkidle" });
      await draftPlan(page);
      await checkA11y(page, `planner ${viewport.width}`);
      await noSidewaysScroll(page);
    });

    test("a shared trip is view only, with tours to book yourself", async ({ page }) => {
      await page.goto("/tours/itineraries/shared/5a7e0000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1, name: "Weekend in Daet" })).toBeVisible();
      await expect(page.getByText(/view only/i).first()).toBeVisible();
      await checkA11y(page, `shared trip ${viewport.width}`);
      await noSidewaysScroll(page);
    });

    test("a trip the operator called off offers a new date or a full refund", async ({ context, page }) => {
      await signInAs(context, "tourist");
      await page.goto("/tours/bookings/b-off", { waitUntil: "networkidle" });
      await expect(page.getByText(/Strong winds/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /refund/i }).first()).toBeVisible();
      await checkA11y(page, `called-off trip ${viewport.width}`);
      await noSidewaysScroll(page);
    });
  });
}
