/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AskBand } from "./ask-band";
import { BookingSteps } from "./booking-steps";
import { GettingHere } from "./getting-here";
import { HomeMap, type MapPlace } from "./home-map";
import { GETTING_HERE, GETTING_HERE_CHECK, GETTING_HERE_SOURCES } from "@/lib/getting-here";
import { PHOTOS } from "@/lib/photo-credits";

let mockMapProps: { markers: Array<{ id: string; lat: number; lng: number; title: string }>; onMarkerClick?: (id: string) => void; fitKey: string } | null =
  null;

jest.mock("@/components/maps/free-map", () => ({
  FreeMap: (props: typeof mockMapProps) => {
    mockMapProps = props;
    return <div data-map />;
  },
}));

beforeEach(() => {
  mockMapProps = null;
  window.history.replaceState(null, "", "/");
});

describe("GettingHere", () => {
  it("shows the three researched routes, word for word", () => {
    render(<GettingHere />);

    GETTING_HERE.forEach((card) => {
      expect(screen.getByRole("heading", { level: 3, name: card.title })).toBeInTheDocument();
      expect(screen.getByText(card.text)).toBeInTheDocument();
    });
  });

  it("draws the routes as one band: numbered, ruled between, outlined once", () => {
    // The owner's reference (image-47): a single outlined card, a rule between
    // one column and the next, a number and an icon at the top of each — not
    // three loose cards that happen to sit in a row.
    const { container } = render(<GettingHere />);

    const band = container.querySelector("[data-routes]") as HTMLElement;
    expect(band).toBeInTheDocument();
    expect(band.className).toContain("card-edge");
    expect(band.className).toContain("rounded-2xl");

    const items = Array.from(band.querySelectorAll("li"));
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.querySelector("span")?.textContent)).toEqual(["01", "02", "03"]);
    items.forEach((item) => expect(item.querySelector("svg")).not.toBeNull());
    // The rules are the list's own dividers: one band, not three boxes.
    expect(band.querySelector("ul")!.className).toContain("divide-x");
    expect(items[0].className).not.toContain("rounded-2xl");
  });

  it("ends with the check-before-you-travel line", () => {
    render(<GettingHere />);

    expect(screen.getByText(GETTING_HERE_CHECK)).toBeInTheDocument();
  });

  it("links every source it was researched from, in a new tab", () => {
    render(<GettingHere />);

    GETTING_HERE_SOURCES.forEach((source) => {
      const link = screen.getByRole("link", { name: source.label });
      expect(link).toHaveAttribute("href", source.href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    });
  });

  it("states no fares or departure times as fact", () => {
    render(<GettingHere />);
    const copy = GETTING_HERE.map((card) => card.text).join(" ");

    expect(copy).not.toMatch(/₱|\bPHP\b|\bpesos\b/);
    expect(copy).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });
});

