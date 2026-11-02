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
  {
    slug: "tinaga-island-calaguas",
    name: "Calaguas",
    lat: 14.4692,
    lng: 122.945,
  },
  {
    slug: "apuao-grande-island",
    name: "Apuao sandbar",
    lat: 14.0823,
    lng: 123.1048,
  },
  {
    slug: "bagasbas-beach",
    name: "Bagasbas Beach",
    lat: 14.131583,
    lng: 122.985083,
  },
  {
    slug: "first-rizal-monument",
    name: "First Rizal Monument",
    lat: 14.1131,
    lng: 122.9545,
  },
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

    const fold = screen.getByRole("button", {
      name: "Hide the place's details",
    });
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
    // The Fun fact card is part of the desktop row too.
    expect(document.querySelector("[data-fun-fact]")).not.toBeInTheDocument();
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

  it("leads with the map card, and stands the place card and the Fun fact card beside it", () => {
    const { container } = renderDetail({ places: MAP_PLACES });

    // The owner's sketch (image-30): map card first, the place's own card to its
    // right, and the Fun fact card under that one.
    const order = Array.from(container.querySelectorAll("[data-place-map], [data-detail], [data-fun-fact]")).map(
      (element) =>
        element.hasAttribute("data-place-map") ? "map" : element.hasAttribute("data-detail") ? "card" : "fun fact",
    );
    expect(order).toEqual(["map", "card", "fun fact"]);

    // The two of them share a row, so the card is beside the map and not under it.
    expect(container.querySelector("[data-detail]")!.parentElement).not.toBe(
      container.querySelector("[data-place-map]")!.parentElement,
    );
    expect(
      container.querySelector("[data-detail]")!.parentElement!.parentElement?.querySelector("[data-place-map]"),
    ).not.toBeNull();
  });

  it("stands its cards at the photo's left edge on a desktop, not on the page's column", () => {
    renderDetail({ places: MAP_PLACES });

    // The owner asked for the cards flush to the left: they hug the page's edge
    // rather than sitting on its centred 7xl column.
    const frame = document.querySelector("[data-detail-frame]") as HTMLElement;
    expect(frame.className).toContain("pl-3");
    expect(frame.className).not.toContain("mx-auto");
    expect(frame.className).not.toContain("max-w-7xl");
  });

  it("unfolds with the layout when a narrow window is widened", () => {
    const { rerender } = renderDetail({ phone: true });
    expect(document.getElementById("place-detail-body")).toHaveAttribute("hidden");

    // The window grew: the card would otherwise stay folded on a desktop.
    rerender(
      <PlaceDetail
        place={FAN_PLACES[2]}
        index={2}
        total={FAN_PLACES.length}
        phone={false}
        headingRef={createRef<HTMLHeadingElement>()}
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onPick={jest.fn()}
      />,
    );
    expect(document.getElementById("place-detail-body")).not.toHaveAttribute("hidden");
  });

  it("puts the place's own photo, name and line on the map card", () => {
    const { container } = renderDetail({ places: MAP_PLACES });

    const overTheMap = container.querySelector("[data-map-place]") as HTMLElement;
    expect(overTheMap).toBeInTheDocument();
    expect(overTheMap).toHaveTextContent("Bagasbas Beach");
    expect(overTheMap).toHaveTextContent(FAN_PLACES[2].text);
    expect(overTheMap.querySelector("img")).toHaveAttribute("src", expect.stringContaining("bagasbas"));
    // The layout the owner sketched (image-42): the photo across the top, the
    // name under it, then the line about the place — and a tail on the card's
    // bottom edge, which is what points it at the pin below.
    expect(overTheMap.querySelector("img")).toHaveClass("h-16", "w-full", "object-cover");
    const tail = overTheMap.querySelector("[data-map-place-tail]") as HTMLElement;
    expect(tail).toBeInTheDocument();
    expect(tail).toHaveClass("rotate-45");
    // Nothing in it takes the pointer: the map underneath still drags.
    expect(overTheMap).toHaveClass("pointer-events-none");
    // Leaflet paints its panes at 200–800 inside the map, so a plain absolutely
    // positioned sibling sits *under* every one of them — which is how this card
    // went missing on the owner's screen. It has to be lifted over them.
    expect(overTheMap).toHaveClass("z-[800]");
  });

  it("carries the Fun fact line, and folds it away and back", () => {
    renderDetail({ places: MAP_PLACES });

    // No place has a fact written yet, so the card says so rather than making one up.
    expect(screen.getByText(/\[placeholder: a fun fact about Bagasbas Beach/)).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Hide the fun fact" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);

    expect(document.getElementById("place-fun-fact-body")).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Show the fun fact" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Show the fun fact" }));
    expect(document.getElementById("place-fun-fact-body")).not.toHaveAttribute("hidden");
  });

  it("pins the map card to the place it is showing", () => {
    renderDetail({ places: MAP_PLACES });

    expect(screen.getByText("Viewing")).toBeInTheDocument();
    const map = screen.getByRole("region", {
      name: /Map showing Bagasbas Beach/,
    });
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
