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
  const parts =
    text
      .match(/^rgba?\(([^)]*)\)$/)?.[1]
      .split(/[,\s]+/)
      .filter(Boolean) ?? [];
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
    const wedge = page.getByRole("button", {
      name: "Bagasbas Beach: open photo and details",
    });

    await wedge.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    // Folded: the photo is the point on a phone, and the copy is one tap away.
    await expect(inPanel(page).getByText(/ten minutes from the plaza/)).toBeHidden();
    await expect(page).toHaveURL(/#place-bagasbas-beach/);

    // The way out at the photo's top right is a desktop's: a phone has its folded
    // bar at the top and a tap on the photo itself.
    await expect(page.getByRole("button", { name: "Back to the fan" })).toHaveCount(0);

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
    // Slow on purpose: a quick drag is a flick now, and a flick steps on. A
    // visitor who takes their time is looking along the photo, not turning a page.
    for (let step = 1; step <= 7; step += 1) {
      await page.mouse.move(box.x + box.width / 2 - step * 10, box.y + box.height / 2);
      await page.waitForTimeout(90);
    }
    await page.mouse.up();

    const after = await photo.evaluate((element) => (element as HTMLImageElement).style.objectPosition);
    expect(after, "the crop moved along the photo").not.toBe(before);
    // Letting go of a slow drag is neither a tap nor a flick: the place stays open.
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    await expect(page).toHaveURL(/#place-bagasbas-beach/);
  });

  test("coaches the gestures over a newly opened photo, and puts them away once it is flicked", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    const coach = page.locator("[data-gesture-hints]");
    await expect(coach).toBeVisible();
    // A phone is told to tap, because it has no double-click.
    for (const line of ["Drag to look around", "Flick left or right to step", "Tap the photo to go back"]) {
      await expect(coach).toContainText(line);
    }

    const photo = page.locator("[data-wedge][aria-expanded='true'] img");
    const box = (await photo.boundingBox())!;
    // The flick starts on top of the coaching: it must teach the gesture, not eat it.
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2);
    await page.mouse.up();

    // A quick sideways flick turns the page, and the coaching goes with it.
    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();
    await expect(page).toHaveURL(/#place-first-rizal-monument/);
    await expect(coach).toHaveCount(0);

    // A visitor who has flicked one place knows how: the next one opens without it.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { level: 2, name: "Daet Heritage Center" })).toBeVisible();
    await expect(coach).toHaveCount(0);
  });

  test("steps to the next place while open", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    await page.keyboard.press("ArrowRight");

    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();
    await expect(page).toHaveURL(/#place-first-rizal-monument/);
  });

  test("scrolls away from an open place and finds the page's own text under it", async ({ page }) => {
    // What the owner photographed (image-41): a photo clicked, then a scroll —
    // and a screen of bare canvas under the hero, with no text on it anywhere.
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(inPanel(page)).toBeVisible();

    // A wheel over an open photo is someone leaving the hero: it closes, and the
    // page scrolls as it normally would.
    await page.mouse.move(900, 500);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.scrollY), "the page scrolled").toBeGreaterThan(400);

    // Anything at the fold has to be readable. A section the reveal never marked
    // is `opacity: 0` under `html.js` — invisible for the life of the page.
    const stranded = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-reveal]:not([data-revealed])"))
        .filter((element) => element.getBoundingClientRect().top < window.innerHeight * 0.9)
        .map((element) => element.id || element.textContent?.slice(0, 40) || element.tagName),
    );
    expect(stranded, "sections at the fold left hidden").toEqual([]);

    const heading = page.getByRole("heading", { level: 2, name: "Places to start" });
    await expect(heading).toBeVisible();
    expect(
      await page.evaluate(() => Number(getComputedStyle(document.querySelector("#home-places") as HTMLElement).opacity)),
      "readable, not a ghost",
    ).toBe(1);
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

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Cathedral of the Most Holy Trinity",
      }),
    ).toBeVisible();
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

/**
 * A colour as sRGB bytes, whatever shape the browser serialises it in.
 *
 * A theme token can come back as `rgb(…)`, `oklch(…)` or `color(srgb …)`.
 * Painting one pixel onto a canvas normalises all of them; the glass behind
 * the hero is a photo, so the check is against the page ground underneath.
 */
