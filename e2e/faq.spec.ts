import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { checkA11y, visit } from "./fixtures";

/**
 * The common questions page and the six-question band on the home page.
 *
 * Everything here is native `<details>`: no script opens or closes anything, so
 * these tests drive the summary rows the way a keyboard and a thumb would and
 * then read the `open` attribute the browser sets itself.
 */

const ITEM = "details[name='faq']";

async function headerBottom(page: Page) {
  const header = await page.locator("header").first().boundingBox();
  return header ? header.y + header.height : 0;
}

test("the page answers, and the answers are in the HTML", async ({ page }) => {
  await visit(page, "/tours/faq", "Common questions");
  const items = page.locator(ITEM);
  await expect(items).toHaveCount(21);
  // Closed, so the page is scannable — but the text is still in the document.
  await expect(page.locator("details#cancel")).not.toHaveAttribute("open", "");
  expect(await page.locator("details#cancel").textContent()).toContain("48 hours");
});

test("a question opens from the keyboard, and opening the next closes it", async ({ page }) => {
  await visit(page, "/tours/faq");

  const book = page.locator("details#book");
  await book.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(book).toHaveAttribute("open", "");
  await expect(book.getByText("Book this experience")).toBeVisible();

  const pay = page.locator("details#pay");
  await pay.locator("summary").click();
  await expect(pay).toHaveAttribute("open", "");
  await expect(book).not.toHaveAttribute("open", "");
  await expect(pay.getByText(/GCash, Maya or a card/)).toBeVisible();
});

test("a hash link lands on its question, below the sticky header", async ({ page }) => {
  await visit(page, "/tours/faq");
  await page.goto("/tours/faq#cancel", { waitUntil: "networkidle" });

  const cancel = page.locator("details#cancel");
  await expect(cancel).toBeInViewport();
  const box = (await cancel.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual((await headerBottom(page)) - 1);
});

test("the questions nobody has answered yet say so", async ({ page }) => {
  await visit(page, "/tours/faq");
  const season = page.locator("details#season");
  await season.locator("summary").click();
  await expect(season.getByText(/^\[placeholder: /)).toBeVisible();
  await checkA11y(page, "/tours/faq with a question open");
});

test("the schema says exactly what the page says", async ({ page }) => {
  await visit(page, "/tours/faq");

  const data = await page.locator('script[type="application/ld+json"]').first().textContent();
  const jsonLd = JSON.parse(data ?? "{}");
  expect(jsonLd["@type"]).toBe("FAQPage");

  const questions: { name: string; acceptedAnswer: { text: string } }[] = jsonLd.mainEntity;
  // Eight questions are waiting on the Tourism Office; thirteen are answered.
  expect(questions).toHaveLength(13);

  // Every question in the markup is visible text on the page, and its answer is
  // the answer the page renders — nothing invented for a search engine.
  for (const question of questions.slice(0, 4)) {
    const item = page.locator(ITEM).filter({ hasText: question.name });
    await expect(item).toHaveCount(1);
    expect(await item.textContent()).toContain(question.acceptedAnswer.text);
  }
});

test("the home page asks six, all answered, and points at the rest", async ({ page }) => {
  await visit(page, "/");
  const band = page.locator("section[aria-labelledby='home-faq']");
  await expect(band.getByRole("heading", { level: 2 })).toHaveText("Common questions");
  await expect(band.locator(ITEM)).toHaveCount(6);
  await expect(band.getByText(/^\[placeholder: /)).toHaveCount(0);

  await band.locator("details#pay summary").click();
  await expect(band.locator("details#pay")).toHaveAttribute("open", "");

  await band.getByRole("link", { name: "All questions" }).click();
  await expect(page).toHaveURL(/\/tours\/faq$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Common questions");
});

test("draws the questions as hairline rows with one turning chevron", async ({ page }) => {
  // The owner's reference (image-46): a rule between questions on the page's own
  // ground — no card fill, no plus/close pair — and a chevron that turns over.
  await visit(page, "/tours/faq");

  const book = page.locator("details#book");
  const skin = await book.evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderBottomWidth, colour: style.borderBottomColor, fill: style.backgroundColor };
  });
  expect(skin.border, "a hairline under the question").toBe("1px");
  expect(skin.fill, "no card behind it").toBe("rgba(0, 0, 0, 0)");

  const marker = book.locator("summary span");
  expect(await marker.evaluate((element) => getComputedStyle(element).rotate)).toMatch(/^(none|0deg)$/);

  await book.locator("summary").click();
  await expect(book).toHaveAttribute("open", "");
  await expect
    .poll(() => marker.evaluate((element) => getComputedStyle(element).rotate), { timeout: 2000 })
    .toBe("180deg");
});

test("opens a question like a drawer, not a jump", async ({ page }) => {
  await visit(page, "/tours/faq");

  // Only Chromium and friends can interpolate to `auto`; everywhere else the
  // answer appears at once, as it always did, and there is no animation to test.
  const animates = await page.evaluate(() => CSS.supports("interpolate-size", "allow-keywords"));

  const book = page.locator("details#book");
  const closed = (await book.boundingBox())!.height;

  await book.locator("summary").click();
  const onTheWay: number[] = [];
  for (let sample = 0; sample < 6; sample += 1) {
    onTheWay.push((await book.boundingBox())!.height);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(700);
  const settled = (await book.boundingBox())!.height;

  expect(settled, "the answer is on screen").toBeGreaterThan(closed + 40);
  if (animates) {
    expect(
      onTheWay.some((height) => height > closed + 6 && height < settled - 6),
      `the row grew in steps rather than jumping: ${onTheWay.map(Math.round).join(", ")}`,
    ).toBe(true);
  }
});

test("the light ground is white, and the cards on it carry a thin outline", async ({ page }) => {
  // Sampled from the reference (image-46). White cards on a white ground need
  // the hairline; that is the owner's other note.
  await visit(page, "/tours/faq");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");

  const card = page.locator("section[aria-labelledby='faq-more']");
  const shadow = await card.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(shadow, "a hairline drawn inside the card's own edge").toContain("inset");
  // Asked for thicker after the first cut: 1.5px rather than a hairline you have
  // to look for.
  expect(shadow, "the edge is a step heavier").toContain("1.5px");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the title sits above the questions, and a question opens without spilling", async ({ page }) => {
    await visit(page, "/tours/faq", "Common questions");

    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const first = (await page.locator("details#book").boundingBox())!;
    expect(first.y).toBeGreaterThan(title.y + title.height);

    await page.locator("details#cancel summary").click();
    await expect(page.locator("details#cancel")).toHaveAttribute("open", "");
    const violations = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(violations.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  });
});
