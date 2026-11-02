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
  it("is the owner's ticket: one navy frame, a white half and a blue half", () => {
    // The owner's SVG (image-49): a frame bitten along every edge, the blue
    // field inside it, and the left half white for the photograph.
    const { container } = render(<BookingSteps />);

    const band = container.querySelector("[data-ticket]") as HTMLElement;
    expect(band).toBeInTheDocument();
    expect(band.className).toContain("ticket-band");

    // The frame is a decorative layer behind the words, masked into the bites,
    // so nothing a visitor reads is ever clipped by it.
    const frame = band.firstElementChild as HTMLElement;
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.className).toContain("ticket-frame");
    expect(frame.className).toContain("bg-ticket-frame");

    const words = band.querySelector('[data-ticket-panel="words"]') as HTMLElement;
    const steps = band.querySelector('[data-ticket-panel="steps"]') as HTMLElement;
    expect(words.className).toContain("bg-surface");
    expect(steps.className).toContain("bg-blue-600");

    // The heading and the photograph's place are in the white half …
    expect(words.querySelector("h2")?.textContent).toBe("Booking, in three moves");
    expect(words.querySelector("[data-booking-photo]")).not.toBeNull();
    // … and the three moves, word for word, in the blue one.
    const items = Array.from(steps.querySelectorAll("ol > li"));
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Pick a trip and a date.",
      "Send your request.",
      "Show your ticket QR.",
    ]);
  });

  it("says where the photograph goes instead of showing one", () => {
    // No fabricated stand-in: the owner is supplying the photo, so the space
    // says so in words until it lands.
    const { container } = render(<BookingSteps />);
    const photo = container.querySelector("[data-booking-photo]") as HTMLElement;

    expect(photo.textContent).toContain("image here");
    expect(photo.textContent).toContain("[placeholder:");
    expect(photo.querySelector("img")).toBeNull();
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
