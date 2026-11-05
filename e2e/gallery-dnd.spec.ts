import { expect, test, type Page } from "@playwright/test";
import { signInAs, visit } from "./fixtures";

/**
 * The gallery's drag interactions, in a real browser.
 *
 * dnd-kit measures element geometry to decide which photo is under the
 * pointer, and jsdom reports 0x0 rectangles for everything, so none of this
 * can be asserted in Jest. The mock package (e2e/mock-supabase.cjs) carries
 * three photos with distinct captions, so the order is readable from the DOM.
 */
const EDIT = "/tours/operator/packages/aa000000-0000-4000-8000-000000000001/edit";

const card = (page: Page, position: number) =>
  page.locator(`article[aria-label="Photo ${position} of 3"]`);

/** The caption on the card at `position`, which identifies the photo. */
async function captionAt(page: Page, position: number) {
  return (await card(page, position).innerText()).trim();
}

/**
 * Brings the photo grid into the viewport. The gallery sits low on the edit
 * page, and both a real pointer and dnd-kit's keyboard moves work from
 * on-screen geometry, as a person scrolling to it would.
 */
async function showGrid(page: Page) {
  await card(page, 3).scrollIntoViewIfNeeded();
  await card(page, 1).scrollIntoViewIfNeeded();
}

/**
 * dnd-kit's screen-reader live region. Keyboard steps wait on what it
 * announces, so each key lands only once the previous one has taken effect.
 */
const announcer = (page: Page) => page.locator('[id^="DndLiveRegion"]');

/** Drags one card onto another with a real pointer, in small steps. */
async function dragOnto(page: Page, from: number, to: number) {
  await showGrid(page);
  const source = await card(page, from).boundingBox();
  const target = await card(page, to).boundingBox();
  if (!source || !target) throw new Error("cards are not laid out");

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  // dnd-kit's PointerSensor needs a few pixels of travel to activate.
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 12, { steps: 3 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.describe("gallery at phone width", () => {
  test.beforeEach(async ({ context }) => signInAs(context, "operator"));

  test("renders the photos and passes the a11y audit", async ({ page }) => {
    await visit(page, EDIT);

    await expect(card(page, 1)).toBeVisible();
    await expect(card(page, 3)).toBeVisible();
    await expect(page.getByText("3 of 20 photos")).toBeVisible();
    await expect(page.getByText("First photo", { exact: true })).toBeVisible();
    expect(await captionAt(page, 1)).toContain("Surf at sunrise");
  });

  test("reorders with the keyboard: space, arrow, space", async ({ page }) => {
    await visit(page, EDIT);
    await expect(card(page, 1)).toBeVisible();
    await showGrid(page);

    const grip = page.getByRole("button", { name: "Move photo 1" });
    await grip.focus();
    await page.keyboard.press("Space");
    // Picking up announces "Picked up photo 1", then at once where it hovers.
    await expect(announcer(page)).toContainText("Photo 1 is over position 1");
    await page.keyboard.press("ArrowRight");
    await expect(announcer(page)).toContainText("over position 2");
    await page.keyboard.press("Space");
    await expect(announcer(page)).toContainText("swapped with position 2");

    // Photo 1 moved one place later; the second photo took its spot.
    await expect(card(page, 1)).toContainText("Calaguas sandbar");
    await expect(card(page, 2)).toContainText("Surf at sunrise");
  });

  test("cancels a keyboard move with Escape", async ({ page }) => {
    await visit(page, EDIT);
    await showGrid(page);

    const grip = page.getByRole("button", { name: "Move photo 1" });
    await grip.focus();
    await page.keyboard.press("Space");
    // Picking up announces "Picked up photo 1", then at once where it hovers.
    await expect(announcer(page)).toContainText("Photo 1 is over position 1");
    await page.keyboard.press("ArrowRight");
    await expect(announcer(page)).toContainText("over position 2");
    await page.keyboard.press("Escape");
    await expect(announcer(page)).toContainText("cancelled");

    await expect(card(page, 1)).toContainText("Surf at sunrise");
  });

  test("swaps two photos by dragging one onto the other", async ({ page }) => {
    await visit(page, EDIT);
    await expect(card(page, 1)).toBeVisible();

    await dragOnto(page, 1, 3);

    await expect(card(page, 1)).toContainText("Apuao sandbar");
    await expect(card(page, 2)).toContainText("Calaguas sandbar");
    await expect(card(page, 3)).toContainText("Surf at sunrise");
  });

  test("offers the menu's move actions as a non-drag fallback", async ({ page }) => {
    await visit(page, EDIT);

    await page.getByRole("button", { name: "Photo 2 options" }).click();
    await page.getByRole("menuitem", { name: "Make first photo" }).click();

    await expect(card(page, 1)).toContainText("Calaguas sandbar");
  });
});

test.describe("gallery on a desktop viewport", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test.beforeEach(async ({ context }) => signInAs(context, "operator"));

  test("keeps the lead tile and swaps by mouse drag", async ({ page }) => {
    await visit(page, EDIT);
    await expect(card(page, 1)).toBeVisible();

    // The lead photo spans two grid columns on wide screens.
    const lead = await card(page, 1).boundingBox();
    const second = await card(page, 2).boundingBox();
    expect(lead && second && lead.width > second.width * 1.5).toBe(true);

    await dragOnto(page, 2, 3);

    await expect(card(page, 2)).toContainText("Apuao sandbar");
    await expect(card(page, 3)).toContainText("Calaguas sandbar");
  });
});
