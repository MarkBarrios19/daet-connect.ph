import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures";

/**
 * The redesigned bookings board (mock data in e2e/mock-supabase.cjs):
 * the filter card, the status chips with counts, the expandable row, and the
 * two dialogs — Approve & Assign, and Process Refund.
 */

test.beforeEach(async ({ context, page }) => {
  await signInAs(context, "operator");
  await page.goto("/tours/operator/bookings", { waitUntil: "networkidle" });
});

test("chips count every booking and the Refunded chip finds the returned ones", async ({ page }) => {
  const chips = page.getByRole("navigation", { name: "Filter by status" });
  await expect(chips).toBeVisible();

  // Mutually exclusive chips, so they add up to All.
  for (const label of ["All", "To confirm", "Confirmed", "Completed", "Declined", "Refunded"]) {
    await expect(chips.getByRole("link", { name: new RegExp(label, "i") })).toBeVisible();
  }

  await chips.getByRole("link", { name: /Refunded/ }).click();
  await expect(page).toHaveURL(/status=refunded/);
  await expect(page.getByRole("link", { name: "BK-20261012-RF22MM" })).toBeVisible();
  await expect(page.getByText("Refunded via PayMongo")).toBeVisible();
  await expect(page.getByRole("link", { name: /To confirm/ })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /Refunded/ })).toHaveAttribute("aria-current", "page");
});

test("a row expands to its guest notes, guide panel and quick actions", async ({ page }) => {
  const row = page.getByRole("article").filter({ hasText: "BK-20261023-7F3K2Q" }).first();
  const toggle = row.getByRole("button", { name: /Show details for BK-20261023-7F3K2Q/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(row.getByRole("button", { name: /Hide details for BK-20261023-7F3K2Q/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await expect(page.getByRole("region", { name: "Guest notes and requests" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Guide and operations" }).first()).toBeVisible();
  const quick = page.getByRole("region", { name: "Quick actions" }).first();
  await expect(quick).toBeVisible();
  await expect(quick.getByRole("link", { name: "Call Tourist" })).toHaveAttribute("href", /^tel:/);
});

test("Approve & Assign checks the day's seats and assigns a guide", async ({ page }) => {
  const pendingRow = page.getByRole("article").filter({ hasText: "BK-20261102-PN11ZZ" }).first();
  await pendingRow.getByRole("button", { name: "Approve", exact: true }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Approve & Assign Eco-Guide/ })).toBeVisible();
  // The mock's package has no calendar entry for this date, so there is nothing to block on.
  await expect(dialog.getByText(/capacity check|no daily limit/i)).toBeVisible();
  await expect(dialog.getByLabel("Assign certified local eco-guide")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirm & Send Voucher" })).toBeVisible();
});

test("Process Refund offers PayMongo and Manual, and needs a reason", async ({ page }) => {
  const row = page.getByRole("article").filter({ hasText: "BK-20261023-7F3K2Q" }).first();
  await row.getByRole("button", { name: /Show details for/ }).click();
  await page.getByRole("region", { name: "Quick actions" }).first().getByRole("button", { name: /Process Refund/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Process Refund/ })).toBeVisible();
  // No PayMongo keys in the test environment, so only the manual route is live.
  await expect(dialog.getByRole("button", { name: "Manual GCash" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "PayMongo (Auto)" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Record Manual Refund" })).toBeDisabled();

  await dialog.getByLabel("Reason for refund").selectOption("weather");
  await dialog.getByLabel(/Amount \(₱\)/).fill("100");
  await expect(dialog.getByRole("button", { name: "Record Manual Refund" })).toBeEnabled();
});

test("the board is usable and quiet at phone width", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
  const overflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the operator can record that the guest doesn't need a guide", async ({ page, request }) => {
  // The mock keeps PATCHed rows for the run; start from the fixture's state.
  await request.post("http://127.0.0.1:54329/__reset_board");
  await page.reload({ waitUntil: "networkidle" });

  const row = page.getByRole("article").filter({ hasText: "BK-20261023-7F3K2Q" }).first();
  await row.getByRole("button", { name: /Show details for/ }).click();

  const panel = row.getByRole("region", { name: "Guide and operations" });
  await expect(panel.getByText("Unassigned")).toBeVisible();

  await panel.getByRole("button", { name: /doesn't need a guide/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Record that no guide is needed" })).toBeVisible();
  await dialog.getByLabel(/What did the guest say/).fill("Guest asked in chat");
  await dialog.getByRole("button", { name: "No guide needed" }).click();

  // The row refreshes to the recorded decision, not an unfinished assignment.
  await expect(panel.getByText("No guide for this tour")).toBeVisible();
  await expect(panel.getByText("“Guest asked in chat”")).toBeVisible();
  await expect(panel.getByText("None — as the guest asked")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Assign a guide after all" })).toBeVisible();
  await expect(panel.getByRole("button", { name: /doesn't need a guide/ })).toHaveCount(0);
});
