/**
 * @jest-environment jsdom
 */

import React, { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("links to Google Maps at the place's own coordinates, and to the trips near it", () => {
    // "Open on the map" became "Open in Google Maps" (owner's note, image-92):
    // the visitor who wants directions wants them in the app they already have.
    renderDetail({ places: MAP_PLACES });

    const maps = screen.getByRole("link", { name: /open in google maps/i });
    expect(maps).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=14.131583,122.985083");
    expect(maps).toHaveAttribute("target", "_blank");
    expect(maps).toHaveAttribute("rel", "noopener noreferrer");
    // Named for what it does: a new tab has to be announced, not discovered.
    expect(maps).toHaveAccessibleName(/opens in a new tab/i);

    expect(screen.getByRole("link", { name: "Trips near here" })).toHaveAttribute("href", FAN_PLACES[2].toursHref);
  });

  it("searches Google Maps by name when the place has no pin yet", () => {
    // Nothing to give Google but the place's name, and a button that says it
    // opens a map must still open one.
    renderDetail({ places: [] });

    expect(screen.getByRole("link", { name: /open in google maps/i })).toHaveAttribute(
      "href",
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Bagasbas Beach, Daet, Camarines Norte")}`,
    );
  });

  it("leaves the place open behind Google Maps", () => {
    // An external link is a navigation away; the hash is what holds this card
    // open, so nothing here may touch it on the way out.
    renderDetail({ places: MAP_PLACES });

    const maps = screen.getByRole("link", { name: /open in google maps/i });
    fireEvent.click(maps);

    expect(window.location.hash).toBe("");
    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: /open in google maps/i })).toBeVisible();

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

  it("docks its card to the foot of the screen on a phone, as a sheet", () => {
    renderDetail({ phone: true, places: MAP_PLACES });

    // The owner asked for the map at the phone's foot to go, and then for the
    // card to become a sheet at the foot of the photo (image-74) rather than a
    // card floating under the bar.
    expect(screen.queryByRole("region", { name: /Map showing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-fun-fact]")).not.toBeInTheDocument();

    const card = document.querySelector("[data-detail]") as HTMLElement;
    // Docked: only its top corners are rounded, it is the screen's width, and it
    // leaves room for a phone's own safe area under the words.
    expect(card.className).toContain("rounded-t-2xl");
    expect(card.className).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
    expect(card.className).not.toContain("max-w-[18rem]");
    expect(card.className).toContain("max-h-[85svh]");
    // The layer it sits in is the foot of the photo, not the space under the bar.
    expect(card.parentElement!.parentElement!.className).toContain("bottom-0");
    expect(card.parentElement!.parentElement!.className).not.toContain("top-[calc(var(--header-h)");
  });

  it("keeps the map on a desktop, in the page's column", () => {
    renderDetail({ places: MAP_PLACES });

    expect(screen.getByRole("region", { name: /Map showing Bagasbas Beach/ })).toBeInTheDocument();
    const card = document.querySelector("[data-detail]") as HTMLElement;
    expect(card.className).toContain("max-w-[18rem]");
    expect(card.className).not.toContain("rounded-t-2xl");
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

  it("folds its sheet back to a peek when the place changes on a phone", () => {
    const { rerender } = renderDetail({ phone: true });

    fireEvent.click(screen.getByRole("button", { name: "Show the place's details" }));
    expect(document.getElementById("place-detail-body")).not.toHaveAttribute("hidden");

    // The next place arrives: a phone shows its photo, so the sheet goes back to
    // the peek rather than staying open over half of it.
    rerender(
      <PlaceDetail
        place={FAN_PLACES[0]}
        index={0}
        total={FAN_PLACES.length}
        phone
        headingRef={createRef<HTMLHeadingElement>()}
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onPick={jest.fn()}
      />,
    );

    expect(document.getElementById("place-detail-body")).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Show the place's details" })).toBeInTheDocument();
  });

  it("leads with the map card, and stands the place card beside it", () => {
    const { container } = renderDetail({ places: MAP_PLACES });

    // The owner's sketch (image-30): map card first, the place's own card to its
    // right. The third card the sketch had — the Fun fact — was dropped on the
    // owner's word (image-45): every place would have shown a placeholder.
    const order = Array.from(container.querySelectorAll("[data-place-map], [data-detail], [data-fun-fact]")).map(
      (element) =>
        element.hasAttribute("data-place-map") ? "map" : element.hasAttribute("data-detail") ? "card" : "fun fact",
    );
    expect(order).toEqual(["map", "card"]);

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

  it("folds the card away when the pin it points at is tapped, and brings it back", () => {
    // The card floats over the map the visitor is working in, so the pin under it
    // has to be able to put it out of the way (owner's note, image-81).
    const { onPick } = renderDetail({ places: MAP_PLACES });
    const card = document.querySelector("[data-map-place]") as HTMLElement;
    const pins = within(screen.getByRole("region", { name: /map showing/i }));
    expect(card).toHaveAttribute("data-open", "true");

    fireEvent.click(pins.getByRole("button", { name: "Bagasbas Beach" }));
    expect(card).toHaveAttribute("data-open", "false");
    // Folded away, not stepped to: the place is still the one showing.
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.click(pins.getByRole("button", { name: "Bagasbas Beach" }));
    expect(card).toHaveAttribute("data-open", "true");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("opens the place whose pin was tapped, and the card comes back with it", () => {
    const { onPick } = renderDetail({ places: MAP_PLACES });
    const card = document.querySelector("[data-map-place]") as HTMLElement;
    const pins = within(screen.getByRole("region", { name: /map showing/i }));

    fireEvent.click(pins.getByRole("button", { name: "Bagasbas Beach" }));
    expect(card).toHaveAttribute("data-open", "false");

    // Any other pin is a place to open, and the card belongs to whichever place
    // is showing — so it comes back rather than staying folded.
    fireEvent.click(pins.getByRole("button", { name: "Calaguas" }));
    expect(onPick).toHaveBeenCalledWith("tinaga-island-calaguas");
    expect(card).toHaveAttribute("data-open", "true");
  });

  it("has no Fun fact card at all", () => {
    // The owner asked for it to go (image-45). Nothing else was standing in for
    // it either: the card had a placeholder for every place in the fan.
    renderDetail({ places: MAP_PLACES });

    expect(document.querySelector("[data-fun-fact]")).toBeNull();
    expect(screen.queryByText(/fun fact/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /fun fact/i })).toBeNull();
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
