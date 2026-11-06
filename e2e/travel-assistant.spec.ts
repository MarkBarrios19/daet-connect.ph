import { expect, test, type Page } from "@playwright/test";
import { checkA11y, signInAs } from "./fixtures";

test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

async function openAssistant(page: Page, path = "/tours/browse", waitUntil: "networkidle" | "load" = "networkidle") {
  await page.goto(path, { waitUntil });
  await page.getByRole("button", { name: "Daet AI assistant" }).click();
  const dialog = page.getByRole("dialog", { name: "Daet AI assistant" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("visitors get policy answers in basic mode, and the dialog is accessible", async ({ page }) => {
  const dialog = await openAssistant(page);
  await expect(dialog.getByLabel("Ask the Daet AI assistant")).toBeFocused();
  await dialog.getByLabel("Ask the Daet AI assistant").fill("How do I cancel and get a refund?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(/48 hours/)).toBeVisible();
  // Basic mode carries no notice (decision 6).
  await expect(dialog.getByText("Basic mode")).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "My bookings" })).toBeVisible();
  await checkA11y(page, "assistant dialog");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("visitors are asked to sign in for their bookings", async ({ page }) => {
  const dialog = await openAssistant(page);
  await dialog.getByRole("button", { name: "Where is my ticket?" }).click();
  await expect(dialog.getByText(/Sign in to see your bookings/).first()).toBeVisible();
});

test("signed in on a phone, the assistant is reached from Messages instead of a floating button", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.goto("/tours/me", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Daet AI assistant" })).toBeHidden();
  await page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name: /Messages/ }).click();
  await expect(page.getByRole("link", { name: /^Daet AI assistant Pinned/ })).toBeVisible();
});

test("a signed-in tourist sees their booking with ticket and booking links", async ({ context, page }) => {
  await signInAs(context, "tourist");
  // Tablets keep the floating button (phones use Messages, desktops the chat dock).
  await page.setViewportSize({ width: 768, height: 1024 });
  const dialog = await openAssistant(page, "/tours/me");
  await dialog.getByRole("button", { name: "Where is my ticket?" }).click();
  await expect(dialog.getByText(/BK-20261023-7F3K2Q/).first()).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Show ticket QR" }).first()).toBeVisible();
  await dialog.getByRole("link", { name: "View booking" }).first().click();
  await expect(page).toHaveURL(/\/tours\/bookings\//);
  await expect(dialog).toBeHidden();
});

test("asking for a person offers an editable message to send", async ({ context, page }) => {
  await signInAs(context, "tourist");
  await page.setViewportSize({ width: 768, height: 1024 });
  const dialog = await openAssistant(page, "/tours/me");
  await dialog.getByLabel("Ask the Daet AI assistant").fill("I want to talk to a person about my booking BK-20261023-7F3K2Q");
  await dialog.getByRole("button", { name: "Send" }).click();
  const message = dialog.getByLabel(/Message to/);
  await expect(message).toHaveValue(/talk to a person/);
  await expect(dialog.getByRole("button", { name: /Send to (operator|Tourism Office)/ })).toBeVisible();
  await checkA11y(page, "assistant handoff");
});

test("the help page hosts the same chat", async ({ page }) => {
  await page.goto("/tours/help", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Daet AI assistant" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Daet AI assistant" })).toHaveCount(0);
  await page.getByLabel("Ask the Daet AI assistant").fill("Can I pay with GCash?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/PayMongo/)).toBeVisible();
  await checkA11y(page, "help page");
});

test("the planner opens with the assistant's trip description filled in", async ({ page }) => {
  await page.goto(`/tours/plan?describe=${encodeURIComponent("2 days with my kids, beaches and food")}`, { waitUntil: "networkidle" });
  await expect(page.getByLabel("Ask the Daet AI assistant")).toHaveValue("2 days with my kids, beaches and food");
  // It waits for the traveller to send it.
  await expect(page.getByRole("form", { name: "Before I draft" })).toHaveCount(0);
});

test("the Daet AI assistant recommends food stops with Google Maps directions", async ({ page }) => {
  const dialog = await openAssistant(page);
  await dialog.getByRole("button", { name: "Where to eat near Bagasbas?" }).click();
  await expect(dialog.getByText(/^Food near bagasbas: Bagasbas Beach eateries/)).toBeVisible();
  const directions = dialog.getByRole("link", { name: /Get directions to Bagasbas Beach eateries/ });
  await expect(directions).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=14.131600%2C122.985100&travelmode=driving");
  await expect(directions).toHaveAttribute("target", "_blank");
  await expect(dialog.getByText("Verify locally").first()).toBeVisible();
  await checkA11y(page, "assistant place cards");
});

test("the Daet AI assistant estimates a trip from listed prices", async ({ page }) => {
  const dialog = await openAssistant(page);
  await dialog.getByLabel("Ask the Daet AI assistant").fill("Budget for 2 days in Bagasbas from Manila, 2 people?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Trip estimate")).toBeVisible();
  await expect(dialog.getByText("Bus: Manila (PITX) to Daet")).toBeVisible();
  await expect(dialog.getByText(/per person$/).first()).toBeVisible();
  await expect(dialog.getByText(/Estimates from listed prices, not quotes/)).toBeVisible();
  await checkA11y(page, "assistant cost card");
});

