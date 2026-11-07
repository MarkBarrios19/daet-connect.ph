import { expect, test } from "@playwright/test";
import { offScreen, signInAs, visit } from "./fixtures";

// The narrowest common phone. Cards with tour photos used to spill past the
// screen here, and the notifications panel opened off the left edge.
test.use({ viewport: { width: 360, height: 780 } });

test.describe("mobile layout at 360px", () => {
  test("guide My tours and Home keep cards inside the screen", async ({ context, page }) => {
    await signInAs(context, "guide");
    await visit(page, "/tours/guide/my-tours", "My tours");
    await expect(page.getByRole("link", { name: "Live map" }).first()).toBeVisible();
    await visit(page, "/tours/guide/dashboard");
  });

  test("operator Bookings cards stack on a phone", async ({ context, page }) => {
    await signInAs(context, "operator");
    await visit(page, "/tours/operator/bookings");
  });

  test("the way back to the top is there once the page is scrolled, and takes it", async ({ page }) => {
    await visit(page, "/");
    const up = page.getByRole("button", { name: "Back to top" });

    // Nothing to go back over yet.
    await expect(up).toHaveCount(0);

    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 2, behavior: "instant" }));
    await expect(up).toBeVisible();

    // In the bottom-right corner, directly over the assistant pill (owner's note,
    // image-91): same right edge, stacked on top of it.
    const box = (await up.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(viewport.width - (box.x + box.width), "a thumb's width off the right edge").toBeGreaterThan(8);
    expect(viewport.width - (box.x + box.width), "and on it").toBeLessThan(32);

    const pill = (await page.getByRole("button", { name: "Open the Daet AI assistant", exact: true }).boundingBox())!;
    expect(Math.abs(box.x + box.width - (pill.x + pill.width)), "the same right edge").toBeLessThanOrEqual(2);
    expect(box.y + box.height, "clear of the pill's top edge").toBeLessThanOrEqual(pill.y);
    expect(pill.y - (box.y + box.height), "and close to it").toBeLessThan(16);

    await up.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(2);
    // And it steps out of the way again at the top.
    await expect(up).toHaveCount(0);
  });

  test("admin analytics keeps its bar cards inside the screen", async ({ context, page }) => {
    // The bar list labels are single-line, so a long package title used to
    // size the analytics grid track to its content: every card in the row —
    // and the bars inside — ran past the right edge of the screen, and the
    // layout viewport itself grew to 591px to hold it. innerWidth and
    // scrollWidth grow with it, so the yardstick here is the configured
    // 360px viewport, not window.innerWidth.
    await signInAs(context, "admin");
    await page.goto("/tours/admin/analytics", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Analytics");

    const screen = page.viewportSize()!.width;
    const metrics = await page.evaluate(() => ({
      layoutWidth: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll(".card-edge")].map((c) => Math.round(c.getBoundingClientRect().right)),
      bars: [...document.querySelectorAll('li > div[aria-hidden="true"] > div')].map((bar) => ({
        right: Math.round(bar.getBoundingClientRect().right),
        cardRight: Math.round(bar.closest(".card-edge")?.getBoundingClientRect().right ?? Infinity),
      })),
    }));

    expect(metrics.layoutWidth, "layout viewport must not grow past the screen").toBeLessThanOrEqual(screen);
    for (const right of metrics.cards) expect(right, "a card past the right edge").toBeLessThanOrEqual(screen);
    expect(metrics.bars.length, "the bar list rendered").toBeGreaterThan(0);
    for (const bar of metrics.bars) expect(bar.right, "a bar past its card").toBeLessThanOrEqual(bar.cardRight + 1);
  });

  test("the notifications panel opens inside the screen", async ({ context, page }) => {
    await signInAs(context, "tourist");
    await page.goto("/tours/messages", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /notification/i }).first().click();
    const panel = page.getByText("Mark all read").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await offScreen(page)).toEqual([]);
    // The floating chat button steps aside while the panel is open.
    await expect(page.getByRole("button", { name: "Daet AI assistant" })).toBeHidden();
  });
});
