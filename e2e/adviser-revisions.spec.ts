import { expect, test } from "@playwright/test";
import { checkA11y, draftPlan, signInAs, type Role } from "./fixtures";

/** Adviser revisions (docs/ADVISER_REVISIONS.md). */
test.use({ viewport: { width: 375, height: 812 }, isMobile: true });

/** At phone width the links live in the Menu sheet; open it and return its nav. */
const mainNav = async (page: import("@playwright/test").Page) => {
  await page.getByRole("banner").locator("summary").click();
  return page.getByRole("navigation", { name: "Menu" });
};

test.describe("R1: the exploration menu is only for visitors and tourists", () => {
  test("visitors see it", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect((await mainNav(page)).getByRole("link", { name: "Souvenirs" })).toHaveCount(1);
  });

  const homes: Record<Role, string> = { tourist: "/tours/me", operator: "/tours/operator/dashboard", guide: "/tours/guide/dashboard", admin: "/tours/admin" };
  for (const role of Object.keys(homes) as Role[]) {
    test(`${role} dashboard`, async ({ context, page }) => {
      await signInAs(context, role);
      await page.goto(homes[role], { waitUntil: "networkidle" });
      const nav = await mainNav(page);
      await expect(nav.getByRole("link", { name: "Souvenirs" })).toHaveCount(role === "tourist" ? 1 : 0);
      await expect(nav.getByRole("link", { name: "Plan a trip" })).toHaveCount(role === "tourist" ? 1 : 0);
    });
  }
});

test("R2: the old planner form is gone; the planner asks before drafting", async ({ page }) => {
  // TRIP_PLANNER_V2 is on by default: interests are read from the request, not chips.
  await page.goto("/tours/plan", { waitUntil: "networkidle" });
  await expect(page.getByRole("group", { name: "What do you enjoy?" })).toHaveCount(0);
  await draftPlan(page, "Plan a trip with everything: beaches, food, history and nature");
  await checkA11y(page, "planner with a plan");
});

test("R3: package prices show two decimals", async ({ page }) => {
  await page.goto("/tours/browse", { waitUntil: "networkidle" });
  await expect(page.getByText(/₱[\d,]+\.\d{2}/).first()).toBeVisible();
  await expect(page.getByText(/₱[\d,]+(?![\d.,])/)).toHaveCount(0);
});

test("R5: the assistant answers travel time in basic mode, with directions", async ({ page }) => {
  await page.goto("/tours/browse", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Daet AI assistant" }).click();
  const dialog = page.getByRole("dialog", { name: "Daet AI assistant" });
  await dialog.getByLabel("Ask the Daet AI assistant").fill("How long from Daet to Bagasbas?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(/Daet town center to Bagasbas: about \d+ min/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Directions: Daet town center → Bagasbas/ })).toHaveAttribute("target", "_blank");
  await dialog.getByLabel("Ask the Daet AI assistant").fill("Paano pumunta sa Daet galing Manila?");
  await dialog.getByRole("button", { name: "Send" }).click();
  // A Tagalog question gets a Tagalog answer, each leg with its fare, and a reminder to confirm.
  await expect(dialog.getByText(/Mula Manila papunta sa Daet/)).toBeVisible();
  await expect(dialog.getByText(/Bus Manila \(PITX\) → Daet \(₱801\.00 bawat tao/)).toBeVisible();
  await expect(dialog.getByText("Bus: Manila (PITX) to Daet")).toBeVisible();
  await checkA11y(page, "assistant travel answers");
});

test.describe("R6: guide schedules and swap requests", () => {
  test("a guide suggests another guide for an upcoming tour", async ({ context, page }) => {
    await signInAs(context, "guide");
    await page.goto("/tours/guide/my-tours", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Suggest another guide" }).first().click();
    const form = page.getByRole("form", { name: /Suggest another guide for/ });
    const picker = form.getByLabel("Who could take it?");
    await expect(picker.getByRole("option", { name: "Liza Bautista" })).toBeEnabled();
    await expect(picker.getByRole("option", { name: /Paolo Reyes \(Already on a tour that day\)/ })).toBeDisabled();
    await expect(picker.getByRole("option", { name: /Jeremiah Sabihon/ })).toHaveCount(0);
    await picker.selectOption({ label: "Liza Bautista" });
    await form.getByLabel(/Why\?/).fill("Family emergency that day");
    await checkA11y(page, "guide swap form");
    await form.getByRole("button", { name: "Send to operator" }).click();
    await expect(page.getByText(/Sent\. The operator will approve or decline it/)).toBeVisible();
  });

  test("the guide calendar shows booked days and fills weekends", async ({ context, page }) => {
    await signInAs(context, "guide");
    await page.goto("/tours/guide/dashboard", { waitUntil: "networkidle" });
    await expect(page.locator('button[aria-label*="on a tour"]').first()).toBeVisible();
    await page.getByRole("button", { name: /Mark every Sat & Sun available/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /weekend/ })).toBeVisible();
  });

  test("the operator sees the request and why some guides can't be picked", async ({ context, page }) => {
    await signInAs(context, "operator");
    await page.goto("/tours/operator/bookings", { waitUntil: "networkidle" });
    const request = page.getByRole("region", { name: "Guide swap request" });
    await expect(request.getByText(/asks to hand this tour to another guide/)).toBeVisible();
    await expect(request.getByText("My boat license renewal is on that day.", { exact: false })).toBeVisible();
    const picker = request.getByLabel("New guide");
    await expect(picker.getByRole("option", { name: /Paolo Reyes \(Already on a tour that day\)/ })).toBeDisabled();
    await picker.selectOption({ label: "Liza Bautista" });
    await checkA11y(page, "operator swap review");
    await request.getByRole("button", { name: "Approve swap" }).click();
    await expect(request.getByText(/Approved\. The new guide and the tourist have been notified/)).toBeVisible();
  });
});
