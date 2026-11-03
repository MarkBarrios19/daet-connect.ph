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

// "Open in Google Maps" on a place's own page has to land on that place — and
// two of the places are not in Daet at all (owner's note, image-93). Until the
// Tourism Office confirms a pin, Google is asked for the place by name in its
// own town rather than sent to an approximate coordinate.
test("a place page asks Google Maps for that place, in its own town", async ({ page }) => {
  await visit(page, "/tours/attractions/bagasbas-beach");
  const maps = page.getByRole("link", { name: /open in google maps/i });
  await expect(maps).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=Bagasbas+Beach%2C+Daet%2C+Camarines+Norte",
  );
  await expect(maps).toHaveAttribute("target", "_blank");

  await visit(page, "/tours/attractions/tinaga-island-calaguas");
  await expect(page.getByRole("link", { name: /open in google maps/i })).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=Tinaga+Island%2C+Vinzons%2C+Camarines+Norte",
  );
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
