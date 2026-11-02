import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { checkA11y, visit } from "./fixtures";

/**
 * The landing fan, at phone width and at desktop width.
 *
 * Clicks go through the keyboard (focus, then Enter) rather than the pointer:
 * every wedge is a full-size button clipped into a slice, so a click at the
 * centre of its box lands where two wedges meet. Enter is also one of the ways
 * the handoff requires the fan to open, so this covers that path too.
 *
 * The browser is told to prefer reduced motion, so nothing waits on a 450ms
 * fold: the panel is in place as soon as the state changes.
 */
test.use({ reducedMotion: "reduce" });

/**
 * A place's panel, inside the hero.
 *
 * Scoped to `#place-detail`: the "Places to start" panels further down the page
 * name the same places (and quote the same lines about them) in their closed,
 * inert regions, so an unscoped role or text lookup matches two elements.
 */
// `exact`: the map under the card is a region whose name starts with the place's.
const panel = (page: import("@playwright/test").Page, name: string) =>
  page.locator("#place-detail").getByRole("region", { name, exact: true });

const inPanel = (page: import("@playwright/test").Page) => page.locator("#place-detail");

/**
 * The alpha of a computed colour, whatever shape the browser serialises it in.
 *
 * An 80% fill can come back as `rgba(2, 6, 24, 0.8)`, `color(srgb … / 0.8)`,
 * `oklab(… / 0.8)` or still as `color-mix(in oklab, rgb(…) 80%, transparent)` —
 * which one depends on the browser, so read all of them rather than guess.
 */
function alphaOf(value: string): number {
  const text = value.trim();
  if (text === "transparent") return 0;
  const slash = text.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
  const parts = text.match(/^rgba?\(([^)]*)\)$/)?.[1].split(/[,\s]+/).filter(Boolean) ?? [];
  if (parts.length === 4) return Number(parts[3]);
  if (parts.length === 3) return 1;
  const mix = text.match(/([\d.]+)%\s*,?\s*transparent\s*\)?$/);
  if (mix) return Number(mix[1]) / 100;
  return 1;
}

/** Where the header is and how it looks, plus where the hero starts. */
async function readHeader(page: import("@playwright/test").Page) {
  const header = await page.evaluate(() => {
    const header = document.querySelector("header") as HTMLElement;
    const hero = document.querySelector("section[aria-labelledby='home-title']") as HTMLElement;
    const brand = header.querySelector("a[href='/']") as HTMLElement;
    const style = getComputedStyle(header);

    return {
      top: Math.round(header.getBoundingClientRect().top),
      height: Math.round(header.getBoundingClientRect().height),
      background: style.backgroundColor,
      backdrop: style.backdropFilter,
      position: style.position,
      scrollY: Math.round(window.scrollY),
      heroTop: Math.round(hero.getBoundingClientRect().top),
      brandSize: parseFloat(getComputedStyle(brand).fontSize),
      color: style.color,
      shadow: style.boxShadow,
    };
  });
  return { ...header, alpha: alphaOf(header.background) };
}

type Spot = { x: number; y: number };

/**
 * A point inside the given wedge that currently hits a photo.
 *
 * Found by scanning, not by a fixed coordinate: the fan's point follows the
 * headline, so "250,450" is inside a different wedge — or below the point, on
 * the dark band — at different window sizes.
 */
async function spotInWedge(page: import("@playwright/test").Page, index: number) {
  const spot = await page.evaluate((index) => {
    const hero = document.querySelector("section[aria-labelledby='home-title']");
    if (!hero) return null;
    const box = hero.getBoundingClientRect();
    for (let y = box.top + 12; y < box.bottom - 12; y += 16) {
      for (let x = box.left + 12; x < box.right - 12; x += 16) {
        if (document.elementFromPoint(x, y)?.closest(`[data-wedge="${index}"]`)) return { x, y };
      }
    }
    return null;
  }, index);

  expect(spot, `a spot inside wedge ${index}`).not.toBeNull();
  return spot!;
}

