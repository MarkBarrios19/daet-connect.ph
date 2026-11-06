import { expect, test } from "@playwright/test";
import { checkA11y, draftPlan, signInAs, visit } from "./fixtures";

const SAVED_TRIP = "/tours/my-itineraries/5a7e0000-0000-4000-8000-0000000000a1";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  test.describe(`planner start and saved trip at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("the start view, then the chat pinned beside the plan with pace and getting-around chips", async ({ page }) => {
      await visit(page, "/tours/plan", "Where to in Daet?");
      await expect(page.getByRole("heading", { name: "Try asking" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Recents" })).toBeVisible();

      await draftPlan(page, "Plan 2 days of heritage, beaches and food");
      await expect(page.getByRole("heading", { level: 1, name: "Plan your Daet trip" })).toBeAttached();
      if (viewport.width < 1024) await page.getByRole("button", { name: "Back to chat" }).click();

      // The chat stays in place while the page scrolls (desktop), and fills the screen height.
      const box = page.locator("#assistant-input");
      if (viewport.width >= 1024) {
        const before = (await box.boundingBox())!.y;
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(300);
        expect(Math.abs((await box.boundingBox())!.y - before)).toBeLessThan(2);
        await page.mouse.wheel(0, -900);
      }

      await expect(page.getByRole("button", { name: "Balanced", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Relaxed", exact: true }).click();
      await expect(page.getByText(/Your plan has the new pace|no longer valid|couldn't/)).toBeVisible();
      await page.getByRole("button", { name: "Motorbike", exact: true }).click();
      await expect(page.getByRole("button", { name: "Motorbike", exact: true })).toHaveAttribute("aria-pressed", "true");
      await checkA11y(page, `planner chips ${viewport.width}`);
    });

    test("the saved trip page books each tour and opens the trip in the planner", async ({ page, context }) => {
      await signInAs(context, "tourist");
      await visit(page, SAVED_TRIP, "Daet weekend, slowly");
      await expect(page.getByText(/2 travelers · Relaxed pace · Saved/)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Book each trip" })).toBeVisible();
      await expect(page.getByRole("link", { name: /^Book .+ · ₱/ }).first()).toHaveAttribute("href", /\/tours\/packages\/[^/]+\/book\?date=\d{4}-\d{2}-\d{2}&pax=2/);
      await expect(page.getByRole("link", { name: "Back to the chat" })).toHaveAttribute("href", "/tours/plan");

      await page.getByRole("button", { name: "Change with the assistant" }).click();
      await page.waitForURL("**/tours/plan");
      await expect(page.getByRole("heading", { name: "Your 2-day Daet plan" })).toBeAttached();
    });
  });
}
