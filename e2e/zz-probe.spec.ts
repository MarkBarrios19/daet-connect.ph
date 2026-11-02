import { expect, test } from "@playwright/test";
import { visit } from "./fixtures";

test.use({ reducedMotion: "no-preference" });

test("probe: the home map and its pins", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`.slice(0, 120)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`.slice(0, 120));
  });

  await visit(page, "/");
  await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();

  const show = page.getByRole("button", { name: "Show the place's details" });
  if (await show.count()) await show.click();
  await page.getByRole("link", { name: "Open on the map" }).click();
  await page.waitForTimeout(2500);

  const report = await page.evaluate(() => {
    const section = document.querySelector('section[aria-labelledby="home-map"]');
    const buttons = Array.from(section?.querySelectorAll("button") ?? []);
    const labels = buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim().slice(0, 20) ?? "?");
    const map = document.querySelector(".leaflet-container") as HTMLElement | null;
    const holder = section?.querySelector("div[class*='h-80']") as HTMLElement | null;
    const visible = buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length;
    return {
      scrollY: Math.round(window.scrollY),
      text: (section?.textContent ?? "").replace(/\s+/g, " ").slice(0, 120),
      buttons: buttons.length,
      visible,
      labels: labels.slice(0, 8),
      map: map ? `${Math.round(map.getBoundingClientRect().width)}x${Math.round(map.getBoundingClientRect().height)}` : "none",
      holder: holder ? `${Math.round(holder.getBoundingClientRect().width)}x${Math.round(holder.getBoundingClientRect().height)}` : "none",
    };
  });

  expect(JSON.stringify({ report, errors: errors.slice(0, 6) }, null, 1)).toBe("");
});