test("near me asks for the location, which the traveller shares with one tap", async ({ context, page }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 14.1316, longitude: 122.9851 });
  const dialog = await openAssistant(page);
  await dialog.getByLabel("Ask the Daet AI assistant").fill("Saan pwede kumain malapit dito?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(/Tap Use my location/)).toBeVisible();
  await dialog.getByRole("listitem").getByRole("button", { name: "Use my location" }).click();
  await expect(dialog.getByRole("button", { name: /Using your location/ })).toBeVisible();
  await expect(dialog.getByText(/Food near your location: Bagasbas Beach eateries/)).toBeVisible();
});

for (const [path, kind, answer] of [
  ["/tours/packages/aa000000-0000-4000-8000-000000000001", "tour", /open dates|No open dates/i],
  ["/tours/attractions/bagasbas-beach", "place", /Bagasbas/],
  ["/tours/events/e1000000-0000-4000-8000-000000000001", "event", /\d|free|venue|Coming up/i],
] as const) {
  test(`on a ${kind} page the assistant greets with three questions about it, answered from the listings`, async ({ page }) => {
    const dialog = await openAssistant(page, path, "load");
    const name = (await page.locator("main h1").first().textContent())!.trim();
    await expect(dialog.getByText(`Ask me about ${name}.`)).toBeVisible();
    const questions = dialog.getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    await expect(questions).toHaveCount(3);
    const first = (await questions.first().textContent())!;
    await questions.first().click();
    await expect(dialog.getByText(first, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("listitem").last()).toHaveText(answer, { timeout: 15000 });
    await page.screenshot({ path: `/tmp/claude-0/-home-user-daet-connect-ph/006bdc63-072e-5fca-8fa2-b75843fb5995/scratchpad/greet-${kind}.png` });
    await checkA11y(page, `assistant greeting on a ${kind} page`);
  });
}

test("each answer asks Was this helpful?, the choice is sent once, and the question goes away", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/api/assistant/feedback", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  const dialog = await openAssistant(page);
  await dialog.getByLabel("Ask the Daet AI assistant").fill("How do I cancel and get a refund?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(/48 hours/)).toBeVisible();
  const groups = dialog.getByRole("group", { name: "Was this helpful?" });
  const before = await groups.count();
  await groups.last().getByRole("button", { name: "Yes" }).click();
  // Answered: the question and both buttons go away; screen readers hear thanks.
  await expect(groups).toHaveCount(before - 1);
  await expect(dialog.getByRole("status").filter({ hasText: "Thanks for the feedback." })).toBeAttached();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ helpful: true, question: "How do I cancel and get a refund?" });
  await checkA11y(page, "assistant feedback");
});

test("ask by voice: what is heard is sent", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { SpeechRecognition: unknown; webkitSpeechRecognition: unknown };
    w.SpeechRecognition = w.webkitSpeechRecognition = class {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: "How do I cancel and get a refund?" }]] });
          this.onend?.();
        }, 50);
      }
      stop() {}
    };
  });
  const dialog = await openAssistant(page);
  await dialog.getByRole("button", { name: "Ask by voice" }).click();
  await expect(dialog.getByRole("button", { name: "Ask by voice" })).toBeVisible();
  await expect(dialog.getByText("How do I cancel and get a refund?")).toBeVisible();
  await expect(dialog.getByText(/48 hours/)).toBeVisible();
});

test("a signed-in visitor can send a photo; basic mode says it can't look at photos", async ({ page, context }) => {
  await signInAs(context, "tourist");
  // Signed-in phones reach the assistant from Messages or the help page, not the floating button.
  await page.goto("/tours/help", { waitUntil: "networkidle" });
  const dialog = page.getByRole("main");
  await dialog.locator('input[type="file"]').setInputFiles("public/photos/bagasbas-beach.jpg");
  await expect(dialog.getByRole("img", { name: "Your photo" })).toBeVisible();
  await expect(dialog.getByText(/used for this answer only, never saved/)).toBeVisible();
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Photo sent")).toBeVisible();
  await expect(dialog.getByText(/can't look at photos right now/)).toBeVisible();
  await page.screenshot({ path: "/tmp/claude-0/-home-user-daet-connect-ph/006bdc63-072e-5fca-8fa2-b75843fb5995/scratchpad/photo-chat.png" });
  await checkA11y(page, "assistant photo");
});

test("visitors who are not signed in get no photo button", async ({ page }) => {
  const dialog = await openAssistant(page);
  await expect(dialog.getByRole("button", { name: "Add a photo" })).toHaveCount(0);
});
