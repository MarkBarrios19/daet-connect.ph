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

  test("goes back to the fan when the open photo is tapped", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();

    // The photo, well above the sheet at the foot of the screen. A phone has no
    // double-click, so one tap is the way back — and it only works because the
    // press does not capture the pointer, which would retarget the click to the
    // hero and leave the photo's own button never hearing it.
    const photo = (await page.locator("[data-wedge][aria-expanded='true']").boundingBox())!;
    await page.touchscreen.tap(photo.x + photo.width / 2, photo.y + photo.height * 0.3);

    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/#place-/);
  });

  test("opens a folded sheet at the foot of the phone, with the photo above it", async ({ page }) => {
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
    // sheet at the foot of the photo and a tap on the photo itself.
    await expect(page.getByRole("button", { name: "Back to the fan" })).toHaveCount(0);

    // The map that used to sit at the foot of the screen is gone, and the card is
    // a sheet now (image-74): the screen's width, docked to its foot, the photo
    // above it whole.
    await expect(page.locator("[data-place-map]")).toHaveCount(0);
    const viewport = page.viewportSize()!;
    const card = (await page.locator("[data-detail]").boundingBox())!;
    expect(Math.abs(card.x + card.width / 2 - viewport.width / 2), "the sheet, centred").toBeLessThanOrEqual(2);
    expect(viewport.width - card.width, "the sheet, the screen's width").toBeLessThanOrEqual(1);
    expect(viewport.height - (card.y + card.height), "docked to the foot of the photo").toBeLessThanOrEqual(1);
    // Folded to a peek: the header row and the name, no copy.
    expect(card.height, "a peek, not the whole card").toBeLessThan(140);

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

  test("is the owner's ticket: their lettering across the perforation, the photograph and the three moves", async ({ page }) => {
    // The owner's reference (image-62) and the two SVGs that came with it.
    await visit(page, "/");

    const band = page.locator("[data-ticket]");
    await expect(band).toBeVisible();
    await band.scrollIntoViewIfNeeded();

    // The ticket is the theme's cream, not a colour baked into a file: that is
    // what lets it turn over in dark mode.
    const paint = await band
      .locator("[data-ticket-shape] .ticket-shape")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(paint, "the reference's cream").toBe("rgb(232, 215, 185)");

    // The photograph is in the ticket, and the owner's lettering is the file
    // they sent — noise and drop shadow included.
    await expect(band.locator("[data-ticket-photo] img")).toHaveAttribute("src", /rizal-monument-park/);
    await expect(band.locator("[data-ticket-art] img")).toHaveAttribute("src", "/ticket/booking-in-3-moves.svg");
    await expect(band.locator("[data-ticket-panel]").getByRole("listitem")).toHaveCount(3);

    // The panel is the warm white from the reference, and its copy is the
    // theme's ink: dark on that cream is 15:1.
    const [field, ink] = await band
      .locator("[data-ticket-panel]")
      .evaluate((element) => [getComputedStyle(element).backgroundColor, getComputedStyle(element).color]);
    expect(field, "the reference's warm white").toBe("rgb(250, 246, 239)");
    expect(ink, "dark copy on it").toBe("rgb(15, 23, 42)");

    // The words the lettering shows are the band's heading.
    await expect(band.getByRole("heading", { level: 2 })).toHaveText("Booking, in three moves");

    // Stacked, the ticket is torn across it (the owner's phone design, image-68):
    // the photograph and the card of moves meet, the pair of bites is on the left
    // and right edges level with that line, and the lettering straddles it.
    const photo = (await band.locator("[data-ticket-photo]").boundingBox())!;
    const panel = (await band.locator("[data-ticket-panel]").boundingBox())!;
    const art = (await band.locator("[data-ticket-art]").boundingBox())!;
    const card = (await band.boundingBox())!;

    expect(panel.y - (photo.y + photo.height), "the halves meet, no gap").toBeLessThanOrEqual(1.5);
    expect(Math.abs(art.y + art.height / 2 - panel.y), "the lettering, on the seam").toBeLessThanOrEqual(2);

    const holes = await maskHoles(band);
    // The corners sit at nought, so the pair that is not at an edge of the paper
    // vertically is the one the stacked layout moved onto the sides.
    const stacked = holes.filter((hole) => hole.yUnit === "px" && hole.y > 1);
    expect(stacked, "a bite on each side, not on the top and bottom").toHaveLength(2);
    const [left, right] = [...stacked].sort((a, b) => a.x - b.x);
    expect(left.x, "biting the left edge").toBeLessThanOrEqual(0.5);
    expect(right.xUnit === "%" ? right.x : Number.NaN, "and the right one").toBeGreaterThanOrEqual(99);
    expect(Math.abs(left.y - (panel.y - card.y)), "level with the seam").toBeLessThanOrEqual(2);
    expect(Math.abs(right.y - left.y), "the pair on one line").toBeLessThanOrEqual(0.5);
  });
});

