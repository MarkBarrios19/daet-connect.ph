/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AccountMenu } from "./account-menu";

jest.mock("next/navigation", () => ({ usePathname: () => "/settings" }));
jest.mock("@/components/chat/unread-badge", () => ({
  useUnreadChats: () => 0,
  UnreadMessagesBadge: () => null,
}));

const PHOTO =
  "https://project.supabase.co/storage/v1/object/public/tours-avatars/u/avatar-1.jpg";
const LINKS = [
  { href: "/settings", label: "Profile settings" },
  { href: "/tours/messages", label: "Messages" },
];

describe("AccountMenu", () => {
  it("draws the account photo when there is one", () => {
    const { container } = render(
      <AccountMenu
        initial="J"
        name="Juan Dela Cruz"
        links={LINKS}
        avatarUrl={PHOTO}
      />,
    );

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", PHOTO);
    // Decoration, not a second announcement: the button already carries the name.
    expect(image).toHaveAttribute("alt", "");
    expect(
      container.querySelector("span[aria-hidden='true']"),
    ).toHaveTextContent("");
  });

  it("falls back to the initial when there is no photo", () => {
    const { container } = render(
      <AccountMenu
        initial="J"
        name="Juan Dela Cruz"
        links={LINKS}
        avatarUrl={null}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector("span[aria-hidden='true']"),
    ).toHaveTextContent("J");
  });

  it("opens on Profile settings, as the first of the person's own pages", async () => {
    render(
      <AccountMenu
        initial="J"
        name="Juan Dela Cruz"
        links={LINKS}
        avatarUrl={null}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /your account/i }));
    });

    const menu = screen.getByRole("navigation", { name: "Your account" });
    expect(menu.querySelector("a")).toHaveAttribute("href", "/settings");
    expect(
      screen.getByRole("link", { name: "Profile settings" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
