import { expect, test } from "@playwright/test";
import { signInAs } from "./fixtures";

test("operator search and status filters preserve each other", async ({ context, page }) => {
  await signInAs(context, "operator");
  await page.goto("/tours/operator/bookings", { waitUntil: "networkidle" });
  await page.getByRole("searchbox", { name: "Search bookings" }).fill("Jane");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=Jane/);
  await page.getByRole("link", { name: /Confirmed/ }).click();
  await expect(page).toHaveURL(/status=confirmed/);
  await expect(page).toHaveURL(/q=Jane/);
  await expect(page.getByRole("searchbox", { name: "Search bookings" })).toHaveValue("Jane");
  await page.getByRole("link", { name: "Clear search" }).first().click();
  await expect(page).toHaveURL(/status=confirmed/);
  await expect(page).not.toHaveURL(/q=/);
});
