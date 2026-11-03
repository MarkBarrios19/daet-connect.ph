/**
 * @jest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { roleTabs } from "@/lib/tours/dashboards";
import { SiteHeader } from "./site-header";

// The bell and the avatar are live Supabase subscriptions, not part of the
// bar's links, and this test runs without a project to talk to.
jest.mock("@/components/tours/notification-bell", () => ({ NotificationBell: () => null }));
jest.mock("@/components/ui/account-menu", () => ({
  AccountMenu: ({ name }: { name: string }) => <button type="button">{name}</button>,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/tours/admin/attractions/14f61887/edit",
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

/** The bar's own links, in the order they are drawn. */
const navLinks = () => {
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  return within(nav)
    .getAllByRole("link")
    .map((link) => link.textContent?.trim());
};

describe("SiteHeader", () => {
  it("draws each of the admin's pages once, with the office's pages after them", () => {
    // The admin bar used to draw its role tabs and then the Tourism Office's
    // links beside them, which listed Analytics twice (owner's note, image-94)
    // — and reached the approvals queue under two names.
    render(
      <SiteHeader
        showAdminLink
        signedIn
        role="admin"
        tabs={roleTabs("admin")}
        account={{ initial: "A", name: "Tourism Office" }}
      />,
    );

    expect(navLinks()).toEqual(["Analytics", "Approvals", "Content", "Guides", "Packages"]);
  });

  it("keeps the office's links off a page that does not ask for them", () => {
    render(<SiteHeader signedIn role="admin" tabs={roleTabs("admin")} account={{ initial: "A", name: "Tourism Office" }} />);

    expect(navLinks()).toEqual(["Analytics", "Approvals", "Content"]);
  });

  it("gives a visitor the destinations and no role links at all", () => {
    render(<SiteHeader />);

    expect(navLinks()).toEqual(["Plan a trip", "Trips", "Places", "Events", "Souvenirs"]);
  });
});
