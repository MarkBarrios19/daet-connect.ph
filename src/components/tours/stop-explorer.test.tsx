/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StopExplorer } from "@/components/tours/stop-explorer";
import type { StopDetail } from "@/lib/tours/stop-details";

// The map itself is tested in free-map.test.tsx; here it records what it was asked to do.
const mapProps: {
  focusId?: string | null;
  fitKey?: string;
  labels?: boolean;
  onMarkerClick?: (id: string) => void;
  markers?: Array<{ id: string; label: string; subtitle?: string }>;
} = {};
jest.mock("@/components/maps/free-map", () => ({
  FreeMap: (props: typeof mapProps) => {
    Object.assign(mapProps, props);
    return <div data-testid="map" />;
  },
}));

const stops: StopDetail[] = [
  { id: "s1", name: "First José Rizal Monument", description: "Raised in 1898.", lat: 14.1131, lng: 122.9545, photo: { src: "/photos/rizal-monument.jpg", alt: "The Rizal monument" }, href: "/tours/attractions/first-rizal-monument", subtitle: "Heritage site" },
  { id: "s2", name: "Lunch stop", description: "x".repeat(300), lat: null, lng: null, photo: null, href: null, subtitle: null },
  { id: "s3", name: "Bagasbas Beach", description: null, lat: 14.1316, lng: 122.9851, photo: null, href: null, subtitle: null },
];
const legs = [{ distanceM: 4200, durationS: 600, polyline: null, estimated: true }];

const toggle = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  for (const key of Object.keys(mapProps)) delete (mapProps as Record<string, unknown>)[key];
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  Element.prototype.scrollIntoView = jest.fn();
});

describe("StopExplorer", () => {
  it("sticks its map below the site header, not under it", () => {
    const { container } = render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park, 6:00 AM" title="Route map" />);
    // The header is sticky at the top of the screen and translucent, so a map
    // stuck at top-0 (or a fixed offset smaller than the header) shows through
    // it. The offset is the header's own height, as on the FAQ page.
    const sticky = container.querySelector(".sticky") as HTMLElement;
    expect(sticky.className).toContain("top-[var(--header-h)]");
    expect(sticky.className).toContain("lg:top-[calc(var(--header-h)+1.5rem)]");
    expect(sticky.className).not.toMatch(/(^|\s)top-0(\s|$)/);
    expect(sticky.className).not.toContain("lg:top-24");
  });

  it("lists the start and every stop, numbering pins by their place in the list", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park, 6:00 AM" title="Route map" />);
    expect(screen.getByText("Rizal Park, 6:00 AM")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(mapProps.markers?.map((m) => [m.id, m.label, m.subtitle])).toEqual([
      ["s1", "1", "Heritage site"],
      ["s3", "3", undefined],
    ]);
    expect(mapProps.labels).toBe(true);
    expect(toggle("First José Rizal Monument")).toHaveTextContent("About 10 min (4.2 km) to the next stop");
  });

  it("opens one stop at a time and flies the map to it", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    expect(mapProps.focusId).toBeNull();
    fireEvent.click(toggle("First José Rizal Monument"));
    expect(toggle("First José Rizal Monument")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("img", { name: "The Rizal monument" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "More about First José Rizal Monument" })).toHaveAttribute("href", "/tours/attractions/first-rizal-monument");
    expect(mapProps.focusId).toBe("s1");
    expect(screen.getByText("Stop 1 of 3").parentElement).toHaveTextContent("Stop 1 of 3: First José Rizal Monument");

    fireEvent.click(toggle("Bagasbas Beach"));
    expect(toggle("First José Rizal Monument")).toHaveAttribute("aria-expanded", "false");
    expect(mapProps.focusId).toBe("s3");
    expect(screen.getByText("Stop 3 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See less" }));
    expect(toggle("Bagasbas Beach")).toHaveAttribute("aria-expanded", "false");
    expect(mapProps.focusId).toBeNull();
  });

  it("opens a stop without a pin in the list only, and clamps long text behind Read more", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    fireEvent.click(toggle("Lunch stop"));
    expect(mapProps.focusId).toBeNull();
    expect(screen.getByText(/no map pin for this stop/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Read more" }));
    expect(screen.getByRole("button", { name: "Read less" })).toBeInTheDocument();
  });

  it("steps through stops with previous and next, wrapping at the ends", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    fireEvent.click(screen.getByRole("button", { name: "Next stop" }));
    expect(mapProps.focusId).toBe("s1");
    fireEvent.click(screen.getByRole("button", { name: "Previous stop" }));
    expect(toggle("Bagasbas Beach")).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Next stop" }));
    expect(mapProps.focusId).toBe("s1");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("opens the stop for a tapped pin, and Recenter itinerary closes it and reframes", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    const fit = mapProps.fitKey;
    act(() => mapProps.onMarkerClick?.("s3"));
    expect(toggle("Bagasbas Beach")).toHaveAttribute("aria-expanded", "true");
    expect(mapProps.focusId).toBe("s3");
    fireEvent.click(screen.getByRole("button", { name: "Recenter itinerary" }));
    expect(toggle("Bagasbas Beach")).toHaveAttribute("aria-expanded", "false");
    expect(mapProps.fitKey).not.toBe(fit);
    expect(mapProps.focusId).toBeNull();
  });
});