test.describe("home fan on a phone", () => {
  test("shows six places, one per wedge", async ({ page }) => {
    await visit(page, "/");
    const fan = page.getByRole("group", { name: "Places in Daet" });

    await expect(fan.getByRole("button")).toHaveCount(6);
    await expect(page.getByRole("link", { name: "Find a tour" })).toHaveCount(0);
    await expect(page.getByText("Tap a place to see it")).toBeVisible();
  });

  test("mirrors its two fans about the headline", async ({ page }) => {
    await visit(page, "/");

    const hero = (await page.locator("section[aria-labelledby='home-title']").boundingBox())!;
    const header = (await page.locator("header").first().boundingBox())!;
    const headline = (await page.locator("[data-headline]").boundingBox())!;
    const tabBar = page.locator('nav[aria-label="Dashboard"]');
    const tabHeight = (await tabBar.count()) > 0 ? (await tabBar.first().boundingBox())!.height : 0;

    // Each wedge's clip-path starts at the point its fan radiates from, as a
    // percentage of the hero's box: the first three point up, the last three down.
    const apexes = await page.evaluate(() => {
      const apexOf = (element: Element) => {
        const match = /polygon\((-?[\d.]+)% (-?[\d.]+)%/.exec((element as HTMLElement).style.clipPath);
        return match ? Number(match[2]) : null;
      };
      const wedges = Array.from(document.querySelectorAll("[data-wedge]"));
      return { top: apexOf(wedges[0]), bottom: apexOf(wedges[3]) };
    });
    expect(apexes.top).not.toBeNull();
    expect(apexes.bottom).not.toBeNull();

    const topApex = hero.y + (apexes.top! / 100) * hero.height;
    const bottomApex = hero.y + (apexes.bottom! / 100) * hero.height;
    const foot = hero.y + hero.height - tabHeight;

    // The space above the text matches the space below it …
    const above = topApex - (header.y + header.height);
    const below = foot - bottomApex;
    expect(Math.abs(above - below), `fans ${above.toFixed(0)}px / ${below.toFixed(0)}px`).toBeLessThanOrEqual(2);

    // … and the text sits dead centre in the band they leave.
    const textMiddle = headline.y + headline.height / 2;
    expect(Math.abs(textMiddle - (topApex + bottomApex) / 2), "headline centred").toBeLessThanOrEqual(3);
  });

  test("opens a folded bar at the top of the phone, with the photo to itself", async ({ page }) => {
    await visit(page, "/");
    const wedge = page.getByRole("button", { name: "Bagasbas Beach: open photo and details" });

    await wedge.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    // Folded: the photo is the point on a phone, and the copy is one tap away.
    await expect(inPanel(page).getByText(/ten minutes from the plaza/)).toBeHidden();
    await expect(page).toHaveURL(/#place-bagasbas-beach/);

    // The map that used to sit at the foot of the screen is gone, and the card
    // has moved from the left edge to the middle.
    await expect(page.locator("[data-place-map]")).toHaveCount(0);
    const viewport = page.viewportSize()!;
    const card = (await page.locator("[data-detail]").boundingBox())!;
    expect(Math.abs(card.x + card.width / 2 - viewport.width / 2), "the card, centred").toBeLessThanOrEqual(2);
    expect(card.y - (await page.locator("header").first().boundingBox())!.height, "under the bar").toBeLessThan(40);

    await page.getByRole("button", { name: "Show the place's details" }).click();
    await expect(inPanel(page).getByText(/ten minutes from the plaza/)).toBeVisible();

    await checkA11y(page, "home, a place open");

    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/#place-/);
  });

  test("drags the open photo to look along it, without closing the place", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    const photo = page.locator("[data-wedge][aria-expanded='true'] img");
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    const before = await photo.evaluate((element) => (element as HTMLImageElement).style.objectPosition);
    const box = (await photo.boundingBox())!;

    // A landscape photo behind a portrait screen: the crop leaves room to pan.
    const room = await photo.evaluate((element) => {
      const image = element as HTMLImageElement;
      const scale = Math.max(image.clientWidth / image.naturalWidth, image.clientHeight / image.naturalHeight);
      return image.naturalWidth * scale - image.clientWidth;
    });
    expect(room, "photo to look along").toBeGreaterThan(100);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    const after = await photo.evaluate((element) => (element as HTMLImageElement).style.objectPosition);
    expect(after, "the crop moved along the photo").not.toBe(before);
    // Letting go of a drag is not a tap: the place stays open.
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    await expect(page).toHaveURL(/#place-bagasbas-beach/);
  });

  test("shows a hand over a newly opened photo, and puts it away once the photo is dragged", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    const hint = page.locator("[data-drag-hint]");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Drag to look around");

    const photo = page.locator("[data-wedge][aria-expanded='true'] img");
    const box = (await photo.boundingBox())!;
    // The drag starts on top of the hand: it must teach the gesture, not eat it.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect(hint).toHaveCount(0);

    // A visitor who has dragged one place knows how: the next one opens without the hand.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();
    await expect(hint).toHaveCount(0);
  });

  test("steps to the next place while open", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    await page.keyboard.press("ArrowRight");

    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();
    await expect(page).toHaveURL(/#place-first-rizal-monument/);
  });

  test("closes when the Back button takes the hash away", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page, "Bagasbas Beach")).toBeVisible();

    await page.goBack();

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveCount(0);
  });

  test("opens straight onto the place a shared link names", async ({ page }) => {
    await visit(page, "/#place-cathedral-most-holy-trinity");

    await expect(page.getByRole("heading", { level: 2, name: "Cathedral of the Most Holy Trinity" })).toBeVisible();
    await expect(inPanel(page).getByText("6 of 6")).toBeVisible();
  });

  test("shows the Tourism Office's own counts, not a placeholder", async ({ page }) => {
    await visit(page, "/");
    const band = page.locator("section[aria-labelledby='home-people']");

    await expect(band.getByText(/approved (operator|guide)s?/).first()).toBeVisible();
    await expect(band.getByText(/\[placeholder/)).toHaveCount(0);
  });

  test("butts the counts band against the blue band above it", async ({ page }) => {
    await visit(page, "/");

    const ask = await page.locator("section[aria-labelledby='home-ask']").boundingBox();
    const people = await page.locator("section[aria-labelledby='home-people']").boundingBox();
    expect(ask && people, "both bands are on the page").toBeTruthy();

    // The dark band used to sit a margin below the blue one, so a strip of page
    // background showed between two full-bleed colours. They should touch.
    expect(people!.y - (ask!.y + ask!.height), "no page showing between the bands").toBeLessThanOrEqual(1);
  });

  test("keeps a slim white bar at the top", async ({ page }) => {
    await visit(page, "/");

    const header = await readHeader(page);
    expect(header.height, "a phone header, not the 80px desktop bar").toBeLessThanOrEqual(57);
    expect(header.alpha, `white but see-through: ${header.background}`).toBeLessThan(1);
    expect(header.alpha, "still mostly white, so ink stays readable").toBeGreaterThanOrEqual(0.6);
    expect(header.heroTop, "the hero starts at the top of the page").toBeLessThanOrEqual(0);
  });

  test("hands off to the places below it", async ({ page }) => {
    await visit(page, "/");

    await expect(page.getByRole("heading", { level: 2, name: "Places to start" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Trips you can book" })).toBeVisible();
  });
});

test.describe("home fan on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("keeps the headline's links", async ({ page }) => {
    await visit(page, "/");

    await expect(page.getByRole("link", { name: "Find a tour" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask the travel guide" })).toBeVisible();
  });

  test("names a wedge when the mouse is over the fan", async ({ page }) => {
    await visit(page, "/");

    // A point inside a wedge, clear of the point where they all meet.
    const spot = await spotInWedge(page, 3);
    await page.mouse.move(spot.x, spot.y);

    await expect
      .poll(async () =>
        page.evaluate(() =>
          Math.max(...Array.from(document.querySelectorAll("[data-chip]")).map((chip) => Number(getComputedStyle(chip).opacity))),
        ),
      )
      .toBeGreaterThan(0.5);
  });

  test("opens the place as a card in the photo's top left, with the map under it, and folds on Escape", async ({ page }) => {
    await visit(page, "/");
    const wedge = page.getByRole("button", { name: "Bagasbas Beach: open photo and details" });

    await wedge.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    await expect(inPanel(page).getByRole("link", { name: "Open on the map" })).toHaveAttribute(
      "href",
      "#home-map",
    );
    await expect(page).toHaveURL(/#place-bagasbas-beach/);
    await checkA11y(page, "home, a place open, desktop");

    // As in the owner's markup (image-25): the card is in the photo's top left
    // corner, hanging off the page's own 7xl column, not a slab over the bottom.
    const hero = (await page.locator("section[aria-labelledby='home-title']").boundingBox())!;
    const card = (await page.locator("[data-detail]").boundingBox())!;
    const column = (await page.locator("#home-places").boundingBox())!.x;

    expect(Math.abs(card.x - column), "on the page's column").toBeLessThanOrEqual(1);
    expect(card.y - hero.y, "at the top of the photo, under the bar").toBeGreaterThanOrEqual(0);
    expect(card.y - hero.y, "at the top of the photo, under the bar").toBeLessThanOrEqual(110);
    expect(card.width, "a card, not a column").toBeLessThanOrEqual(320);

    // The ✕ and the floating arrows are gone: the ‹ › pair lives in the card's
    // own header, so the photo has nothing over it but the two panels.
    await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
    const next = (await page.getByRole("button", { name: "Next place" }).boundingBox())!;
    expect(next.x, "inside the card").toBeGreaterThanOrEqual(card.x);
    expect(next.x + next.width, "inside the card").toBeLessThanOrEqual(card.x + card.width + 1);
    expect(next.y + next.height, "inside the card").toBeLessThanOrEqual(card.y + card.height + 1);

    // The map sits under it, in the same column, and names what it is showing.
    const map = (await page.locator("[data-place-map]").boundingBox())!;
    expect(Math.abs(map.x - column), "in the same column as the card").toBeLessThanOrEqual(1);
    expect(map.y, "below the card").toBeGreaterThan(card.y + card.height);
    expect(hero.y + hero.height - (map.y + map.height), "its foot near the photo's").toBeLessThanOrEqual(80);
    await expect(page.locator("[data-place-map] [data-viewing]")).toHaveText(/Viewing\s+Bagasbas Beach/);

    // The map follows the ‹ › pair: the next place is what it is showing now.
    await page.getByRole("button", { name: "Next place" }).click();
    await expect(page.locator("[data-place-map] [data-viewing]")).toHaveText(/Viewing\s+First Rizal Monument/);
    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();

    // Folding keeps the name and the map, and gives the photo back its corner.
    const tall = (await page.locator("[data-detail]").boundingBox())!.height;
    await page.getByRole("button", { name: "Hide the place's details" }).click();
    await expect(page.getByRole("button", { name: "Show the place's details" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();
    const short = (await page.locator("[data-detail]").boundingBox())!.height;
    expect(short, "a folded bar").toBeLessThan(tall - 80);

    // The photo is the way out, along with Escape.
    await page.keyboard.press("Escape");

    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toHaveCount(0);
    await expect(wedge).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("[data-place-map]")).toHaveCount(0);
  });

  test("is a slim white scrim in light mode, and the dark one in dark mode", async ({ page }) => {
    await visit(page, "/");

    const light = await readHeader(page);
    expect(light.position, "pinned, not scrolled away").toBe("sticky");
    expect(light.top).toBe(0);
    expect(light.height, "slimmer than the 80px bar in the screenshot").toBeLessThanOrEqual(62);
    expect(light.brandSize, "a smaller wordmark than the 24px one").toBeLessThanOrEqual(20);
    expect(light.alpha, `a white scrim: ${light.background}`).toBeCloseTo(0.8, 2);
    expect(light.color, "ink on white").toBe("rgb(15, 23, 42)");
    expect(light.backdrop, "blurred behind the white scrim").toContain("blur");
    expect(light.shadow, "a subtle drop shadow under it").toContain("rgba(15, 23, 42, 0.08)");
    expect(light.heroTop, "the hero still starts at the top of the page").toBeLessThanOrEqual(0);

    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect.poll(async () => (await readHeader(page)).scrollY).toBeGreaterThan(1000);
    const scrolled = await readHeader(page);
    expect(scrolled.top, "still at the top of the screen").toBe(0);
    expect(scrolled.background, "same bar while scrolling").toBe(light.background);

    // Dark mode keeps the scrim the mock has, with the photos showing through.
    await page.addInitScript(() => localStorage.setItem("daet-theme", "dark"));
    await visit(page, "/");
    const dark = await readHeader(page);
    expect(dark.height, "the same size in either theme").toBeLessThanOrEqual(62);
    expect(dark.alpha, `the photos show through the scrim: ${dark.background}`).toBeLessThan(1);
    expect(dark.backdrop, "blurred behind the scrim").toContain("blur");
    expect(dark.color, "white on the scrim").toBe("rgb(255, 255, 255)");
    // Tailwind's shadow-none is a list of zero shadows, not the string "none".
    expect(dark.shadow, "no elevation on the scrim").not.toContain("rgba(15, 23, 42");
  });

  test("is a light page with an ink headline in light mode, ink with a white one in dark", async ({ page }) => {
    await visit(page, "/");

    /**
     * Colours as RGB, whatever the theme tokens serialise to. Tailwind v4 hands
     * some of them back as `lab(…)`, so the browser's own parser reads them.
     */
    const readHero = () =>
      page.evaluate(() => {
        const rgb = (value: string) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d")!;
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return [r, g, b];
        };

        const hero = document.querySelector("section[aria-labelledby='home-title']") as HTMLElement;
        const headline = document.getElementById("home-title") as HTMLElement;
        const guide = hero.querySelector("[data-headline] button") as HTMLElement | null;

        return {
          ground: rgb(getComputedStyle(hero).backgroundColor),
          headline: rgb(getComputedStyle(headline).color),
          guide: guide ? rgb(getComputedStyle(guide).color) : null,
        };
      });

    /** Both channels of an RGB triple, give or take a rounding step. */
    const isNear = (actual: number[], expected: number[]) =>
      expected.every((channel, i) => Math.abs((actual[i] ?? 0) - channel) <= 2);

    const light = await readHero();
    expect(isNear(light.ground, [248, 250, 252]), "the page's own ground, no dark band").toBe(true);
    expect(isNear(light.headline, [15, 23, 42]), "ink on it").toBe(true);
    // White-on-white was the bug in the mock: this button has to carry ink here.
    expect(isNear(light.guide ?? [], [15, 23, 42]), "the guide button keeps an edge on light").toBe(true);

    await page.addInitScript(() => localStorage.setItem("daet-theme", "dark"));
    await visit(page, "/");

    const dark = await readHero();
    expect(isNear(dark.ground, [15, 23, 42]), "the dark ground the fan had").toBe(true);
    expect(isNear(dark.headline, [255, 255, 255]), "white on it").toBe(true);
  });

  test("takes 'Open on the map' to the map, leaving the place open", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    await page.getByRole("link", { name: "Open on the map" }).click();

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    // The hash still holds the place, so scrolling back up finds it open.
    await expect(page).toHaveURL(/#place-bagasbas-beach/);
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
  });

  test("never scrolls sideways", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("the open place", () => {
  // Motion on: the file's own default is `reduce`, which settles every shape
  // instantly and so never exercises the fold-in that fills the screen.
  test.use({ reducedMotion: "no-preference", viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false });

  test("keeps the open photo covering the hero, while it opens and after it settles", async ({ page }) => {
    await visit(page, "/");

    /** The photo's box against the hero's, in pixels, plus what is moving it. */
    const measure = () =>
      page.evaluate(() => {
        const box = (element: Element | null | undefined) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        };
        const hero = document.querySelector("section[aria-labelledby='home-title']");
        const wedge = document.querySelector("[data-wedge][aria-expanded='true']");
        const photo = wedge?.querySelector("[data-photo]");
        const nudge = wedge?.querySelector("[data-nudge]");
        const img = wedge?.querySelector("img");
        const group = hero?.querySelector("[role='group']");
        const transform = (element: Element | null | undefined) =>
          element ? getComputedStyle(element).transform : null;

        return {
          scrollY: Math.round(window.scrollY),
          hero: box(hero),
          img: box(img),
          clip: (wedge as HTMLElement | null)?.style.clipPath ?? null,
          transforms: {
            hero: transform(hero),
            group: transform(group),
            photo: transform(photo),
            nudge: transform(nudge),
          },
        };
      });

    const gapsIn = (state: Awaited<ReturnType<typeof measure>>) => {
      const { hero, img } = state;
      if (!hero || !img) return ["the place is not open"];
      return (
        [
          ["top", img.y - hero.y],
          ["left", img.x - hero.x],
          ["right", hero.x + hero.w - (img.x + img.w)],
          ["bottom", hero.y + hero.h - (img.y + img.h)],
        ] as const
      )
        .filter(([, gap]) => gap > 1)
        .map(([edge, gap]) => `${edge} ${Math.round(gap)}px`);
    };

    await page.getByRole("button", { name: "Calaguas: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    // Mid fold-in the wedge is still growing, so only the settled state is
    // judged — but it has to stay put once it is there.
    await page.waitForTimeout(1200);
    const settled = await measure();

    // Nothing else may move it afterwards: a hover that lands late used to zoom
    // the photo up to 1.15 while it was on screen.
    await page.mouse.move(4, 4);
    await page.waitForTimeout(800);
    const afterPointer = await measure();

    // And it has to stay full-bleed with the page nudged, where the scroll fold
    // used to lift the fan and uncover a band along the bottom edge.
    await page.evaluate(() => window.scrollTo(0, 80));
    await page.waitForTimeout(800);
    const afterScroll = await measure();

    // And it is still the same box a few seconds later, with nothing moving it.
    await page.waitForTimeout(2500);
    const late = await measure();

    const problems = [
      ...gapsIn(settled).map((gap) => `on open: ${gap}`),
      ...gapsIn(afterPointer).map((gap) => `after the pointer left: ${gap}`),
      ...gapsIn(afterScroll).map((gap) => `after scrolling 80px: ${gap}`),
      ...gapsIn(late).map((gap) => `a few seconds later: ${gap}`),
      // A photo that keeps changing size while the visitor looks at it is a bug
      // of its own: the box has to be the same one it settled on.
      ...(late.img && settled.img && (Math.abs(late.img.w - settled.img.w) > 1 || Math.abs(late.img.h - settled.img.h) > 1)
        ? [`the photo changed size on its own: ${settled.img.w}x${settled.img.h} then ${late.img.w}x${late.img.h}`]
        : []),
    ];

    expect(problems, JSON.stringify({ settled, afterPointer, afterScroll, late }, null, 1)).toEqual([]);
  });
});

/**
 * The fan with motion on.
 *
 * The suite above runs with `prefers-reduced-motion: reduce`, which skips every
 * shape morph, so nothing has ever animated a wedge's `clip-path` in a test.
 * These do, at desktop width, and they are the tests that catch a fan that
 * comes apart mid-hover, a name tag that sticks, and a hero that doesn't fit.
 */
test.describe("home fan, motion on", () => {
  test.use({
    reducedMotion: "no-preference",
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  /** A 12 × 6 grid of pointer spots across the hero, kept off its edges. */
  const gridAcrossHero = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const hero = document.querySelector("section[aria-labelledby='home-title']");
      if (!hero) return [];
      const box = hero.getBoundingClientRect();
      const left = box.left + 8;
      const right = box.right - 8;
      const top = box.top + 8;
      const bottom = box.bottom - 8;
      const spots: { x: number; y: number }[] = [];
      for (let column = 0; column < 12; column += 1) {
        for (let row = 0; row < 6; row += 1) {
          spots.push({
            x: Math.round(left + ((right - left) * (column + 0.5)) / 12),
            y: Math.round(top + ((bottom - top) * (row + 0.5)) / 6),
          });
        }
      }
      return spots;
    });

  /** The spots where a photo is what the visitor would hit, right now. */
  const photoSpots = (page: import("@playwright/test").Page, spots: Spot[]) =>
    page.evaluate(
      (spots) =>
        spots.filter((spot) => Boolean(document.elementFromPoint(spot.x, spot.y)?.closest("[data-wedge]"))),
      spots,
    );

  /**
   * What share of the photo spots are still a wedge, and where the rest went.
   *
   * Not a strict 100%: the wedges are separated by 3px seams on purpose, so a
   * spot that happens to sit on one reaches the section behind it — at rest as
   * well as mid-hover, and only ever a handful of them. A fan tearing itself
   * apart loses about half.
   */
  const coverage = (page: import("@playwright/test").Page, spots: Spot[]) =>
    page.evaluate((spots) => {
      // Each spot is a 9px cross, so landing on a seam — which moves as the
      // wedges widen — doesn't read as a hole. A tear is hundreds of pixels.
      const reach = [0, -4, 4];
      const onPhoto = (spot: Spot) =>
        reach.some((dy) =>
          reach.some((dx) => Boolean(document.elementFromPoint(spot.x + dx, spot.y + dy)?.closest("[data-wedge]"))),
        );

      const lost = spots.filter((spot) => !onPhoto(spot));
      return {
        share: spots.length ? (spots.length - lost.length) / spots.length : 1,
        lost: lost.map((spot) => `${spot.x},${spot.y}`).slice(0, 6),
      };
    }, spots);

  const clipPathOf = (page: import("@playwright/test").Page, index: number) =>
    page.evaluate((index) => {
      const wedge = document.querySelector<HTMLElement>(`[data-wedge="${index}"]`);
      return wedge?.style.clipPath ?? "";
    }, index);

  /** Which name tags a visitor can see right now, by wedge index. */
  const tagsOnShow = (page: import("@playwright/test").Page) =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-chip]"))
        .filter((chip) => {
          const style = getComputedStyle(chip);
          return style.visibility !== "hidden" && Number(style.opacity) > 0.5;
        })
        .map((chip) => Number(chip.dataset.chip)),
    );

  test("keeps the fan whole while a wedge is hovered", async ({ page }) => {
    await visit(page, "/");

    const photos = await photoSpots(page, await gridAcrossHero(page));
    expect(photos.length, "spots that start on a photo").toBeGreaterThan(20);

    // Where each wedge is, so the hover can be aimed at one rather than guessed.
    const inWedge = (index: number) =>
      page.evaluate(
        ({ photos, index }) =>
          photos.find((spot) =>
            Boolean(document.elementFromPoint(spot.x, spot.y)?.closest(`[data-wedge="${index}"]`)),
          ) ?? null,
        { photos, index },
      );

    for (const index of [0, 3]) {
      const spot = await inWedge(index);
      expect(spot, `a spot inside wedge ${index}`).not.toBeNull();

      const before = await clipPathOf(page, index);
      await page.mouse.move(spot!.x, spot!.y, { steps: 4 });

      // 100ms and 175ms land mid-morph; 400ms is after the 350ms hover tween.
      let elapsed = 0;
      for (const at of [100, 175, 400]) {
        await page.waitForTimeout(at - elapsed);
        elapsed = at;
        const { share, lost } = await coverage(page, photos);
        expect(share, `the fan came apart ${at}ms into hovering wedge ${index}; lost ${lost.join(" ")}`).toBeGreaterThanOrEqual(
          0.95,
        );
      }

      expect(await clipPathOf(page, index), `wedge ${index} widened`).not.toBe(before);
    }
  });

  test("fits under the header at every size the owner checked", async ({ page }) => {
    await visit(page, "/");

    const sizes = [
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 1920, height: 994 },
    ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(250);
      const label = `${size.width}x${size.height}`;

      const fit = await page.evaluate(() => {
        const hero = document.querySelector("section[aria-labelledby='home-title']") as HTMLElement;
        const title = document.getElementById("home-title") as HTMLElement;
        const heroBox = hero.getBoundingClientRect();

        // The fan's point is the apex of its first wedge, in percentages of the
        // hero's own box — so read it back rather than trusting a formula.
        const apex = (document.querySelector("[data-wedge]") as HTMLElement).style.clipPath.match(
          /^polygon\(\s*(-?[\d.]+)%\s+(-?[\d.]+)%/,
        );
        const apexY = apex ? heroBox.top + (Number(apex[2]) / 100) * heroBox.height : Number.NaN;

        const buttons = Array.from(
          document.querySelectorAll<HTMLElement>("[data-headline] a, [data-headline] button"),
        ).filter((element) => element.getClientRects().length > 0);

        return {
          apexY,
          titleTop: title.getBoundingClientRect().top,
          heroBottom: heroBox.bottom,
          buttonBottoms: buttons.map((button) => button.getBoundingClientRect().bottom),
          viewportHeight: window.innerHeight,
        };
      });

      expect(fit.heroBottom, `${label}: the hero ends at the fold`).toBeLessThanOrEqual(
        fit.viewportHeight + 1,
      );
      expect(fit.titleTop, `${label}: the headline sits under the fan's point`).toBeGreaterThanOrEqual(
        fit.apexY - 1,
      );
      expect(fit.buttonBottoms.length, `${label}: both buttons are showing`).toBeGreaterThanOrEqual(2);
      fit.buttonBottoms.forEach((bottom) =>
        expect(bottom, `${label}: a button is cut off by the fold`).toBeLessThanOrEqual(
          fit.viewportHeight - 16,
        ),
      );
    }
  });

  test("keeps the assistant pill off the hero's own buttons", async ({ page }) => {
    await visit(page, "/");
    const pill = page.getByRole("button", { name: "Daet AI assistant" });

    // The headline has "Ask the travel guide"; a floating duplicate would sit
    // on top of it.
    await expect(pill).toBeHidden();
    await expect(page.getByRole("button", { name: "Ask the travel guide" })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.2));
    await expect(pill).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(pill).toBeHidden();
  });

  test("keeps the hero full-bleed as it folds away", async ({ page }) => {
    await visit(page, "/");

    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500);

    const fold = await page.evaluate(() => {
      const hero = document.querySelector("section[aria-labelledby='home-title']") as HTMLElement;
      const headline = hero.querySelector("[data-headline]") as HTMLElement;
      return {
        heroWidth: hero.getBoundingClientRect().width,
        heroTransform: getComputedStyle(hero).transform,
        headlineOpacity: Number(getComputedStyle(headline).opacity),
        viewportWidth: window.innerWidth,
      };
    });

    // No shrunken card with white margins: the section keeps the screen's width.
    expect(fold.heroTransform).toBe("none");
    expect(Math.round(fold.heroWidth)).toBe(fold.viewportWidth);
    // …and the parts inside it are the things that move.
    expect(fold.headlineOpacity).toBeLessThan(1);
  });

  test("reveals a band once, then leaves it fully readable", async ({ page }) => {
    await visit(page, "/");

    const opacityOf = (selector: string) =>
      page.evaluate(
        (selector) => Number(getComputedStyle(document.querySelector(selector) as HTMLElement).opacity),
        selector,
      );

    await page.evaluate(() =>
      document.querySelector("#home-how")?.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await page.waitForTimeout(600);

    // The reveal is one 300ms step, not a scroll-linked gradient: by the time
    // the band is being read, it is fully opaque.
    expect(await opacityOf("#home-how")).toBe(1);

    // …and it stays revealed. Scrolling past it and back must not fade it again.
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(300);
    await page.evaluate(() =>
      document.querySelector("#home-how")?.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await page.waitForTimeout(300);
    expect(await opacityOf("#home-how")).toBe(1);

    const results = await new AxeBuilder({ page })
      .include("#home-how")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      serious.map((violation) => `${violation.id} (${violation.impact})`),
      "the steps band",
    ).toEqual([]);
  });

  test("shows one name tag, for the wedge under the mouse or the keyboard", async ({ page }) => {
    await visit(page, "/");

    // Nothing hovered, nothing focused: no tag at all.
    expect(await tagsOnShow(page)).toEqual([]);

    const spot = await spotInWedge(page, 2);
    await page.mouse.move(spot.x, spot.y, { steps: 4 });

    await expect.poll(() => tagsOnShow(page)).toEqual([2]);

    // Off the fan — onto the header, which sits above the hero — and the tag
    // has to go with it rather than stick to the last wedge it saw.
    await page.mouse.move(640, 8);
    await page.waitForTimeout(300);
    expect(await tagsOnShow(page)).toEqual([]);

    // A keyboard visitor gets the same name, from focus alone.
    let focused = -1;
    for (let press = 0; press < 24 && focused < 0; press += 1) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() => {
        const active = document.activeElement;
        const wedge = active?.closest?.("[data-wedge]") as HTMLElement | null;
        return wedge ? Number(wedge.dataset.wedge) : -1;
      });
    }

    expect(focused, "a wedge reached by Tab").toBeGreaterThanOrEqual(0);
    await expect.poll(() => tagsOnShow(page)).toEqual([focused]);
  });
});
