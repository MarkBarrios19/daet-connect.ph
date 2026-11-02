/**
 * @jest-environment jsdom
 */

import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlaceDetail } from "./place-detail";
import { FAN_PLACES } from "./fan-places";
import type { MapPoint } from "./place-map-panel";

// Leaflet is a browser library and its own behaviour is pinned in free-map.test;
// here the map is a stand-in that reports what it was asked to show.
jest.mock("@/components/maps/free-map", () => ({
  FreeMap: ({
    markers,
    title,
    focusId,
    fitKey,
    onMarkerClick,
  }: {
    markers: Array<{ id: string; title: string }>;
    title: string;
    focusId?: string | null;
    fitKey?: string;
    onMarkerClick?: (id: string) => void;
  }) => (
    <div role="region" aria-label={title} data-focus={focusId ?? ""} data-fit={fitKey ?? ""}>
      {markers.map((marker) => (
        <button key={marker.id} type="button" onClick={() => onMarkerClick?.(marker.id)}>
          {marker.title}
        </button>
      ))}
    </div>
  ),
}));

/** The seeded coordinates, as the places table has them. */
const MAP_PLACES: MapPoint[] = [
  { slug: "tinaga-island-calaguas", name: "Calaguas", lat: 14.4692, lng: 122.945 },
  { slug: "apuao-grande-island", name: "Apuao sandbar", lat: 14.0823, lng: 123.1048 },
  { slug: "bagasbas-beach", name: "Bagasbas Beach", lat: 14.131583, lng: 122.985083 },
  { slug: "first-rizal-monument", name: "First Rizal Monument", lat: 14.1131, lng: 122.9545 },
];

const renderDetail = (overrides: Partial<React.ComponentProps<typeof PlaceDetail>> = {}) => {
  const handlers = { onPrev: jest.fn(), onNext: jest.fn(), onPick: jest.fn() };
  const view = render(
    <PlaceDetail
      place={FAN_PLACES[2]}
      index={2}
      total={FAN_PLACES.length}
      phone={false}
      headingRef={createRef<HTMLHeadingElement>()}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...view, ...handlers };
};

describe("PlaceDetail", () => {
  it("names the place, its position in the fan and the owner's copy", () => {
    renderDetail();

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    expect(screen.getByText("3 of 6")).toBeInTheDocument();
    expect(screen.getByText("Beach")).toBeInTheDocument();
    expect(screen.getByText(FAN_PLACES[2].text)).toBeInTheDocument();
  });

  it("links to the map, and to the trips near it", () => {
    renderDetail();

    // "See the place" became "Open on the map" at the owner's request: the photo
    // already shows the place, and the map is where the pins open it again.
    expect(screen.getByRole("link", { name: "Open on the map" })).toHaveAttribute("href", "#home-map");
    expect(screen.getByRole("link", { name: "Trips near here" })).toHaveAttribute("href", FAN_PLACES[2].toursHref);
  });

  it("scrolls to the map without dropping the place it is showing", () => {
    const original = Element.prototype.scrollIntoView;
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    // jsdom lays nothing out, so give the page the element the card points at.
    const map = document.createElement("h2");
    map.id = "home-map";
    document.body.appendChild(map);

    try {
      renderDetail();
      fireEvent.click(screen.getByRole("link", { name: "Open on the map" }));

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      // The hash is what holds this card open: changing it would close the
      // place on the way to the map.
      expect(window.location.hash).toBe("");
    } finally {
      map.remove();
      Element.prototype.scrollIntoView = original;
    }
  });

  it("reports the step buttons to the handlers", () => {
    const { onPrev, onNext } = renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Previous place" }));
    fireEvent.click(screen.getByRole("button", { name: "Next place" }));

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("has no ✕ anywhere: Escape and the photo are the way out", () => {
    renderDetail();

    // The owner asked for the ✕ on the photo's right to go, and with it the
    // arrows that floated over the photo's bottom right corner.
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("folds down to a bar that keeps the place's name, and opens again", () => {
    renderDetail();

    const body = document.getElementById("place-detail-body") as HTMLElement;
    expect(body).not.toHaveAttribute("hidden");
    expect(screen.getByRole("link", { name: "Open on the map" })).toBeVisible();

    const fold = screen.getByRole("button", { name: "Hide the place's details" });
    expect(fold).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(fold);

    expect(screen.getByRole("button", { name: "Show the place's details" })).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("place-detail-body")).toHaveAttribute("hidden");
    // The name stays: it is the card, and the map under it still has to say what
    // it is showing.
    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show the place's details" }));
    expect(document.getElementById("place-detail-body")).not.toHaveAttribute("hidden");
  });

  it("centres its card on a phone and leaves the photo the whole screen", () => {
    renderDetail({ phone: true, places: MAP_PLACES });

    // The owner asked for the map at the phone's foot to go, and for the card to
    // move from the left edge to the middle.
    expect(screen.queryByRole("region", { name: /Map showing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-detail]")!.className).toContain("mx-auto");
  });

  it("keeps the map on a desktop, in the page's column", () => {
    renderDetail({ places: MAP_PLACES });

    expect(screen.getByRole("region", { name: /Map showing Bagasbas Beach/ })).toBeInTheDocument();
    expect(document.querySelector("[data-detail]")!.className).not.toContain("mx-auto");
  });

  it("opens folded on a phone, where the photo is the point", () => {
    renderDetail({ phone: true });

    expect(document.getElementById("place-detail-body")).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Show the place's details" })).toBeInTheDocument();
  });

  it("keeps its three buttons at 44px", () => {
    renderDetail();

    ["Previous place", "Next place", "Hide the place's details"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toHaveClass("h-11", "w-11");
    });
  });

  it("puts the map under the card, pinned to the place it is showing", () => {
    renderDetail({ places: MAP_PLACES });

    expect(screen.getByText("Viewing")).toBeInTheDocument();
    const map = screen.getByRole("region", { name: /Map showing Bagasbas Beach/ });
    expect(map).toHaveAttribute("data-focus", "bagasbas-beach");
    // Every place with coordinates is on it, so a visitor can see where this one
    // sits among the rest.
    expect(screen.getByRole("button", { name: "Calaguas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First Rizal Monument" })).toBeInTheDocument();
  });

  it("shows all the places when asked, and goes back to the place on the next step", () => {
    const { rerender } = renderDetail({ places: MAP_PLACES });

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("region", { name: /Map showing/ })).toHaveAttribute("data-focus", "");
    expect(screen.getByRole("region", { name: /Map showing/ })).toHaveAttribute("data-fit", "all");

    rerender(
      <PlaceDetail
        place={FAN_PLACES[3]}
        index={3}
        total={FAN_PLACES.length}
        phone={false}
        headingRef={createRef<HTMLHeadingElement>()}
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onPick={jest.fn()}
        places={MAP_PLACES}
      />,
    );

    expect(screen.getByRole("region", { name: /Map showing First Rizal Monument/ })).toHaveAttribute(
      "data-focus",
      "first-rizal-monument",
    );
  });

  it("opens a place picked on the map", () => {
    const { onPick } = renderDetail({ places: MAP_PLACES });

    fireEvent.click(screen.getByRole("button", { name: "Calaguas" }));

    expect(onPick).toHaveBeenCalledWith("tinaga-island-calaguas");
  });

  it("does not show a map when no place has coordinates yet", () => {
    renderDetail({ places: [] });

    expect(screen.queryByRole("region", { name: /Map showing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
  });
});