type Rgba = [number, number, number, number];

/**
 * A computed colour as sRGB bytes, whatever shape the browser serialised it
 * in: `rgb(…)`, `oklch(…)` or `color(srgb …)` all normalise to one pixel on a
 * canvas, which also tells us the alpha.
 */
async function paint(locator: import("@playwright/test").Locator, property: "color" | "backgroundColor"): Promise<Rgba> {
  return locator.evaluate(
    (element, name) => {
      const canvas = document.createElement("canvas").getContext("2d")!;
      canvas.fillStyle = getComputedStyle(element)[name];
      canvas.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a] as [number, number, number, number];
    },
    property,
  );
}

/**
 * The label's colour and the colour it sits on: the button's own fill when it
 * has one, otherwise the page ground showing through it.
 */
async function labelAndGround(locator: import("@playwright/test").Locator, page: import("@playwright/test").Page) {
  const [fg, bg] = await Promise.all([paint(locator, "color"), paint(locator, "backgroundColor")]);
  return {
    fg: fg.slice(0, 3) as [number, number, number],
    bg: bg[3] === 0 ? await ground(page) : (bg.slice(0, 3) as [number, number, number]),
  };
}

async function ground(page: import("@playwright/test").Page): Promise<[number, number, number]> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d")!;
    canvas.fillStyle = getComputedStyle(document.body).backgroundColor;
    canvas.fillRect(0, 0, 1, 1);
    const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  });
}

