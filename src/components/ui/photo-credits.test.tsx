/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PhotoCredits } from "./photo-credits";
import { PHOTOS } from "@/lib/photo-credits";

describe("PhotoCredits", () => {
  it("links a credited photo to its source and its licence", () => {
    render(<PhotoCredits keys={["bagasbas"]} />);

    const photo = PHOTOS.bagasbas;
    expect(screen.getByRole("link", { name: photo.title })).toHaveAttribute("href", photo.sourceUrl);
    expect(screen.getByRole("link", { name: photo.licence })).toHaveAttribute("href", photo.licenceUrl);
    expect(screen.getByText(new RegExp(photo.creator))).toBeInTheDocument();
  });

  it("credits a placeholder photo in plain text, without an empty link", () => {
    const { container } = render(<PhotoCredits keys={["calaguasHillside"]} />);

    // Every link on the line must have a name and somewhere to go.
    const links = Array.from(container.querySelectorAll("a"));
    links.forEach((link) => {
      expect(link.getAttribute("href")).not.toBe("");
      expect(link.textContent?.trim()).not.toBe("");
    });

    expect(screen.getAllByText(/\[replace before launch\]/).length).toBeGreaterThan(0);
    // No licence was given, so no empty parentheses either.
    expect(container.textContent).not.toMatch(/\(\)/);
  });

  it("puts a separator between photos and a full stop at the end", () => {
    const { container } = render(<PhotoCredits keys={["bagasbas", "apuao"]} />);

    expect(container.textContent).toContain(" · ");
    expect(container.textContent?.trim().endsWith(".")).toBe(true);
  });
});
