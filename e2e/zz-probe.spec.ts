import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { visit } from "./fixtures";

test("probe: the open photo's box after a step", async ({ page }) => {
  await visit(page, "/");
  await page.getByRole("button", { name: "Bagasbas Beach: open photo and details" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeVisible();
  await page.waitForTimeout(900);

  const dump = async (label: string) =>
    page.evaluate((tag) => {
      const section = document.querySelector("section")!;
      const s = section.getBoundingClientRect();
      const openWedge = document.querySelector("[data-wedge][aria-expanded='true']") as HTMLElement | null;
      const photo = openWedge?.querySelector("[data-photo]") as HTMLElement | null;
      const nudge = openWedge?.querySelector("[data-nudge]") as HTMLElement | null;
      const img = openWedge?.querySelector("img") as HTMLImageElement | null;
      const rect = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      };
      const edge = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y);
        return el ? `${el.tagName.toLowerCase()}${el.getAttribute("data-wedge") ? `[wedge ${el.getAttribute("data-wedge")}]` : ""}${el.hasAttribute("data-photo") ? "[photo]" : ""}${el.hasAttribute("data-nudge") ? "[nudge]" : ""}${el.tagName === "IMG" ? "[img]" : ""}` : "none";
      };
      return {
        tag,
        section: rect(section),
        openIndex: openWedge?.getAttribute("data-wedge") ?? null,
        wedgeClip: openWedge?.style.clipPath?.slice(0, 120) ?? null,
        wedgeRect: rect(openWedge),
        photoStyle: photo?.getAttribute("style") ?? null,
        photoComputed: photo ? getComputedStyle(photo).transform : null,
        nudgeStyle: nudge?.getAttribute("style") ?? null,
        nudgeComputed: nudge ? getComputedStyle(nudge).transform : null,
        nudgeRect: rect(nudge),
        imgRect: rect(img),
        objectPosition: img ? getComputedStyle(img).objectPosition : null,
        objectFit: img ? getComputedStyle(img).objectFit : null,
        leftEdge: edge(s.x + 2, s.y + s.height / 2),
        rightEdge: edge(s.x + s.width - 2, s.y + s.height / 2),
        topEdge: edge(s.x + s.width / 2, s.y + s.height * 0.75),
        viewport: `${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`,
      };
    }, label);

  const first = await dump("after open");
  await page.getByRole("button", { name: "Next place" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeVisible();
  await page.waitForTimeout(900);
  const second = await dump("after next");
  await page.getByRole("button", { name: "Next place" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Daet Heritage Center" })).toBeVisible();
  await page.waitForTimeout(900);
  const third = await dump("after next 2");

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/probe.json", JSON.stringify([first, second, third], null, 2));
  expect(JSON.stringify([first, second, third], null, 2)).toBe("");
});