/** WCAG contrast ratio between two colours. */
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const luminance = ([r, g, bl]: [number, number, number]) => {
    const channel = (value: number) => {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test.describe("home fan on a desktop", () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test("keeps the headline's links", async ({ page }) => {
    await visit(page, "/");

    await expect(page.getByRole("link", { name: "Find a tour" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask the travel guide" })).toBeVisible();
  });

  test("the hero's buttons read on the pale ground, in both themes", async ({ browser }) => {
    // The outline button was `onBlue`: white label, white ring, on a near-white
    // hero — so the second button's label vanished in light mode until hover.
    // It is `onHeader` now (ink in light, white in dark). The signed-in
    // "My dashboard" is the same variant; place-fan.test.tsx pins that one.
    for (const colorScheme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme });
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "networkidle" });

      const labels = [
        page.getByRole("link", { name: "Find a tour", exact: true }),
        page.getByRole("button", { name: "Ask the travel guide", exact: true }),
      ];
      for (const label of labels) {
        await expect(label).toBeVisible();
        // A filled button is judged against its own blue; an outline button
        // against the hero's pale ground, which is what used to swallow it.
        const { fg, bg } = await labelAndGround(label, page);
        expect(contrast(fg, bg), `${await label.textContent()} on the ${colorScheme} hero`).toBeGreaterThanOrEqual(4.5);
      }
      await context.close();
    }
  });

  test("names a wedge when the mouse is over the fan", async ({ page }) => {
    await visit(page, "/");

    // A point inside a wedge, clear of the point where they all meet.
    const spot = await spotInWedge(page, 3);
    await page.mouse.move(spot.x, spot.y);

    await expect
      .poll(async () =>
        page.evaluate(() =>
          Math.max(
            ...Array.from(document.querySelectorAll("[data-chip]")).map((chip) =>
              Number(getComputedStyle(chip).opacity),
            ),
          ),
        ),
      )
      .toBeGreaterThan(0.5);
  });

  test("opens the place into the sketch's three cards over its photo, and folds on Escape", async ({ page }) => {
    await visit(page, "/");
    const wedge = page.getByRole("button", {
      name: "Bagasbas Beach: open photo and details",
    });

    await wedge.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    await expect(inPanel(page).getByRole("link", { name: "Open on the map" })).toHaveAttribute("href", "#home-map");
    await expect(page).toHaveURL(/#place-bagasbas-beach/);
    await checkA11y(page, "home, a place open, desktop");

    // The owner's sketch (image-30): the map card leads, on the page's own column;
    // the place's own card stands beside it; the Fun fact card sits under that.
    const hero = (await page.locator("section[aria-labelledby='home-title']").boundingBox())!;
    const map = (await page.locator("[data-place-map]").boundingBox())!;
    const card = (await page.locator("[data-detail]").boundingBox())!;
    const fun = (await page.locator("[data-fun-fact]").boundingBox())!;
    const column = (await page.locator("#home-places").boundingBox())!.x;

    // The owner asked for the cards flush to the left of the photo, off the page's
    // centred column (image-31), so the map card hugs the viewport's left edge.
    expect(map.x, "flush to the left edge").toBeLessThanOrEqual(24);
    expect(map.x, "nearer the edge than the page's column").toBeLessThan(column);
    expect(map.y - hero.y, "at the top of the photo, under the bar").toBeGreaterThanOrEqual(0);
    expect(map.y - hero.y, "at the top of the photo, under the bar").toBeLessThanOrEqual(110);
    expect(map.width, "a card, not a column").toBeLessThanOrEqual(420);

    expect(card.x, "the place card beside the map, to its right").toBeGreaterThan(map.x + map.width - 1);
    expect(Math.abs(card.y - map.y), "their tops line up").toBeLessThanOrEqual(2);
    expect(fun.x, "the Fun fact card under the place card").toBeGreaterThan(map.x + map.width - 1);
    expect(fun.y, "below the place card").toBeGreaterThan(card.y + card.height - 1);

    // The map card shows the place's own photo and name over the pins.
    await expect(page.locator("[data-map-place]")).toContainText("Bagasbas Beach");
    // Leaflet paints its panes inside the map at z-index 200–800; the card pinned
    // to the place has to sit above all of them to be seen at all.
    expect(
      await page.locator("[data-map-place]").evaluate((element) => Number(getComputedStyle(element).zIndex)),
      "over the map's own panes",
    ).toBeGreaterThanOrEqual(800);

    // What shows through in the moment before a tile arrives is OpenStreetMap's own
    // land colour, not the page's near-white — and the tiles do not fade in from it.
    const ground = await page
      .locator("[data-place-map] [role='region']")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(ground, "the map's own ground").toBe("rgb(242, 239, 233)");
    expect(
      await page.locator("[data-place-map] .leaflet-container").evaluate((element) => element.className),
      "no tile fade-in",
    ).not.toContain("leaflet-fade-anim");
    await expect(page.locator("[data-place-map] [data-viewing]")).toHaveText(/Viewing\s+Bagasbas Beach/);

    // The way out sits at the photo's top right, on the image itself.
    const back = page.getByRole("button", { name: "Back to the fan" });
    await expect(back).toBeVisible();
    const backBox = (await back.boundingBox())!;
    expect(hero.x + hero.width - (backBox.x + backBox.width), "at the photo's right edge").toBeLessThanOrEqual(32);
    expect(backBox.y - hero.y, "under the header").toBeLessThanOrEqual(110);

    // The ✕ and the floating arrows are gone: the ‹ › pair lives in the card's
    // own header, so the photo has nothing over it but these cards.
    await expect(page.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
    const next = (await page.getByRole("button", { name: "Next place" }).boundingBox())!;
    expect(next.x, "inside the card").toBeGreaterThanOrEqual(card.x);
    expect(next.x + next.width, "inside the card").toBeLessThanOrEqual(card.x + card.width + 1);
    expect(next.y + next.height, "inside the card").toBeLessThanOrEqual(card.y + card.height + 1);

    // The map follows the ‹ › pair: the next place is what it is showing now.
    await page.getByRole("button", { name: "Next place" }).click();
    await expect(page.locator("[data-place-map] [data-viewing]")).toHaveText(/Viewing\s+First Rizal Monument/);
    await expect(page.locator("[data-map-place]")).toContainText("First Rizal Monument");
    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();

    // Folding keeps the name and the map, and gives the photo back its room.
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

  test("goes back to the fan from the button at the photo's top right", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();

    await page.getByRole("button", { name: "Back to the fan" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/#place-/);
    await expect(page.locator("[data-wedge][aria-expanded='true']")).toHaveCount(0);
    await expect(page.locator("[data-detail]")).toHaveCount(0);
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
  test.use({
    reducedMotion: "no-preference",
    viewport: { width: 1920, height: 1080 },
    isMobile: false,
    hasTouch: false,
  });

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
      ...(late.img &&
      settled.img &&
      (Math.abs(late.img.w - settled.img.w) > 1 || Math.abs(late.img.h - settled.img.h) > 1)
        ? [`the photo changed size on its own: ${settled.img.w}x${settled.img.h} then ${late.img.w}x${late.img.h}`]
        : []),
    ];

    expect(problems, JSON.stringify({ settled, afterPointer, afterScroll, late }, null, 1)).toEqual([]);
  });

  test("folds the photo away with the exit animation, even after stepping twice", async ({ page }) => {
    await visit(page, "/");

    // The shape this wedge settles on with the keyboard on it, which is where
    // the fold has to come all the way back to: a close hands focus to the wedge
    // it came from, and focus widens the slice.
    const wedge = page.getByRole("button", { name: "Calaguas: open photo and details" });
    await wedge.focus();
    await page.waitForTimeout(600);
    const restClip = await wedge.evaluate((element) => (element as HTMLElement).style.clipPath);
    expect(restClip).toContain("polygon");

    await page.keyboard.press("Enter");
    await expect(inPanel(page)).toBeVisible();
    await page.waitForTimeout(900);

    // Two steps. A step is a swipe of two photos, and it kills the timeline that
    // opened the place — which left the ✕ with nothing to reverse, so the fan
    // snapped back with no animation at all. The owner stepped twice and filmed
    // exactly that.
    const next = page.getByRole("button", { name: "Next place" });
    await next.click();
    await next.click();
    await page.waitForTimeout(900);

    const handle = await page.locator("[data-wedge][aria-expanded='true']").elementHandle();
    expect(handle, "the stepped-to photo is the open one").not.toBeNull();

    /** The open wedge's clip, and the headline's fade, as they are right now. */
    const read = () =>
      handle!.evaluate((element) => ({
        clip: (element as HTMLElement).style.clipPath,
        headline: Number(getComputedStyle(document.querySelector("[data-headline]") as HTMLElement).opacity),
      }));

    const openShape = await read();
    expect(openShape.clip, "the photo fills the hero while it is open").not.toBe(restClip);
    expect(openShape.headline, "the headline is behind it").toBe(0);

    await page.getByRole("button", { name: "Back to the fan" }).click();

    // Part way through: the wedge is neither the hero nor its own slice, and the
    // headline is neither gone nor back. A snap would have finished already.
    await page.waitForTimeout(150);
    const midFlight = await read();
    expect(midFlight.clip, "still folding, not already back").not.toBe(restClip);
    expect(midFlight.clip, "and no longer the whole hero").not.toBe(openShape.clip);
    expect(midFlight.headline, "the headline is coming back, not back yet").toBeLessThan(1);

    // And it does land: the fan is its own shape again, with nothing mid-flight
    // left behind.
    // Long enough for the fold to land and for focus to widen the slice again.
    await page.waitForTimeout(1400);
    const after = await read();
    expect(after.clip, "the wedge is back in the fan").toBe(restClip);
    expect(after.headline, "the headline is back").toBe(1);
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
      (spots) => spots.filter((spot) => Boolean(document.elementFromPoint(spot.x, spot.y)?.closest("[data-wedge]"))),
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
        expect(
          share,
          `the fan came apart ${at}ms into hovering wedge ${index}; lost ${lost.join(" ")}`,
        ).toBeGreaterThanOrEqual(0.95);
      }

      expect(await clipPathOf(page, index), `wedge ${index} widened`).not.toBe(before);
    }
  });

  test("swipes the next photo in beside the last, with no gap in the hero at any frame", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    // Let the fold-in finish, so the only motion left is the swipe.
    await page.waitForTimeout(700);

    // Watch the hero through the swap: the two photos are a hero wide each, and
    // their edges have to meet at every frame. A cross-fade used to leave a
    // quarter of the page's own ground showing between them — the flash of white
    // the owner saw on Next, in either theme.
    const watching = page.evaluate(async () => {
      const hero = document.querySelector("section[aria-labelledby='home-title']")!.getBoundingClientRect();
      const visible = () =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-wedge]"))
          .filter((wedge) => wedge.style.visibility !== "hidden")
          .map((wedge) => wedge.querySelector<HTMLElement>("[data-photo]"))
          .filter((photo): photo is HTMLElement => Boolean(photo))
          .map((photo) => photo.getBoundingClientRect())
          .sort((a, b) => a.left - b.left);

      const frames: Array<{ gap: number; covers: boolean; fromTheLeft: boolean | null; shapes: string[] }> = [];
      const start = performance.now();
      while (performance.now() - start < 600) {
        const boxes = visible();
        let gap = 0;
        for (let i = 1; i < boxes.length; i += 1) {
          gap = Math.max(gap, Math.abs(boxes[i].left - boxes[i - 1].right));
        }
        const leftmost = boxes[0];
        const rightmost = boxes[boxes.length - 1];
        frames.push({
          gap,
          covers: Boolean(leftmost && rightmost) && leftmost.left <= hero.left + 1 && rightmost.right >= hero.right - 1,
          // A photo coming in from the left starts outside the hero's left edge.
          fromTheLeft: boxes.length === 2 ? leftmost.left < hero.left - 1 : null,
          // Both wedges must keep the hero's own shape while they travel: a wedge
          // that fell back to its fan sliver would show the fan through the gap.
          shapes: Array.from(document.querySelectorAll<HTMLElement>("[data-wedge]"))
            .filter((wedge) => wedge.style.visibility !== "hidden")
            .map((wedge) => getComputedStyle(wedge).clipPath),
        });
        await new Promise((done) => requestAnimationFrame(() => done(null)));
      }
      return frames;
    });

    await page.getByRole("button", { name: "Next place" }).click();
    const frames = await watching;

    const sliding = frames.filter((frame) => frame.fromTheLeft !== null);
    expect(sliding.length, "two photos on the move").toBeGreaterThan(2);
    for (const frame of sliding) {
      expect(frame.gap, "the two photos' edges meet").toBeLessThanOrEqual(2);
      expect(frame.covers, "the pair covers the hero end to end").toBe(true);
      expect(new Set(frame.shapes).size, "both wedges keep the hero's shape").toBe(1);
    }
    // Next swipes in from the left, as the owner asked.
    expect(sliding[0].fromTheLeft, "the next photo comes in from the left").toBe(true);

    await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();
  });

  test("swipes the previous photo in from the right", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    await page.waitForTimeout(700);

    const firstFrame = page.evaluate(async () => {
      const hero = document.querySelector("section[aria-labelledby='home-title']")!.getBoundingClientRect();
      const start = performance.now();
      while (performance.now() - start < 300) {
        const boxes = Array.from(document.querySelectorAll<HTMLElement>("[data-wedge]"))
          .filter((wedge) => wedge.style.visibility !== "hidden")
          .map((wedge) => wedge.querySelector<HTMLElement>("[data-photo]"))
          .filter((photo): photo is HTMLElement => Boolean(photo))
          .map((photo) => photo.getBoundingClientRect())
          .sort((a, b) => a.left - b.left);
        if (boxes.length === 2) return { fromTheRight: boxes[1].right > hero.right + 1 };
        await new Promise((done) => requestAnimationFrame(() => done(null)));
      }
      return null;
    });

    await page.getByRole("button", { name: "Previous place" }).click();
    const seen = await firstFrame;

    expect(seen, "two photos on the move").not.toBeNull();
    expect(seen!.fromTheRight, "the previous photo comes in from the right").toBe(true);
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

      expect(fit.heroBottom, `${label}: the hero ends at the fold`).toBeLessThanOrEqual(fit.viewportHeight + 1);
      expect(fit.titleTop, `${label}: the headline sits under the fan's point`).toBeGreaterThanOrEqual(fit.apexY - 1);
      expect(fit.buttonBottoms.length, `${label}: both buttons are showing`).toBeGreaterThanOrEqual(2);
      fit.buttonBottoms.forEach((bottom) =>
        expect(bottom, `${label}: a button is cut off by the fold`).toBeLessThanOrEqual(fit.viewportHeight - 16),
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

/**
 * The gap the owner photographed on their phone.
 *
 * Every other test here runs with reduced motion, which snaps a place open and
 * never slides the other wedges. A visitor's phone has no such setting: opening
 * one place flings the other five out along their own angles, and stepping onto
 * one of those left it standing where it was flung — up to 60px off the hero,
 * showing a strip of the page down one side of the photo. So this one runs with
 * motion on and reads the glass, not the DOM: a point two pixels inside the
 * hero's edge has to land on the photo that is open.
 */
/**
 * What is showing two pixels inside the open hero's left and right edges: the
 * photo of the open place, or the page behind it.
 */
const edgesOfOpenPhoto = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const open = document.querySelector("[data-wedge][aria-expanded='true']");
    const hero = open?.closest("section");
    if (!open || !hero) return { left: "no place open", right: "no place open" };

    const box = hero.getBoundingClientRect();
    const at = (x: number) => {
      const hit = document.elementFromPoint(x, box.top + box.height * 0.72);
      return hit?.closest("[data-wedge]") === open ? "photo" : "page";
    };

    return { left: at(box.left + 2), right: at(box.right - 3) };
  });

test.describe("stepping through places with motion on", () => {
  test.use({ reducedMotion: "no-preference" });

  test("opens each place edge to edge, with no strip of the page down either side", async ({ page }) => {
    await visit(page, "/");
    // Plenty of room to be pushed around: a landscape photo behind a portrait
    // phone, and a wedge whose own angle points sideways.
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");

    const order = [
      "Bagasbas Beach",
      "First Rizal Monument",
      "Daet Heritage Center",
      "Cathedral of the Most Holy Trinity",
      "Calaguas",
      "Apuao sandbar",
    ];

    for (const name of order) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
      // The fold-in or the cross-fade has to land before the box means anything.
      await page.waitForTimeout(700);
      expect(await edgesOfOpenPhoto(page), `the edges of ${name}`).toEqual({
        left: "photo",
        right: "photo",
      });

      await page.getByRole("button", { name: "Next place" }).click();
    }
  });
});

/**
 * The pin, from the owner's phone: open a place, take its card's "Open on the
 * map" down to the map, tap another place's pin.
 *
 * A pin is the one way into the fan that isn't the panel's own ‹ › cross-fade:
 * it changes the hash with a place already open, so the place it names arrives
 * through the fold-in — which found it still hidden (the previous place had
 * hidden every other wedge) and still slid out along its own angle. It grew to
 * full size invisible: a card over an empty screen, holding the whole viewport
 * against a thumb, so there was no scrolling out of it either.
 */
test.describe("a pin opens a place from further down the page", () => {
  test.use({ reducedMotion: "no-preference" });

  test("comes back to a photo, with the page still able to scroll", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();

    // A phone opens the card folded to a bar, so its link is one tap away.
    const show = page.getByRole("button", { name: "Show the place's details" });
    if (await show.count()) await show.click();
    await page.getByRole("link", { name: "Open on the map" }).click();
    // Down at the map, whether or not this browser honoured the card's own
    // smooth scroll — the map has to be on screen for it to mount at all.
    await page.locator("#home-map").scrollIntoViewIfNeeded();

    // The pin's name is the place's own name from the places table, which is
    // longer than the fan's short one ("… and Museum"), so match its start.
    const pin = page.locator('section[aria-labelledby="home-map"] button[aria-label^="Daet Heritage Center"]');
    await pin.waitFor({ state: "visible" });
    await pin.click();

    await expect(page.getByRole("heading", { level: 2, name: "Daet Heritage Center" })).toBeVisible();
    // Back up at the hero, which is where the pin takes the visitor.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);

    expect(await edgesOfOpenPhoto(page), "the photo the pin opened").toEqual({
      left: "photo",
      right: "photo",
    });

    // Sideways is the photo's gesture; up and down belongs to the page, so a
    // thumb can scroll away and pull to refresh as usual.
    const touchAction = await page.evaluate(() => {
      const hero = document.querySelector("[data-wedge]")?.closest("section");
      return hero ? getComputedStyle(hero).touchAction : null;
    });
    expect(touchAction).toBe("pan-y");
  });
});
