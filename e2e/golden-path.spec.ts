import { expect, test } from "@playwright/test";
import { checkA11y, draftPlan, signInAs } from "./fixtures";

/**
 * The evaluator walkthrough, screen by screen: plan → book → pay → check-in →
 * review → analytics. Payment and the webhook need PayMongo sandbox keys, so
 * those steps are covered by the manual script in docs/EVALUATION_KIT.md;
 * here we check every screen a tester touches works at phone width.
 */
test("tourist → guide → admin walkthrough screens", async ({ browser }) => {
  const tourist = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await signInAs(tourist, "tourist");
  const page = await tourist.newPage();

  // 1. Plan a trip and get a schedule.
  await page.goto("/tours/plan", { waitUntil: "networkidle" });
  await draftPlan(page);
  await checkA11y(page, "plan result");

  // 2. Open a package and reach the booking form with open dates.
  await page.goto("/tours/packages/aa000000-0000-4000-8000-000000000001", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /book this trip/i }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await checkA11y(page, "booking form");

  // 3. Booking page: pay button and ticket for a confirmed booking.
  await page.goto("/tours/me", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /show ticket qr/i }).first()).toBeVisible();
  await page.getByRole("link", { name: /^pay ₱/i }).first().click();
  await expect(page).toHaveURL(/#payment$/);
  await expect(page.getByRole("heading", { name: "Next step" })).toBeVisible();
  // No PayMongo keys in e2e, so paying the operator directly is the main button; it opens the instructions.
  await page.getByRole("button", { name: "See how to pay the operator" }).click();
  await expect(page.getByLabel("Reference number")).toBeVisible();

  // 4. Completed tour: the review form is offered.
  await page.goto("/tours/bookings/b-done", { waitUntil: "networkidle" });
  await expect(page.getByText(/rate your tour/i)).toBeVisible();
  await page.getByRole("button", { name: "5 stars" }).click();
  await expect(page.getByRole("button", { name: /post review/i })).toBeEnabled();
  await checkA11y(page, "review form");
  await tourist.close();

  // 5. Guide: roster with the scanner shortcut.
  const guide = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await signInAs(guide, "guide");
  const guidePage = await guide.newPage();
  await guidePage.goto("/tours/guide/dashboard", { waitUntil: "networkidle" });
  await guidePage.getByRole("link", { name: /guest list/i }).first().click();
  await expect(guidePage).toHaveURL(/\/roster$/);
  await checkA11y(guidePage, "roster");
  await guide.close();

  // 6. Admin: analytics shows KPIs and the arrivals table.
  const admin = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await signInAs(admin, "admin");
  const adminPage = await admin.newPage();
  await adminPage.goto("/tours/admin/analytics", { waitUntil: "networkidle" });
  await expect(adminPage.getByText("Tourist check-ins")).toBeVisible();
  await adminPage.getByText("Show as table").click();
  await expect(adminPage.getByRole("table")).toBeVisible();
  await admin.close();
});

test("guide can mark a day available", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await signInAs(context, "guide");
  const page = await context.newPage();
  await page.goto("/tours/guide/dashboard", { waitUntil: "networkidle" });
  // Past days are disabled, so near month end today's month can run out of open days.
  // Next month is always fully open; pick its first day that is not set yet.
  const grid = page.getByRole("grid");
  const currentMonth = (await grid.getAttribute("aria-label")) ?? "";
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page).toHaveURL(/[?&]month=\d{4}-\d{2}/);
  await expect(grid).not.toHaveAttribute("aria-label", currentMonth);
  const day = grid.locator('button[aria-label$=": not set"]:not([disabled])').first();
  const label = (await day.getAttribute("aria-label")) ?? "";
  await day.click();
  await expect(page.getByRole("button", { name: label.replace("not set", "available") })).toBeVisible();
  await context.close();
});