/**
 * The holes `ticket-shape` masks out of the paper, as points in its own box.
 *
 * Chromium writes the mask back with the custom properties resolved, so this
 * reads the geometry the browser actually used rather than the one in the file:
 * `radial-gradient(circle 12px at 0px 253.5px, …)`.
 */
async function maskHoles(
  band: import("@playwright/test").Locator,
): Promise<Array<{ x: number; xUnit: string; y: number; yUnit: string }>> {
  const mask = await band
    .locator("[data-ticket-shape] .ticket-shape")
    .evaluate((element) => getComputedStyle(element).maskImage);

  return [...mask.matchAll(/at\s+(-?[\d.]+)(px|%)?\s+(-?[\d.]+)(px|%)?/g)].map((match) => ({
    x: Number(match[1]),
    xUnit: match[2] ?? "px",
    y: Number(match[3]),
    yUnit: match[4] ?? "px",
  }));
}

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

  test("goes back to the fan on a double-click, and leaves it alone on one", async ({ page }) => {
    await visit(page, "/");
    // A wedge at rest is a thin sliver, so its middle is not a place a pointer
    // can reach: the keyboard opens it, as the other fan tests do.
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
    // Let the fold-in land before the pointer goes anywhere near the photo.
    await page.waitForTimeout(800);

    // Right of the cards, which hug the photo's left edge: the photo itself.
    const hero = (await page.locator("section[aria-labelledby='home-title']").boundingBox())!;
    const at = { x: hero.x + hero.width * 0.75, y: hero.y + hero.height * 0.55 };

    // One click no longer takes the photo away while the visitor is looking at it.
    await page.mouse.click(at.x, at.y);
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();

    // Two do, and the fan is back.
    await page.mouse.dblclick(at.x, at.y);
    await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/#place-/);
    await expect(page.getByRole("group", { name: "Places in Daet" })).toBeVisible();
  });

  test("splits the booking band: the photograph on the left, the three moves on the right, the lettering across the seam", async ({ page }) => {
    await visit(page, "/");
    await page.evaluate(() =>
      document.querySelector("#home-how")?.scrollIntoView({ block: "center", behavior: "instant" }),
    );

    const photo = (await page.locator("[data-ticket-photo]").boundingBox())!;
    const panel = (await page.locator("[data-ticket-panel]").boundingBox())!;
    const art = (await page.locator("[data-ticket-art]").boundingBox())!;
    const card = (await page.locator("[data-ticket]").boundingBox())!;

    // The owner's layout: the picture in the wider left half, the three moves on
    // the narrower right one, and the lettering centred on the band — clear of
    // the words on the card (their note on image-64).
    expect(panel.x, "side by side, not stacked").toBeGreaterThanOrEqual(photo.x + photo.width - 1);
    expect(photo.y, "on the same line").toBeCloseTo(panel.y, 0);
    expect(photo.width, "the picture's half is the wider one").toBeGreaterThan(panel.width);

    const artCentre = art.x + art.width / 2;
    const bandCentre = card.x + card.width / 2;
    expect(Math.abs(artCentre - bandCentre), "the lettering, centred on the band").toBeLessThanOrEqual(2);
    expect(art.y + art.height / 2, "and down its middle").toBeCloseTo(photo.y + photo.height / 2, 0);
    expect(art.x + art.width, "clear of the card the words are set on").toBeLessThan(panel.x + 8);

    // The tear is where the owner draws it — 56% across the paper, right of the
    // lettering's middle — and the bites in the top and bottom edges are on that
    // same line, so the lettering crosses the tear instead of hiding it.
    const perforation = (await page.locator("[data-ticket-perf]").boundingBox())!;
    expect(
      Math.abs(perforation.x + perforation.width / 2 - (card.x + card.width * 0.56)),
      "the tear, at 56% of the paper",
    ).toBeLessThanOrEqual(2);

    const holes = await maskHoles(page.locator("[data-ticket]"));
    const percent = (value: number, unit: string) => (unit === "%" ? value : value === 0 ? 0 : Number.NaN);
    const edges = holes.filter(
      (hole) => percent(hole.x, hole.xUnit) === 56 && [0, 100].includes(percent(hole.y, hole.yUnit)),
    );
    expect(edges, "a bite in each of the top and bottom edges, on the tear").toHaveLength(2);

    await expect(page.locator("[data-ticket-photo] img")).toBeVisible();
    await expect(page.locator("[data-ticket-panel]").getByRole("listitem")).toHaveCount(3);
  });

  test("runs the headline a tenth smaller, the buttons 5% bigger, and sweeps Wayra on hover", async ({ page }) => {
    // Owner's notes on the hero (image-57, image-58). Wayra is the Codepen pen
    // they pointed at: a slab hinged at the button's bottom-left corner, laid
    // back 45 degrees out of sight, swung up to fill the button on hover.
    await visit(page, "/");

    // display-1's clamp tops out at 6rem (96px) at this width; a tenth down.
    const size = await page.locator("#home-title").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(size, "the statement, 10% smaller").toBeCloseTo(86.4, 0);

    const solid = page.getByRole("link", { name: "Find a tour" });
    const box = (await solid.boundingBox())!;
    expect(box.height, "the buttons, 5% bigger than lg's 48px").toBeCloseTo(50.4, 0);

    const atRest = await solid.evaluate((element) => getComputedStyle(element, "::before").transform);
    expect(atRest, "the slab, laid back 45 degrees out of sight").toContain("0.707");

    await solid.hover();
    await page.waitForTimeout(400);
    const landed = await solid.evaluate((element) => getComputedStyle(element, "::before").transform);
    expect(landed, "swung up to fill the button").toBe("matrix(1, 0, 0, 1, 0, 0)");

    // The outlined button fills with ink, so its label flips to the page's ground.
    const ghost = page.getByRole("button", { name: "Ask the travel guide" });
    const inkBefore = await ghost.evaluate((element) => getComputedStyle(element).color);
    await ghost.hover();
    await page.waitForTimeout(400);
    const inkAfter = await ghost.evaluate((element) => getComputedStyle(element).color);
    expect(inkAfter, "white on the ink slab").not.toBe(inkBefore);
    expect(inkAfter).toBe("rgb(255, 255, 255)");
  });

  test("draws the three ways to Daet as one outlined band", async ({ page }) => {
    // The owner's reference (image-47): a single outlined card with a rule
    // between the columns, each column numbered and carrying its own vehicle —
    // rather than three loose cards that happen to sit in a row.
    await visit(page, "/");
    await page.evaluate(() =>
      document.querySelector("#home-getting-here")?.scrollIntoView({ block: "center", behavior: "instant" }),
    );

    const band = page.locator("[data-routes]");
    await expect(band).toBeVisible();
    const items = band.locator("li");
    await expect(items).toHaveCount(3);

    const shadow = await band.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(shadow, "one outline around the whole band").toContain("inset");
    expect(shadow, "a step heavier than a hairline").toContain("1.5px");

    const boxes = await items.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
    expect(boxes[1].x, "the columns start where the last one ends").toBeCloseTo(boxes[0].x + boxes[0].width, 0);
    expect(boxes[1].width, "three equal columns").toBeCloseTo(boxes[0].width, 0);
    // Tailwind's divide-x rules the inline end of every column but the last, so
    // the line between one route and the next is the first column's right edge.
    const rule = await items.nth(0).evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.borderRightWidth, colour: style.borderRightColor };
    });
    expect(rule.width, "a rule between them").toBe("1px");
    expect(rule.colour, "in the card's hairline").not.toBe("rgba(0, 0, 0, 0)");

    await expect(items.nth(0).locator("span").first()).toHaveText("01");
    await expect(items.nth(2).locator("span").first()).toHaveText("03");
    for (const item of [items.nth(0), items.nth(1), items.nth(2)]) {
      await expect(item.locator("svg").first()).toBeVisible();
    }
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

  test("opens the place into the sketch's cards over its photo, and folds on Escape", async ({ page }) => {
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

    // The owner's sketch (image-30): the map card leads, and the place's own card
    // stands beside it. The sketch's third card, the Fun fact, is gone — the owner
    // asked for it (image-45), and every place would have shown a placeholder.
    const hero = (await page.locator("section[aria-labelledby='home-title']").boundingBox())!;
    const map = (await page.locator("[data-place-map]").boundingBox())!;
    const card = (await page.locator("[data-detail]").boundingBox())!;
    const column = (await page.locator("#home-places").boundingBox())!.x;

    // The owner asked for the cards flush to the left of the photo, off the page's
    // centred column (image-31), so the map card hugs the viewport's left edge.
    expect(map.x, "flush to the left edge").toBeLessThanOrEqual(24);
    expect(map.x, "nearer the edge than the page's column").toBeLessThan(column);
    expect(map.y - hero.y, "at the top of the photo, under the bar").toBeGreaterThanOrEqual(0);
    expect(map.y - hero.y, "at the top of the photo, under the bar").toBeLessThanOrEqual(110);
    expect(map.width, "a card, not a column").toBeLessThanOrEqual(420);

    // The owner's note (image-61): nine tenths of the viewport tall, the map
    // filling it, rather than a 16rem band in the corner of the screen. The
    // card's top is the header plus the frame's gap and its height takes that
    // back off, so its bottom edge lands on the 90% line.
    const viewport = page.viewportSize()!;
    expect(map.y + map.height, "its bottom edge on the 90% line").toBeGreaterThan(viewport.height * 0.88);
    expect(map.y + map.height, "its bottom edge on the 90% line").toBeLessThan(viewport.height * 0.92);
    // Not the leaflet container first: it only exists once the map has booted,
    // and this part is about the room the card gives it.
    const mapBody = (await page.locator("[data-place-map] [data-map-body]").boundingBox())!;
    expect(mapBody.height, "the map fills the card").toBeGreaterThan(map.height - 60);
    expect(mapBody.height, "far past the old 16rem band").toBeGreaterThan(256);

    // And the map itself has to fill that room. A percentage height inside a
    // flex item that grows from no basis resolves against nothing in Chrome, so
    // a `h-full` map came out zero tall and took the wheel zoom with it.
    await expect(page.locator("[data-place-map] .leaflet-container")).toHaveCount(1);
    const leaflet = (await page.locator("[data-place-map] .leaflet-container").boundingBox())!;
    expect(leaflet.height, "the map itself fills the room").toBeGreaterThan(mapBody.height - 4);

    // And it folds (owner's note on image-63): the map goes, the bar that names
    // the place stays, and the card gives the photo behind it back.
    await page.getByRole("button", { name: "Hide the map" }).click();
    await expect(page.getByRole("button", { name: "Show the map" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("[data-place-map] [data-map-body]")).toHaveCount(0);
    const folded = (await page.locator("[data-place-map]").boundingBox())!;
    expect(folded.height, "a bar, not a column").toBeLessThan(72);
    expect(folded.width, "still the card's width").toBeCloseTo(map.width, 0);
    await expect(page.locator("[data-place-map] [data-viewing]")).toContainText("Bagasbas Beach");
    // "Show all" acts on a map, so it goes with it.
    await expect(page.getByRole("button", { name: "Show all" })).toHaveCount(0);

    await page.getByRole("button", { name: "Show the map" }).click();
    await expect(page.locator("[data-place-map] [data-map-body]")).toHaveCount(1);
    expect((await page.locator("[data-place-map]").boundingBox())!.height, "the column comes back").toBeCloseTo(
      map.height,
      0,
    );

    expect(card.x, "the place card beside the map, to its right").toBeGreaterThan(map.x + map.width - 1);
    expect(Math.abs(card.y - map.y), "their tops line up").toBeLessThanOrEqual(2);
    // No card under it any more: the row is the map and the place, nothing else.
    await expect(page.locator("[data-fun-fact]")).toHaveCount(0);

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
        const below = document.querySelector("section[aria-labelledby='home-places'] h2") as HTMLElement | null;

        return {
          ground: rgb(getComputedStyle(hero).backgroundColor),
          page: rgb(getComputedStyle(document.body).backgroundColor),
          headline: rgb(getComputedStyle(headline).color),
          belowHeading: below ? rgb(getComputedStyle(below).color) : null,
          guide: guide ? rgb(getComputedStyle(guide).color) : null,
        };
      });

    /** Both channels of an RGB triple, give or take a rounding step. */
    const isNear = (actual: number[], expected: number[]) =>
      expected.every((channel, i) => Math.abs((actual[i] ?? 0) - channel) <= 2);

    const light = await readHero();
    expect(isNear(light.ground, [255, 255, 255]), "the page's own ground, no dark band").toBe(true);
    expect(isNear(light.ground, light.page), "the hero and the page are one colour").toBe(true);
    expect(isNear(light.headline, [15, 23, 42]), "ink on it").toBe(true);
    expect(isNear(light.headline, light.belowHeading ?? []), "the same ink as the headings below").toBe(true);
    // White-on-white was the bug in the mock: this button has to carry ink here.
    expect(isNear(light.guide ?? [], [15, 23, 42]), "the guide button keeps an edge on light").toBe(true);

    await page.addInitScript(() => localStorage.setItem("daet-theme", "dark"));
    await visit(page, "/");

    const dark = await readHero();
    // The page's own ground in dark mode, not the lighter slate band the hero
    // used to sit on (image-59), and the headings' off-white rather than white.
    expect(isNear(dark.ground, [11, 18, 32]), "the page's own ground, no lighter band").toBe(true);
    expect(isNear(dark.ground, dark.page), "the hero and the page are one colour").toBe(true);
    expect(isNear(dark.headline, [226, 232, 240]), "the theme's ink, as below").toBe(true);
    expect(isNear(dark.headline, dark.belowHeading ?? []), "the same ink as the headings below").toBe(true);
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

  test("zooms the card's map with the wheel, and keeps its tail on the pin", async ({ page }) => {
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(inPanel(page)).toBeVisible();
    await page.waitForTimeout(1200);

    const map = (await page.locator("[data-place-map]").boundingBox())!;
    const card = page.locator("[data-map-place]");
    const pin = page.locator("[data-place-map] .leaflet-marker-icon:has(img)");

    // The wheel over the card's map zooms the map — it does not scroll the page
    // out from under the hero.
    const tileZoom = () =>
      page.evaluate(() => {
        const tile = document.querySelector("[data-place-map] img.leaflet-tile") as HTMLImageElement | null;
        const level = tile?.src.match(/\/(\d+)\/\d+\/\d+\.png/);
        return level ? Number(level[1]) : null;
      });

    const zoomBefore = await tileZoom();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.move(map.x + map.width / 2, map.y + map.height * 0.75);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.scrollY), "the page stayed where it was").toBe(scrollBefore);
    if (zoomBefore !== null) {
      expect(await tileZoom(), "the wheel zoomed the map").not.toBe(zoomBefore);
    }

    /** The card never sits on the pin it names: above it, or below it, but off it. */
    const clearOfThePin = async () => {
      const cardBox = (await card.boundingBox())!;
      const pinBox = (await pin.boundingBox())!;
      return {
        clear: cardBox.y + cardBox.height <= pinBox.y + 1 || cardBox.y >= pinBox.y + pinBox.height - 1,
        cardBox,
        pinBox,
      };
    };

    const settled = await clearOfThePin();
    expect(settled.clear, "the card is over the pin's own photo").toBe(true);

    // The tail is part of the card, and it points at the pin: the crop the owner
    // sent (image-44) had two shapes with the map's labels between them.
    const tail = (await page.locator("[data-map-place-tail]").boundingBox())!;
    expect(tail, "the tail is drawn").not.toBeNull();
    expect(tail.x, "inside the card's own edge").toBeGreaterThanOrEqual(settled.cardBox.x - 1);
    expect(tail.x + tail.width).toBeLessThanOrEqual(settled.cardBox.x + settled.cardBox.width + 1);
    expect(
      Math.abs(tail.x + tail.width / 2 - (settled.pinBox.x + settled.pinBox.width / 2)),
      "the tail points at the pin",
    ).toBeLessThanOrEqual(10);

    // Drag the map: the pin moves, and the card and its tail go with it.
    const beforeDrag = (await card.boundingBox())!;
    await page.mouse.move(map.x + map.width / 2, map.y + map.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(map.x + map.width / 2 - 70, map.y + map.height * 0.8, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    expect(
      Math.abs((await card.boundingBox())!.x - beforeDrag.x),
      "the card followed the pin",
    ).toBeGreaterThan(10);
    expect((await clearOfThePin()).clear, "and it is still off the pin").toBe(true);
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

    const wedge = page.getByRole("button", { name: "Calaguas: open photo and details" });
    await wedge.focus();
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
    expect(openShape.clip, "the photo fills the hero while it is open").toContain("polygon");
    expect(openShape.headline, "the headline is behind it").toBe(0);

    await page.getByRole("button", { name: "Back to the fan" }).click();

    // Part way through: the wedge has left the hero, and the headline is on its
    // way back rather than back. A snap would have finished already.
    await page.waitForTimeout(150);
    const midFlight = await read();
    expect(midFlight.clip, "on its way out of the hero").not.toBe(openShape.clip);
    expect(midFlight.headline, "the headline is coming back, not back yet").toBeLessThan(1);

    // And it does land: a snap would leave the wedge in the same place at both
    // samples, which is the bug — a fan that never folds.
    await page.waitForTimeout(1400);
    const after = await read();
    expect(after.clip, "still folding after the first sample").not.toBe(midFlight.clip);
    expect(after.clip, "and it is not the hero any more").not.toBe(openShape.clip);
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
      const buttons = Array.from(headline.querySelectorAll<HTMLElement>("a, button"));
      return {
        heroWidth: hero.getBoundingClientRect().width,
        heroTransform: getComputedStyle(hero).transform,
        headlineOpacity: Number(getComputedStyle(headline).opacity),
        buttonOpacities: buttons.map((button) => Number(getComputedStyle(button).opacity)),
        fanTransform: getComputedStyle(hero.querySelector("[role='group']") as HTMLElement).transform,
        viewportWidth: window.innerWidth,
      };
    });

    // No shrunken card with white margins: the section keeps the screen's width.
    expect(fold.heroTransform).toBe("none");
    expect(Math.round(fold.heroWidth)).toBe(fold.viewportWidth);
    // The fan is the thing that moves — and the words and buttons above it stay
    // solid: they used to fade out under the pointer as the page scrolled, which
    // is what the owner reported.
    expect(fold.fanTransform).not.toBe("none");
    expect(fold.headlineOpacity).toBe(1);
    fold.buttonOpacities.forEach((opacity) => expect(opacity).toBe(1));
  });

  test("keeps the hero's words and buttons solid after stepping out of a place", async ({ page }) => {
    // The owner's sequence, exactly: open one of the fan's photos, press Next
    // twice, leave the photo, then scroll — and the hero's words and its buttons
    // kept vanishing under the pointer as the page moved.
    await visit(page, "/");
    await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
    await page.keyboard.press("Enter");
    await expect(inPanel(page)).toBeVisible();

    const next = page.getByRole("button", { name: "Next place" });
    await next.click();
    await next.click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Back to the fan" }).click();
    await page.waitForTimeout(900);

    const read = () =>
      page.evaluate(() => {
        const headline = document.querySelector("[data-headline]") as HTMLElement;
        const buttons = Array.from(headline.querySelectorAll<HTMLElement>("a, button"));
        return {
          headline: Number(getComputedStyle(headline).opacity),
          buttons: buttons.map((button) => Number(getComputedStyle(button).opacity)),
        };
      });

    const atRest = await read();
    expect(atRest.headline, "the words are back once the photo is gone").toBe(1);
    atRest.buttons.forEach((opacity) => expect(opacity, "and so are the buttons").toBe(1));

    // Down the page in steps, the way a wheel goes: nothing fades on the way, and
    // nothing comes back half-faded.
    for (const y of [80, 160, 240, 320, 400]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(200);
      const state = await read();
      expect(state.headline, `the words at ${y}px`).toBe(1);
      state.buttons.forEach((opacity) => expect(opacity, `a button at ${y}px`).toBe(1));
    }
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
    // Whatever is over the photo — the desktop's cards at the top, a phone's
    // sheet at the foot — sits somewhere on the hero. Read the glass above it,
    // and never higher than a quarter of the way down, which is still the photo
    // on every phone.
    const layer = document.querySelector("[data-detail-layer]");
    const ceiling = layer ? layer.getBoundingClientRect().top - 24 : box.bottom;
    const y = Math.max(box.top + box.height * 0.25, Math.min(box.top + box.height * 0.72, ceiling));

    const at = (x: number) => {
      const hit = document.elementFromPoint(x, y);
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
