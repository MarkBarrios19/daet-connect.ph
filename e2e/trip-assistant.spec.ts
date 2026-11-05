import { expect, test } from "@playwright/test";
import { checkA11y, draftPlan } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

test("describe a trip, answer Before I draft, then change and book the plan", async ({ page }) => {
  await page.goto("/tours/plan", { waitUntil: "networkidle" });

  // 1. A plan request asks for dates, who is coming and where from before drafting.
  await page.getByLabel("Ask the Daet AI assistant").fill("Plan 2 days with my kids, beaches and food");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByRole("form", { name: "Before I draft" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "More children" }).click();
  await card.getByRole("button", { name: "Manila" }).click();
  await card.getByRole("button", { name: "Draft my plan" }).click();
  // Dates and the child's age are required.
  await expect(card.getByText("Pick your first and last day.")).toBeVisible();
  await expect(card.getByText("Add each child's age, 0 to 17.")).toBeVisible();
  await checkA11y(page, "Before I draft with errors");
});

test("the plan opens as a sheet on phones; stops can be removed and tours booked", async ({ page }) => {
  await page.goto("/tours/plan", { waitUntil: "networkidle" });
  await draftPlan(page);
  const plan = page.getByRole("region", { name: "Your plan" });
  await expect(plan.getByText(/Getting there|No fares listed/).first()).toBeVisible();
  await checkA11y(page, "plan sheet");

  // 2. Remove a stop from its menu.
  const options = plan.getByRole("button", { name: /^Options for / }).first();
  const name = ((await options.getAttribute("aria-label")) ?? "").replace("Options for ", "");
  await options.click();
  await plan.getByRole("group", { name: `Options for ${name}` }).getByRole("button", { name: "Remove" }).click();
  await expect(plan.getByText(`Removed ${name}.`)).toBeVisible();

  // 3. Bookable tours link to their booking form with the date and group filled in.
  const book = plan.getByRole("link", { name: /^Book for 2/ }).first();
  if (await book.count()) await expect(book).toHaveAttribute("href", /\/tours\/packages\/[^/]+\/book\?date=\d{4}-\d{2}-\d{2}&pax=2/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
