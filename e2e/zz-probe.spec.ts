import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { visit } from "./fixtures";

test.use({ reducedMotion: "no-preference" });

test("probe: a pin opens the place from further down the page", async ({ page }) => {
  await visit(page, "/");
  const wedge = page.getByRole("button", { name: "Bagasbas Beach: open photo and details" });
  await wedge.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();

  const show = page.getByRole("button", { name: "Show the place's details" });
  if (await show.count()) await show.click();
  await page.waitForTimeout(300);

  await page.getByRole("link", { name: "Open on the map" }).click();
  await page.waitForTimeout(1200);
  const atMap = await page.evaluate(() => ({ hash: location.hash, y: window.scrollY }));

  const pin = page.getByRole("button", { name: "Daet Heritage Center", exact: true });
  await pin.waitFor({ state: "visible" });
  await pin.click();
  await page.waitForTimeout(1600);

  const state = await page.evaluate(() => {
    const hero = document.querySelector("[data-wedge]")?.closest("section") as HTMLElement | null;
    const open = document.querySelector("[data-wedge][aria-expanded='true']") as HTMLElement | null;
    const photo = open?.querySelector("[data-photo]") as HTMLElement | null;
    const nudge = open?.querySelector("[data-nudge]") as HTMLElement | null;
    const img = open?.querySelector("img") as HTMLImageElement | null;
    const box = hero?.getBoundingClientRect();
    const hit = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null;
    const computed = (el: Element | null | undefined, prop: string) =>
      el ? getComputedStyle(el).getPropertyValue(prop) : null;
    return {
      hash: location.hash,
      scrollY: window.scrollY,
      heroTop: box ? Math.round(box.top) : null,
      openWedge: open?.getAttribute("data-wedge") ?? null,
      wedge: {
        transform: open?.style.transform ?? null,
        clip: (open?.style.clipPath ?? "").slice(0, 70),
        opacity: open ? getComputedStyle(open).opacity : null,
        visibility: open ? getComputedStyle(open).visibility : null,
        z: open?.style.zIndex ?? null,
      },
      photoTransform: photo?.style.transform ?? null,
      nudgeTransform: nudge?.style.transform ?? null,
      img: {
        src: img?.currentSrc?.split("/").pop()?.slice(0, 40) ?? null,
        complete: img?.complete ?? null,
        natural: `${img?.naturalWidth}x${img?.naturalHeight}`,
        opacity: computed(img, "opacity"),
        objectPosition: computed(img, "objectPosition"),
      },
      touchAction: hero ? getComputedStyle(hero).touchAction : null,
      bodyOverflow: getComputedStyle(document.body).overflow,
      hitAtCentre: hit ? `${hit.tagName.toLowerCase()}${hit.className ? "." + String(hit.className).slice(0, 30) : ""}` : null,
    };
  });

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/probe2.json", JSON.stringify({ atMap, state }, null, 2));
  expect(
    JSON.stringify({ atMap: atMap.hash + " y=" + atMap.y, open: state.openWedge, wedge: state.wedge, photo: state.photoTransform, nudge: state.nudgeTransform, img: state.img, touch: state.touchAction, hit: state.hitAtCentre, scrollY: state.scrollY, heroTop: state.heroTop }),
  ).toBe("");
});
