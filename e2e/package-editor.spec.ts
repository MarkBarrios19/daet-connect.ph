import { expect, test, type Page } from "@playwright/test";
import { checkA11y, signInAs, visit } from "./fixtures";

/**
 * The operator's package editor, in a real browser at both widths.
 *
 * The mock (e2e/mock-supabase.cjs) keeps the package between requests, so a
 * save is visible after a reload the way a real row would be. Each test puts it
 * back first: POST /__reset_package.
 */
const PKG = "aa000000-0000-4000-8000-000000000001";
const EDIT = `/tours/operator/packages/${PKG}/edit`;
const mock = (path: string) => fetch(`http://127.0.0.1:54329${path}`, { method: "POST" });

const sectionOf = (page: Page, id: string) => page.locator(`#${id}`);
const saveBar = (page: Page) => page.getByTestId("sticky-save-bar");

test.beforeEach(async ({ context }) => {
  await mock("/__reset_package");
  await signInAs(context, "operator");
});

test.describe("package editor at phone width", () => {
  test("the phone has a Jump to section picker that scrolls to the section", async ({ page }) => {
    await visit(page, EDIT, "Bagasbas Sunrise Surf Lesson");

    // Six sections is too many for tabs at 375px: it is a picker.
    const picker = page.getByLabel("Jump to section");
    await expect(picker).toBeVisible();
    await expect(picker.locator("option")).toHaveCount(6);

    await picker.selectOption("stops-section");
    // Focus goes to the section itself (it holds no field of its own), and the
    // page scrolls so its heading is clear of the sticky header and picker.
    await expect(sectionOf(page, "stops-section")).toBeFocused();
    await expect(page.getByRole("heading", { name: "Route & stops" })).toBeInViewport();
    await expect
      .poll(async () => (await sectionOf(page, "stops-section").boundingBox())!.y)
      .toBeGreaterThan(60);
    await checkA11y(page, "phone, jumped to a section");
  });

  test("the save bar clears the role tab bar and the last field", async ({ page }) => {
    await visit(page, EDIT);
    await page.getByLabel("Package title").fill("Bagasbas Sunrise Surf Lesson, small group");

    const bar = saveBar(page);
    await expect(bar).toBeVisible();
    await expect(bar.getByText("1 unsaved change")).toBeVisible();

    // The phone's tab bar is at the foot of the screen; the bar sits on top of
    // it rather than over it, and the page can still be scrolled clear of both.
    const barBox = (await bar.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height);
    const tabs = page.getByRole("navigation", { name: "Dashboard" });
    await expect(tabs).toBeVisible();
    const gaps = await page.evaluate(() => {
      const style = document.querySelector("[data-testid='sticky-save-bar']") as HTMLElement;
      const form = style.closest("form") as HTMLElement;
      return {
        barBottom: getComputedStyle(style).bottom,
        formPadding: getComputedStyle(form).paddingBottom,
      };
    });
    // Above the tab bar, and room for the bar under the form.
    expect(gaps.barBottom).toContain("--tab-bar-h");
    expect(parseFloat(gaps.formPadding)).toBeGreaterThanOrEqual(160);

    await page.getByRole("button", { name: "Discard" }).click();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByLabel("Package title")).toHaveValue(
      "Bagasbas Sunrise Surf Lesson, small group",
    );
    await checkA11y(page, "editor with unsaved changes");
  });

  test("navigating away with unsaved changes asks first", async ({ page }) => {
    await visit(page, EDIT);
    await page.getByLabel("Package title").fill("Half-finished title");

    await page.getByRole("link", { name: "← Packages" }).click();
    const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("1 unsaved change");

    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page).toHaveURL(new RegExp(`${PKG}/edit`));
    await expect(page.getByLabel("Package title")).toHaveValue("Half-finished title");

    await page.getByRole("link", { name: "← Packages" }).click();
    await page.getByRole("button", { name: "Leave page" }).click();
    await expect(page).toHaveURL(/\/tours\/operator\/packages$/);
  });

  test("a change is counted once per section, and a save clears the bar", async ({ page }) => {
    await visit(page, EDIT);

    await page.getByLabel("Package title").fill("Bagasbas surf, sunrise start");
    await expect(saveBar(page).getByText("1 unsaved change")).toBeVisible();

    // A second section: the first price option, through its own menu and modal.
    await page.getByRole("button", { name: "Standard price option options" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const modal = page.getByRole("dialog", { name: "Edit price option" });
    await modal.getByLabel(/What is this price called/).fill("Standard, per guest");
    await modal.getByRole("button", { name: "Save price option" }).click();
    await expect(saveBar(page).getByText("2 unsaved changes")).toBeVisible();

    await saveBar(page).getByRole("button", { name: "Save changes" }).click();

    // The bar goes once the server has the changes, and says so.
    await expect(saveBar(page)).toHaveCount(0);
    await expect(page.getByText("Changes saved.")).toBeVisible();

    // And a reload shows what was saved: this mock writes and reads back.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("Package title")).toHaveValue("Bagasbas surf, sunrise start");
    await expect(page.getByText("Standard, per guest")).toBeVisible();
  });

  test("a long list collapses behind Show all, and a removal can be undone", async ({ page }) => {
    await visit(page, EDIT);

    // Three stops in the mock, all shown.
    await expect(page.getByText("First José Rizal Monument")).toBeVisible();

    await page.getByRole("button", { name: "Daet Heritage Center stop options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.locator("ol").getByText("Daet Heritage Center")).toHaveCount(0);
    await expect(saveBar(page).getByText("1 unsaved change")).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator("ol").getByText("Daet Heritage Center")).toBeVisible();
    // Back where it started: nothing to save.
    await expect(saveBar(page)).toHaveCount(0);
  });

  test("a package in review is read-only, with the reason said up front", async ({ page }) => {
    await mock(`/__set_status?status=pending_review`);
    await visit(page, EDIT);

    await expect(page.getByText(/under review/)).toBeVisible();
    await expect(page.getByLabel("Package title")).toHaveCount(0);
    // Nothing can be edited, so nothing to save or leave.
    await expect(saveBar(page)).toHaveCount(0);
    await checkA11y(page, "editor for a package in review");
  });
});

test.describe("package editor on a desktop viewport", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("the sidebar sticks beside the sections and marks the one being read", async ({ page }) => {
    await visit(page, EDIT, "Bagasbas Sunrise Surf Lesson");

    const nav = page.getByRole("navigation", { name: "Sections of this package" });
    await expect(nav).toBeVisible();
    // The same six sections, as a list rather than a picker.
    await expect(nav.getByRole("link")).toHaveCount(6);
    await expect(page.getByLabel("Jump to section")).toBeHidden();

    // It stays put while the page scrolls, stuck under the header.
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(200);
    const stuck = (await nav.boundingBox())!;
    expect(stuck.y).toBeGreaterThan(0);
    expect(stuck.y).toBeLessThan(120);

    // Jumping takes the page to that section, which is now the current one.
    await nav.getByRole("link", { name: /^Prices/ }).click();
    await expect(sectionOf(page, "prices-section")).toBeInViewport();
    await expect(nav.locator('[aria-current="true"]')).toContainText("Prices");
  });

  test("edits a draft and saves it from the sticky bar", async ({ page }) => {
    await visit(page, EDIT);

    await page.getByLabel("Package title").fill("Bagasbas Sunrise Surf Lesson (2 hours)");
    await expect(saveBar(page).getByText("1 unsaved change")).toBeVisible();
    // The bar is at the foot of the viewport, not at the end of the page.
    const box = (await saveBar(page).boundingBox())!;
    expect(box.y).toBeGreaterThan(page.viewportSize()!.height * 0.6);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);

    await saveBar(page).getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();
    await expect(saveBar(page)).toHaveCount(0);
    await checkA11y(page, "desktop editor after a save");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("Package title")).toHaveValue("Bagasbas Sunrise Surf Lesson (2 hours)");
  });

  test("asks before leaving with unsaved changes", async ({ page }) => {
    await visit(page, EDIT);
    await page.getByLabel("Package title").fill("Unsaved on a desktop");

    await page.getByRole("link", { name: "← Packages" }).click();
    await expect(page.getByRole("dialog", { name: "Leave without saving?" })).toBeVisible();
    await page.getByRole("button", { name: "Leave page" }).click();
    await expect(page).toHaveURL(/\/tours\/operator\/packages$/);
  });

  test("a refused save says so in the bar and keeps the edits", async ({ page }) => {
    await mock("/__fail_next_save");
    await visit(page, EDIT);
    await page.getByLabel("Package title").fill("Will not save");
    await saveBar(page).getByRole("button", { name: "Save changes" }).click();

    // The bar carries the reason, the bar and the edits both stay.
    await expect(saveBar(page).getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Package title")).toHaveValue("Will not save");
    await expect(saveBar(page).getByText("1 unsaved change")).toBeVisible();
    await checkA11y(page, "editor after a refused save");
  });
});
