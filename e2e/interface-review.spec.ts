import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

// Fixes from the interface review: one main action per operator card, risky
// actions behind More, and a guide calendar where a switch sets what a tap does.
test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

test("operator rows keep the risky actions out of the row, behind a confirm that names the booking", async ({ context, page }) => {
  await signInAs(context, "operator");
  await page.goto("/tours/operator/bookings", { waitUntil: "networkidle" });
  // One main action per row: approving. Cancelling and declining live in the
  // row's detail panel, and each confirm names the booking.
  const row = page.getByRole("article").filter({ hasText: "BK-20261023-7F3K2Q" }).first();
  await expect(row.getByRole("button", { name: /^Cancel booking$/ })).toHaveCount(0);
  await expect(row.getByRole("button", { name: /^Decline$/ })).toHaveCount(0);

  await row.getByRole("button", { name: /Show details for/ }).click();
  await row.getByRole("button", { name: /^Cancel booking$/ }).click();
  await expect(page.getByRole("dialog", { name: /^Cancel BK-\S+ for .+\?$/ })).toBeVisible();
  await checkA11y(page, "operator cancel confirm");
  await page.getByRole("button", { name: "Keep as is" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("the guide picks Not available, then a tap marks and a second tap clears", async ({ context, page }) => {
  await signInAs(context, "guide");
  await page.goto("/tours/guide/dashboard", { waitUntil: "networkidle" });
  const grid = page.getByRole("grid");
  const currentMonth = (await grid.getAttribute("aria-label")) ?? "";
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(grid).not.toHaveAttribute("aria-label", currentMonth);
  await page.getByRole("radio", { name: "Not available" }).click();
  await expect(page.getByRole("radio", { name: "Not available" })).toHaveAttribute("aria-checked", "true");
  const day = grid.locator('button[aria-label$=": not set"]:not([disabled])').first();
  const label = (await day.getAttribute("aria-label")) ?? "";
  await day.click();
  const marked = page.getByRole("button", { name: label.replace("not set", "not available") });
  await expect(marked).toBeVisible();
  await marked.click();
  await expect(page.getByRole("button", { name: label })).toBeVisible();
});

test("signed-in pages use the one-line footer", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto("/tours/my-bookings", { waitUntil: "networkidle" });
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Apply as an operator" })).toHaveCount(0);
});

test("the ticket QR waits until a booking is paid in full", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto("/tours/my-bookings", { waitUntil: "networkidle" });
  const partPaid = page.getByRole("listitem").filter({ hasText: "BK-20261023-7F3K2Q" });
  await expect(partPaid.getByRole("link", { name: "Ticket" })).toHaveCount(0);
  const paid = page.getByRole("listitem").filter({ hasText: "BK-20261020-PD77KK" });
  await expect(paid.getByRole("link", { name: "Ticket" })).toBeVisible();
  await page.goto("/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e/ticket", { waitUntil: "networkidle" });
  await expect(page.getByText("Pay to get your ticket")).toBeVisible();
});
