import { expect, test } from "@playwright/test";
import { checkA11y, visit } from "./fixtures";

test.use({ viewport: { width: 1440, height: 900 } });

test("no dates yet drafts a sample plan; Pick dates to save asks for dates and drafts a dated plan", async ({ page }) => {
  await visit(page, "/tours/plan", "Where to in Daet?");
  await page.getByLabel("Ask the Daet AI assistant").fill("Plan 2 days in Daet, beaches and food");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("form", { name: "Before I draft" });
  await card.getByLabel(/No dates yet/).check();
  await card.getByLabel("How many days?").selectOption("2");
  await card.getByRole("button", { name: "Manila" }).click();
  await card.getByRole("button", { name: "Draft my plan" }).click();

  await expect(page.getByRole("heading", { name: "Your sample 2-day Daet plan" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^No dates yet · 2 travelers/)).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Sample plan, no dates yet.");
  await expect(page.getByText(/No dates yet, 2 days/)).toBeVisible();
  await expect(page.getByText("Day 1 · Saturday", { exact: true })).toBeVisible();
  await expect(page.getByText(/as a sample for a weekend/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to a trip" })).toHaveCount(0);
  for (const link of await page.getByRole("link", { name: /^Book/ }).all()) await expect(link).not.toHaveAttribute("href", /date=/);
  await page.screenshot({ path: "/tmp/claude-0/-home-user-daet-connect-ph/006bdc63-072e-5fca-8fa2-b75843fb5995/scratchpad/sample-plan.png" });
  await checkA11y(page, "sample plan");

  await page.getByRole("button", { name: "Pick dates to save" }).click();
  const again = page.getByRole("form", { name: "Before I draft" }).last();
  await expect(again.getByLabel("First day")).toBeVisible();
  const day = (n: number) => new Date(Date.now() + 8 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
  await again.getByLabel("First day").fill(day(1));
  await again.getByLabel("Last day").fill(day(2));
  await again.getByRole("button", { name: "Draft my plan" }).click();
  await expect(page.getByRole("heading", { name: "Your 2-day Daet plan" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Save to a trip" })).toBeVisible();
});
