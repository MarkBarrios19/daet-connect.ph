/**
 * @jest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BookingSteps } from "./booking-steps";
import { GettingHere } from "./getting-here";
import { HomeFaq } from "./home-faq";
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
    // colour, bitten by a mask so its circles stay circles at any width.
    const shape = band.querySelector("[data-ticket-shape]") as HTMLElement;
    expect(shape.getAttribute("aria-hidden")).toBe("true");
    expect(shape.className).toContain("absolute");
    const paper = shape.querySelector(".ticket-shape") as HTMLElement;
    expect(paper.className).toContain("ticket-shape");
    expect(paper.className).toContain("bg-ticket-frame");
    // The grain is the owner's noise, at a tenth of what the reference carried.
    expect(paper.querySelector(".ticket-noise")?.className).toContain("opacity-[0.06]");
    // The bites on the edge are worked out from the seam the band measures for
    // itself (ticket-seam), which is what puts them on the left and right edges
    // of a stacked ticket instead of its top and bottom.
    expect(paper.className).toContain("ticket-seam");
    // And the perforation is drawn where the ticket is torn — at 56% of the
    // paper, right of the middle, so the lettering centred on the band crosses
    // it — and not on a phone, where the tear runs across.
    const perf = shape.querySelector("[data-ticket-perf]") as HTMLElement;
    expect(perf.className).toContain("border-dashed");
    expect(perf.className).toContain("border-ticket-perf");
    expect(perf.className).toContain("left-[56%]");
    expect(perf.className).toContain("hidden");
    expect(perf.className).toContain("md:block");

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
    // On the seam between the halves on a phone, half on the photograph and half
    // on the card below it; centred on the band once they sit side by side,
    // which is what keeps it off the words on the card beside it.
    expect(art.className).toContain("ticket-seam");
    expect(art.className).toContain("top-[var(--ticket-seam)]");
    expect(art.className).toContain("left-1/2");
    expect(art.className).toContain("md:top-1/2");

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

  it("keeps the owner's lettering, with its grain at half the strength it arrived at", () => {
    // The artwork carries its own grain: feTurbulence clipped to the letters and
    // flooded with black. It came at 0.27 alpha and the owner asked for half of
    // that on this band (image-72). Reading the file is the only way to see it —
    // the filter never reaches the DOM — and it catches the asset being replaced
    // by the original.
    const lettering = readFileSync(join(process.cwd(), "public/ticket/booking-in-3-moves.svg"), "utf8");
    const grain = /flood-color="rgba\(0, 0, 0, ([\d.]+)\)"/.exec(lettering);

    // The flood's alpha: the strength of every grain in the letters.
    expect(grain).not.toBeNull();
    expect(Number(grain![1])).toBeCloseTo(0.135, 3);
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

describe("Home section breathing room", () => {
  it("gives every section top and bottom vertical breathing room", () => {
    const { container: gettingHere } = render(<GettingHere />);
    const gettingSection = gettingHere.querySelector("section[aria-labelledby='home-getting-here']") as HTMLElement;
    expect(gettingSection.className).toContain("py-20");
    expect(gettingSection.className).toContain("sm:py-28");
    expect(gettingSection.className).toContain("lg:py-36");

    const { container: faq } = render(<HomeFaq />);
    const faqSection = faq.querySelector("section[aria-labelledby='home-faq']") as HTMLElement;
    expect(faqSection.className).toContain("py-20");
    expect(faqSection.className).toContain("sm:py-28");
    expect(faqSection.className).toContain("lg:py-36");

    const { container: ticket } = render(<BookingSteps />);
    const ticketSection = ticket.querySelector("section[aria-labelledby='home-how']") as HTMLElement;
    expect(ticketSection.className).toContain("my-20");
    expect(ticketSection.className).toContain("sm:my-28");
    expect(ticketSection.className).toContain("lg:my-36");

    const homePage = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(homePage).toContain('const SECTION = `${WRAP} py-20 sm:py-28 lg:py-36`');
  });
});
