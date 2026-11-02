import { expect, test } from "@playwright/test";
import { visit } from "./fixtures";

// Signed-out visitor: discovery pages.
test.describe("public pages", () => {
  for (const path of [
    "/",
    "/tours/browse",
    "/tours/packages/aa000000-0000-4000-8000-000000000001",
    "/tours/attractions",
    "/tours/attractions/bagasbas-beach",
    "/tours/events",
    "/tours/events/e1000000-0000-4000-8000-000000000001",
    "/tours/merch",
    "/tours/plan",
    "/tours/faq",
    "/login",
    "/signup",
    "/forgot-password",
  ]) {
    test(`renders ${path}`, async ({ page }) => {
      await visit(page, path);
    });
  }
});

// Landing page places: one panel open at a time; tapping another opens it.
test("home place panels open one place at a time", async ({ page }) => {
  await visit(page, "/");
  const places = page.locator("section[aria-labelledby='home-places']");
  const calaguas = places.getByRole("button", { name: "Calaguas" });
  const bagasbas = places.getByRole("button", { name: "Bagasbas Beach" });
  await expect(calaguas).toHaveAttribute("aria-expanded", "true");
  await expect(places.getByRole("region", { name: "Calaguas" }).getByRole("link")).toHaveAttribute("href", "/tours/attractions/tinaga-island-calaguas");
  await expect(places.getByRole("region", { name: "Bagasbas Beach" })).toHaveAttribute("inert", "");
  await bagasbas.tap();
  await expect(bagasbas).toHaveAttribute("aria-expanded", "true");
  await expect(calaguas).toHaveAttribute("aria-expanded", "false");
  await expect(places.getByText(/ten minutes from the plaza/)).toBeVisible();
  await expect(places.getByRole("region", { name: "Bagasbas Beach" }).getByRole("link")).toHaveAttribute("href", "/tours/attractions/bagasbas-beach");
  await expect(places.getByRole("region", { name: "Calaguas" })).toHaveAttribute("inert", "");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
