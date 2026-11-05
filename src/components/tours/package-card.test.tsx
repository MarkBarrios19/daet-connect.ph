/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PackageCard } from "./package-card";

const PKG = {
  id: "pkg-1",
  title: "Calaguas day tour",
  location_name: "Calaguas Islands (Mahabang Buhangin), Vinzons",
  duration_value: 1,
  duration_type: "days",
  cover_image_url: "https://example.supabase.co/storage/v1/object/public/covers/calaguas.jpg",
  tours_package_price_variants: [{ price_per_pax: 1999, flat_price: null, is_default: true }],
};

describe("PackageCard", () => {
  it("leads with the trip's own photo, and links to the trip", () => {
    render(<PackageCard package={PKG} />);

    expect(screen.getByRole("img", { name: PKG.title })).toHaveAttribute("src", PKG.cover_image_url);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/tours/packages/pkg-1");
    expect(screen.getByRole("heading", { level: 2, name: PKG.title })).toBeInTheDocument();
  });

  it("shows a credited photo of the place when the trip has no cover of its own", () => {
    render(<PackageCard package={{ ...PKG, cover_image_url: null }} />);

    // Never an empty block, and never an invented picture: the place's own photo.
    expect(screen.getByRole("img")).toHaveAccessibleName(/Vinzons/);
  });

  it("says how long it takes and what it costs", () => {
    render(<PackageCard package={PKG} />);

    expect(screen.getByText("1 day")).toBeInTheDocument();
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("₱1,999.00")).toBeInTheDocument();
    expect(screen.getByText("/ person")).toBeInTheDocument();
  });

  it("says / group for a flat price, and leaves the price out when there is none", () => {
    const { rerender } = render(
      <PackageCard
        package={{ ...PKG, tours_package_price_variants: [{ price_per_pax: null, flat_price: 5000, is_default: true }] }}
      />,
    );
    expect(screen.getByText("/ group")).toBeInTheDocument();

    rerender(<PackageCard package={{ ...PKG, tours_package_price_variants: [] }} />);
    expect(screen.queryByText("From")).not.toBeInTheDocument();
  });

  it("shows the rating when there is one, and says it is new when there is not", () => {
    const { rerender } = render(<PackageCard package={PKG} rating={{ average: 4.3, count: 12 }} />);
    expect(screen.getByText("4.3")).toBeInTheDocument();
    expect(screen.getByText("(12)")).toBeInTheDocument();

    rerender(<PackageCard package={PKG} rating={null} />);
    expect(screen.getByText("New, no reviews yet")).toBeInTheDocument();
  });

  it("can sit inside a section heading without claiming its level", () => {
    render(<PackageCard package={PKG} headingLevel={3} />);

    // The home page labels its band with an h2; the cards are h3 there.
    expect(screen.getByRole("heading", { level: 3, name: PKG.title })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });
});
