import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

const canvas = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
// White, sampled from the owner's FAQ reference (image-46): the light theme's
// ground is the card's own white, and cards carry a hairline instead of a tone.
const LIGHT_CANVAS = "rgb(255, 255, 255)";
const DARK_CANVAS = "rgb(11, 18, 32)";

test.describe("dark mode", () => {
  test("follows the device when no choice is saved", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(await canvas(page)).toBe(DARK_CANVAS);
    await checkA11y(page, "home in dark mode");
    await context.close();
  });

  test("the postcard's ridge turns off-white in dark mode, and its panel stays cyan", async ({ browser }) => {
    // The owner's note on image-50: the navy ridge disappeared into the dark
    // ground. It takes the heading's off-white instead; the cyan panel and its
    // dark ink are printed, so they read the same in both themes.
    const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });

    const frame = await page
      .locator("[data-ticket-frame]")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    // Off-white, a step under the heading's #e2e8f0 so the card sits in the
    // theme instead of glowing out of it (the owner's note on image-56).
    expect(frame, "off-white, dimmed for the dark ground").toBe("rgb(205, 214, 227)");

    const [field, ink] = await page.locator("[data-ticket-panel]").evaluate((element) => [
      getComputedStyle(element).backgroundColor,
      getComputedStyle(element).color,
    ]);
    // The reference's cyan, a step deeper: it was the largest light area on the
    // page, and white on it would be 2.3:1.
    expect(field, "a deeper cyan").toBe("rgb(16, 162, 220)");
    expect(ink, "its dark copy, unchanged").toBe("rgb(15, 23, 42)");

    // And the photograph is set into the theme with a fifth of the page's ground
    // (the layer is display:none in light mode).
    const scrim = await page.locator("[data-ticket-photo] > div").first().evaluate((element) => ({
      display: getComputedStyle(element).display,
      paint: getComputedStyle(element).backgroundColor,
    }));
    expect(scrim.display, "over the picture in dark mode").toBe("block");
    expect(scrim.paint, "a dark wash, not a clear one").not.toBe("rgba(0, 0, 0, 0)");

    await context.close();
  });

  test("the phone menu switches theme, and the choice survives a reload", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await canvas(page)).toBe(LIGHT_CANVAS);

    await page.getByRole("banner").locator("summary").click();
    const theme = page.getByRole("group", { name: "Theme" });
    await theme.getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await canvas(page)).toBe(DARK_CANVAS);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await canvas(page)).toBe(DARK_CANVAS);

    await page.getByRole("banner").locator("summary").click();
    await page.getByRole("group", { name: "Theme" }).getByText("System", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(await page.evaluate(() => localStorage.getItem("daet-theme"))).toBeNull();
  });

  test("a saved choice is applied before the page paints", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("daet-theme", "dark"));
    // Read the theme as soon as <body> exists, before any app script runs.
    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState === "interactive" && !("__firstTheme" in window)) {
          (window as unknown as { __firstTheme: string | null }).__firstTheme = document.documentElement.getAttribute("data-theme");
        }
      });
    });
    await page.goto("/tours/browse", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => (window as unknown as { __firstTheme: string | null }).__firstTheme)).toBe("dark");
  });

  test("the desktop header button cycles Light, Dark, System", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto("/tours/browse", { waitUntil: "networkidle" });
    const button = page.getByRole("button", { name: /^Theme:/ });
    await expect(button).toHaveAccessibleName("Theme: System. Switch to Light");
    await button.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await button.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await checkA11y(page, "trips in dark mode");
    await button.click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    await context.close();
  });

  test("signed in, Dark mode is a switch in the account menu", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await signInAs(context, "tourist");
    const page = await context.newPage();
    await page.goto("/tours/me", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: /^Theme:/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^(You, y|Y)our account/ }).click();
    const dark = page.getByRole("switch", { name: "Dark mode" });
    await expect(dark).toHaveAttribute("aria-checked", "false");
    await dark.click();
    await expect(dark).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await canvas(page)).toBe(DARK_CANVAS);
    await checkA11y(page, "account menu in dark mode");
    await dark.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });
});
