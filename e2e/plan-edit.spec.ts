import { expect, test, type Page } from "@playwright/test";
import { checkA11y, draftPlan } from "./fixtures";

/** The names of a day's stops in edit mode, in order, from their drag handles. */
async function order(page: Page, day = 1): Promise<string[]> {
  const handles = page.getByRole("region", { name: `Day ${day} stops` }).getByRole("button", { name: /^Drag to reorder / });
  return (await handles.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""))).map((l) => l.replace("Drag to reorder ", ""));
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  test.describe(`plan edit mode at ${viewport.width}px`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto("/tours/plan", { waitUntil: "networkidle" });
      await draftPlan(page, "Plan 2 days of heritage, beaches and food");
      await page.getByRole("button", { name: "Edit" }).click();
      await expect(page.getByText(/^Editing · /)).toBeVisible();
    });

    test("drags a stop to a new place with the mouse and the keyboard", async ({ page }) => {
      const before = await order(page);
      test.skip(before.length < 2, "the mock plan needs two stops on day 1");
      await checkA11y(page, `plan edit mode ${viewport.width}`);

      // Mouse (or finger, on the phone width): the second stop onto the first.
      const status = page.getByRole("status").filter({ hasText: /New times are in|doesn't fit/ });
      const second = page.getByRole("button", { name: `Drag to reorder ${before[1]}` });
      const first = page.getByRole("button", { name: `Drag to reorder ${before[0]}` });
      await second.scrollIntoViewIfNeeded();
      await first.scrollIntoViewIfNeeded();
      const from = (await second.boundingBox())!;
      const to = (await first.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 3 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 4, { steps: 12 });
      await page.mouse.up();
      await expect(status).toBeVisible();
      const moved = await order(page);
      if ((await status.textContent())?.includes("New times are in")) expect(moved.slice(0, 2)).toEqual([before[1], before[0]]);
      else expect(moved).toEqual(before);

      // Keyboard: Space to pick up, an arrow to move, Space to drop.
      const current = await order(page);
      await page.getByRole("button", { name: `Drag to reorder ${current[0]}` }).focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Space");
      await expect(page.getByRole("status").filter({ hasText: /New times are in|doesn't fit/ })).toBeVisible();
    });

    test("removes a stop with Undo, adds one, and Cancel puts the plan back", async ({ page }) => {
      const before = await order(page);
      await page.getByRole("button", { name: `Remove ${before[0]}` }).click();
      await expect(page.getByText(`${before[0]} removed from your trip`)).toBeVisible();
      expect(await order(page)).not.toContain(before[0]);
      await page.getByRole("button", { name: "Undo" }).click();
      await expect.poll(() => order(page)).toEqual(before);

      await page.getByRole("button", { name: "Add a stop" }).first().click();
      const add = page.getByRole("button", { name: /^Add .+ to Day 1$/ }).first();
      await expect(add).toBeVisible();
      const name = ((await add.getAttribute("aria-label")) ?? "").replace(/^Add (.+) to Day 1$/, "$1");
      await add.click();
      await expect(page.getByRole("status").filter({ hasText: new RegExp(`Added ${name}|doesn't fit`) })).toBeVisible();

      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
      await page.getByRole("button", { name: "Edit" }).click();
      expect(await order(page)).toEqual(before);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
