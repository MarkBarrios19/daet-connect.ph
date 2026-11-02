import { expect, test } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

test("the Daet AI assistant is pinned at the top of Messages and keeps the chat on the account", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto("/tours/messages", { waitUntil: "networkidle" });
  const pinned = page.getByRole("link", { name: /^Daet AI assistant Pinned/ });
  await expect(pinned).toBeVisible();
  await pinned.click();
  await expect(page).toHaveURL(/\/tours\/messages\/ai$/);
  await expect(page.getByRole("heading", { level: 1, name: "Daet AI assistant" })).toBeVisible();
  await expect(page.getByText(/Saved to your account/)).toBeVisible();
  await page.getByRole("button", { name: "Where to eat near Bagasbas?" }).click();
  await expect(page.getByRole("link", { name: /Get directions to Bagasbas Beach eateries/ })).toBeVisible();
  await checkA11y(page, "AI chat in Messages");
});

const THREAD = "/tours/messages/cc110000-0000-4000-8000-000000000001";

test("a chat reads like Messenger: grouped bubbles, Seen, and a live unread badge", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto(THREAD, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Bagasbas Sunrise Surf Lesson" })).toBeVisible();
  await expect(page.getByText("Seen")).toBeVisible();
  // One other chat has unread messages.
  await expect(page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /Messages/ }).getByText("1 unread chat")).toBeAttached();
  await checkA11y(page, "Messenger thread");
});

test("react to a message and reply to it", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto(THREAD, { waitUntil: "networkidle" });
  const log = page.getByRole("log", { name: "Messages" });
  await expect(log.getByRole("button", { name: "Love: 1" })).toBeVisible();

  await log.getByRole("button", { name: "React or reply" }).nth(1).click();
  await page.getByRole("menuitemradio", { name: "Like" }).click();
  await expect(log.getByRole("button", { name: "Like: 1, including you" })).toBeVisible();

  await log.getByRole("button", { name: "React or reply" }).nth(1).click();
  await page.getByRole("menuitem", { name: "Reply" }).click();
  await expect(page.getByText("Replying to Bagasbas Coast Tours")).toBeVisible();
  await page.getByRole("textbox", { name: "Message" }).fill("Great, we'll be in the lobby by 5:20.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(log.getByText("Great, we'll be in the lobby by 5:20.")).toBeVisible();
  await expect(log.getByRole("button", { name: /Replying to Bagasbas Coast Tours/ })).toBeVisible();
  await checkA11y(page, "reactions and replies");
});

test.describe("desktop chat heads", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false });

  test("Message buttons and the assistant open chats in the dock without leaving the page", async ({ context, page }) => {
    await signInAs(context, "tourist");
    const booking = "/tours/bookings/e9466de5-4877-47c1-ac14-d86deeb38b9e";
    await page.goto(booking, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Message operator" }).click();
    const dock = page.getByRole("region", { name: "Open chats" });
    await expect(dock.getByRole("heading", { level: 2, name: "Bagasbas Sunrise Surf Lesson" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${booking}$`));

    await dock.getByRole("button", { name: "Minimise Bagasbas Sunrise Surf Lesson" }).click();
    await expect(dock.getByRole("button", { name: "Open chat: Bagasbas Sunrise Surf Lesson" })).toBeVisible();

    await page.getByRole("button", { name: "Daet AI assistant", exact: true }).click();
    await expect(dock.getByRole("heading", { level: 2, name: "Daet AI assistant" })).toBeVisible();
    await checkA11y(page, "chat dock");

    // The floating pill sits where an open window lands, so it stands down
    // instead of overlapping the panel's corner.
    await expect(page.getByRole("button", { name: "Daet AI assistant", exact: true })).toBeHidden();

    // A narrow window must never scroll its conversation sideways.
    const list = dock.getByRole("list", { name: "Conversation" }).first();
    const sideways = await list.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(sideways).toBeLessThanOrEqual(0);
  });

  test("the page's own layers stay under the dock", async ({ context, page }) => {
    // Leaflet's panes are z-index 400–700. With no stacking context on the map
    // they escaped it and painted over the dock: the panel's header, its messages
    // and the attribution all sat on top of a chat the visitor was reading.
    await signInAs(context, "tourist");
    await page.goto("/", { waitUntil: "networkidle" });

    // Scroll past the hero, which hides the floating pill while it is on screen,
    // then open the assistant from the pill: signed in on a wide screen, that
    // lands in the dock.
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.5, behavior: "instant" }));
    const pill = page.getByRole("button", { name: "Daet AI assistant", exact: true });
    await expect(pill).toBeVisible();
    await pill.click();
    const dock = page.getByRole("region", { name: "Open chats" });
    await expect(dock.getByRole("heading", { level: 2, name: "Daet AI assistant" })).toBeVisible();

    // The pill sits where an open window lands, so it stands down.
    await expect(pill).toBeHidden();

    // Park the map across the middle of the screen, under the window.
    await page.locator("#home-map").scrollIntoViewIfNeeded();
    await page.locator(".leaflet-container").first().waitFor({ state: "visible" });

    // The map owns a stacking context, so its panes stay inside it.
    const isolation = await page.evaluate(() => {
      const host = document.querySelector(".leaflet-container")?.closest("[role='region']");
      return host ? getComputedStyle(host).isolation : "missing";
    });
    expect(isolation).toBe("isolate");
    await page.evaluate(() => {
      const box = document.querySelector(".leaflet-container")?.getBoundingClientRect();
      if (box) window.scrollTo({ top: window.scrollY + box.top - window.innerHeight * 0.35, behavior: "instant" });
    });

    // And where the two overlap, the dock is what the visitor sees.
    const dockBox = (await dock.locator("section").first().boundingBox())!;
    const mapBox = (await page.locator(".leaflet-container").first().boundingBox())!;
    const left = Math.max(dockBox.x, mapBox.x);
    const right = Math.min(dockBox.x + dockBox.width, mapBox.x + mapBox.width);
    const top = Math.max(dockBox.y, mapBox.y);
    const bottom = Math.min(dockBox.y + dockBox.height, mapBox.y + mapBox.height);
    expect(right - left, "the dock and the map overlap sideways").toBeGreaterThan(0);
    expect(bottom - top, "the dock and the map overlap vertically").toBeGreaterThan(0);

    const onTop = await page.evaluate(
      ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("[aria-label='Open chats']")),
      { x: left + (right - left) / 2, y: top + (bottom - top) / 2 },
    );
    expect(onTop, "the dock paints above the map").toBe(true);
  });
});