describe("BookingSteps", () => {
  it("is the owner's ticket: their shape, their lettering, the photograph and the three moves", () => {
    // The owner's design (image-62) and the two SVGs they sent with it: one
    // ticket shape with a bite out of its top and bottom edges and a dashed
    // perforation down the middle, the lettering straddling that seam, the
    // photograph inset in the left half and the three moves on the right.
    const { container } = render(<BookingSteps />);

    const band = container.querySelector("[data-ticket]") as HTMLElement;
    expect(band).toBeInTheDocument();

    // The ticket is a decorative layer behind everything, in the theme's own
    // colour — inlined rather than linked, so dark mode can turn it over.
    const shape = band.querySelector("[data-ticket-shape]") as HTMLElement;
    expect(shape.getAttribute("aria-hidden")).toBe("true");
    expect(shape.className).toContain("absolute");
    expect(shape.className).toContain("text-ticket-frame");
    const svg = shape.querySelector("svg") as SVGSVGElement;
    // Stretched to the band, which is never the reference's own ratio.
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    expect(svg.querySelectorAll("path")).toHaveLength(2);
    expect(svg.querySelector("path")!.getAttribute("fill")).toBe("currentColor");

    // The photograph, inset from the ticket's edge, with the same paper on it.
    const photo = band.querySelector("[data-ticket-photo]") as HTMLElement;
    const image = photo.querySelector("img") as HTMLImageElement;
    expect(image.getAttribute("src")).toContain("rizal-monument-park");
    expect(image.getAttribute("alt")).toBe(PHOTOS.rizalMonumentPark.alt);
    expect(photo.querySelector(".ticket-noise")).not.toBeNull();
    expect(photo.className).toContain("rounded-[1.25rem]");

    // The lettering is the owner's file, not a redrawn one.
    const art = band.querySelector("[data-ticket-art]") as HTMLElement;
    expect((art.querySelector("img") as HTMLImageElement).getAttribute("src")).toBe(
      "/ticket/booking-in-3-moves.svg",
    );
    // Between the halves on a phone; over the perforation once they sit side by side.
    expect(art.className).toContain("md:absolute");
    expect(art.className).toContain("md:left-[56%]");

    // The right half is the warm white card with the three moves, word for word.
    const panel = band.querySelector("[data-ticket-panel]") as HTMLElement;
    expect(panel.className).toContain("bg-ticket-panel");
    expect(panel.className).toContain("text-daet-ink");
    expect(panel.querySelector(".ticket-noise")).not.toBeNull();
    const items = Array.from(panel.querySelectorAll("ol > li"));
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Pick a trip and a date.",
      "Send your request.",
      "Show your ticket QR.",
    ]);

    // What the lettering says for the eye, the heading says for a screen reader.
    const heading = band.querySelector("h2") as HTMLElement;
    expect(heading.id).toBe("home-how");
    expect(heading.className).toContain("sr-only");
    expect(heading.textContent).toBe("Booking, in three moves");

    // The placeholder box is gone: the photograph is in its place.
    expect(band.textContent).not.toContain("image here");
  });
});

describe("HomeMap", () => {
  const places: MapPlace[] = [
    { slug: "bagasbas-beach", name: "Bagasbas Beach", lat: 14.1155, lng: 122.9685 },
    { slug: "first-rizal-monument", name: "First Rizal Monument", lat: 14.1131, lng: 122.9545 },
  ];

  it("pins every place it is given, and frames them together", () => {
    render(<HomeMap places={places} />);

    expect(mockMapProps?.markers.map((marker) => marker.id)).toEqual(["bagasbas-beach", "first-rizal-monument"]);
    expect(mockMapProps?.markers[0]).toMatchObject({ lat: 14.1155, lng: 122.9685, title: "Bagasbas Beach" });
    expect(mockMapProps?.fitKey).toContain("bagasbas-beach:14.1155,122.9685");
  });

  it("holds the map back until the section is nearly on screen", () => {
    const seen: IntersectionObserverCallback[] = [];
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        seen.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(global, "IntersectionObserver", { configurable: true, writable: true, value: FakeObserver });

    try {
      render(<HomeMap places={places} />);
      expect(mockMapProps).toBeNull();

      act(() => {
        seen[0]([{ isIntersecting: true }] as unknown as IntersectionObserverEntry[], {} as IntersectionObserver);
      });

      expect(mockMapProps).not.toBeNull();
    } finally {
      Object.defineProperty(global, "IntersectionObserver", { configurable: true, writable: true, value: undefined });
    }
  });

  it("opens the tapped place in the fan and takes the page back up to it", () => {
    const scrollTo = jest.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, writable: true, value: scrollTo });
    render(<HomeMap places={places} />);

    mockMapProps?.onMarkerClick?.("first-rizal-monument");

    expect(window.location.hash).toBe("#place-first-rizal-monument");
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});

describe("AskBand", () => {
  it("asks the assistant to open", () => {
    const opened = jest.fn();
    window.addEventListener("daet:open-assistant", opened);
    render(<AskBand />);

    fireEvent.click(screen.getByRole("button", { name: "Ask what to do in one day" }));

    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("daet:open-assistant", opened);
  });
});
