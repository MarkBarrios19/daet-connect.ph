/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapMarker } from "@/components/maps/map-types";
import { DARK_TILE_FILTER, MAP_TILES } from "@/lib/maps/map-style";

jest.mock("leaflet/dist/leaflet.css", () => ({}), { virtual: true });

type Camera = [string, unknown, number?];

const mockState: {
  fail: boolean;
  tiles: string[];
  attributions: string[];
  camera: Camera[];
  markerEls: HTMLElement[];
  polylineCount: number;
  pane: { style: { filter: string } };
  map: { emit: (event: string) => void } | null;
  layer: { emit: (event: string) => void } | null;
  mapOptions: Record<string, unknown>;
  tileOptions: Record<string, unknown>;
  focusedAt: [number, number] | null;
  wheel: boolean;
  removedMaps: number;
} = {
  fail: false,
  tiles: [],
  attributions: [],
  camera: [],
  markerEls: [],
  polylineCount: 0,
  pane: { style: { filter: "" } },
  map: null,
  layer: null,
  mapOptions: {},
  tileOptions: {},
  focusedAt: null,
  wheel: false,
  removedMaps: 0,
};

// Leaflet is a browser library; this stands in for the parts FreeMap uses and
// records what it asked the map to do.
jest.mock("leaflet", () => {
  class Emitter {
    handlers: Record<string, Array<() => void>> = {};
    on(event: string, fn: () => void) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    }
    once(event: string, fn: () => void) {
      return this.on(event, fn);
    }
    emit(event: string) {
      (this.handlers[event] ?? []).forEach((fn) => fn());
    }
    off(event: string, fn: () => void) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((handler) => handler !== fn);
      return this;
    }
    remove() {}
    addTo() {
      return this;
    }
  }

  class MockMap extends Emitter {
    zoom = 12;
    constructor(options: Record<string, unknown> = {}) {
      super();
      mockState.mapOptions = options;
      if (mockState.fail) throw new Error("no container");
      mockState.map = this;
    }
    setView(_center: unknown, zoom: number) {
      mockState.camera.push(["setView", _center, zoom]);
      this.zoom = zoom;
      return this;
    }
    flyTo(center: unknown, zoom: number) {
      mockState.camera.push(["flyTo", center, zoom]);
      this.zoom = zoom;
      return this;
    }
    fitBounds(bounds: unknown, options: unknown) {
      mockState.camera.push(["fitBounds", bounds]);
      return this;
    }
    getZoom() {
      return this.zoom;
    }
    // Leaflet's own guard, and the reason a map must only be removed once:
    // `Map.remove()` throws this when the container's id no longer matches.
    removed = false;
    remove() {
      if (this.removed) throw new Error("Map container is being reused by another instance");
      this.removed = true;
      mockState.removedMaps += 1;
    }
    getPane() {
      return mockState.pane;
    }
    scrollWheelZoom = {
      enabled: false,
      enable() {
        this.enabled = true;
        mockState.wheel = true;
      },
      disable() {
        this.enabled = false;
        mockState.wheel = false;
      },
    };
    invalidateSize() {
      // Leaflet's map pane is gone once the map is removed: the call that
      // follows throws "Cannot read properties of undefined (reading
      // '_leaflet_pos')", which a phone saw instead of the sketch map.
      if (this.removed) throw new Error("Cannot read properties of undefined (reading '_leaflet_pos')");
    }
    getSize() {
      return { x: 384, y: 256 };
    }
    // Enough projection for the camera offset: the pin is at the world's origin,
    // so anything unprojected from there is the point the test expects.
    project() {
      return { x: 0, y: 0, subtract: () => ({ x: 0, y: 0 }) };
    }
    unproject() {
      return { lat: 14.2, lng: 123 };
    }
    // A fixed spot, so a card pointing at the pin has something to point at.
    latLngToContainerPoint(latlng: [number, number]) {
      mockState.focusedAt = latlng;
      return { x: 140, y: 96 };
    }
  }

  class MockTileLayer extends Emitter {
    constructor(url: string, options: Record<string, unknown> & { attribution?: string }) {
      super();
      mockState.tiles.push(url);
      mockState.attributions.push(options.attribution ?? "");
      mockState.tileOptions = options;
      mockState.layer = this;
    }
  }

  class MockMarker extends Emitter {
    constructor(_latlng: unknown, options: { icon: { html: HTMLElement } }) {
      super();
      const anchor = options.icon.html as HTMLElement;
      mockState.markerEls.push(anchor.firstElementChild as HTMLElement);
    }
    setLatLng() {
      return this;
    }
  }

  class MockPolyline extends Emitter {
    constructor() {
      super();
      mockState.polylineCount += 1;
    }
  }

  return {
    map: (_element: unknown, options: Record<string, unknown>) => new MockMap(options),
    tileLayer: (url: string, options: { attribution?: string }) => new MockTileLayer(url, options),
    marker: (_latlng: unknown, options: { icon: { html: HTMLElement } }) => new MockMarker(_latlng, options),
    polyline: () => new MockPolyline(),
    divIcon: (options: { html: HTMLElement }) => ({ html: options.html }),
    control: { zoom: () => ({ addTo: () => ({}) }) },
  };
});

const markers: FreeMapMarker[] = [
  { id: "a", lat: 14.1131, lng: 122.9545, kind: "stop", label: "1", title: "First José Rizal Monument" },
  { id: "b", lat: 14.1316, lng: 122.9851, kind: "stop", label: "2", title: "Bagasbas Beach" },
];

beforeEach(() => {
  mockState.fail = false;
  mockState.tiles = [];
  mockState.attributions = [];
  mockState.camera = [];
  mockState.markerEls = [];
  mockState.polylineCount = 0;
  mockState.removedMaps = 0;
  mockState.map = null;
  mockState.layer = null;
  mockState.mapOptions = {};
  mockState.tileOptions = {};
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  mockState.pane = { style: { filter: "" } };
  document.documentElement.removeAttribute("data-theme");
});

describe("FreeMap", () => {
  it("shows the OpenStreetMap tiles, credits them, and lists the markers for screen readers", async () => {
    render(<FreeMap markers={markers} title="Route map" />);

    expect(screen.getByRole("region", { name: "Route map" })).toBeInTheDocument();
    expect(screen.getByText("Bagasbas Beach")).toBeInTheDocument();
    await waitFor(() => expect(mockState.tiles).toEqual([MAP_TILES.light]));
    expect(mockState.attributions[0]).toContain("OpenStreetMap");
  });

  it("turns the tiles down on a dark page, and leaves them alone in light", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { unmount } = render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(mockState.tiles).toHaveLength(1));
    expect(mockState.pane.style.filter).toBe(DARK_TILE_FILTER);
    unmount();
  });

  it("draws the sketch when not one tile arrives", async () => {
    render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(mockState.layer).not.toBeNull());

    // Four failures with nothing loaded: the network or the provider is away.
    for (let i = 0; i < 4; i += 1) mockState.layer!.emit("tileerror");

    await waitFor(() => expect(screen.getByRole("img", { name: "Route map" })).toBeInTheDocument());
    expect(screen.getByText(/Sketch map/)).toBeInTheDocument();
  });

  it("removes the map once when the tiles fail, so nothing throws on the way to the sketch", async () => {
    render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(mockState.layer).not.toBeNull());

    for (let i = 0; i < 4; i += 1) mockState.layer!.emit("tileerror");

    await waitFor(() => expect(screen.getByText(/Sketch map/)).toBeInTheDocument());
    // One removal. The effect's cleanup used to remove the same map again a
    // moment later, which Leaflet refuses with "Map container is being reused by
    // another instance" — thrown from the cleanup, caught by error.tsx, and the
    // whole phone page was replaced by "Something went wrong."
    expect(mockState.removedMaps).toBe(1);
    expect(screen.queryByRole("region", { name: "Route map" })).toBeNull();
  });

  it("keeps the map when a tile arrives, even if others fail", async () => {
    render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(mockState.layer).not.toBeNull());

    mockState.layer!.emit("tileload");
    for (let i = 0; i < 6; i += 1) mockState.layer!.emit("tileerror");

    expect(screen.getByRole("region", { name: "Route map" })).toBeInTheDocument();
  });

  it("flies to the focused stop, then drifts closer until the viewer moves the map", async () => {
    const { rerender } = render(<FreeMap markers={markers} title="Route map" labels onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));

    rerender(<FreeMap markers={markers} title="Route map" labels focusId="b" onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.camera.some(([kind]) => kind === "flyTo")).toBe(true));
    expect(mockState.camera.find(([kind]) => kind === "flyTo")?.slice(1)).toEqual([[14.1316, 122.9851], 15.5]);

    // The flight lands: a slow push in follows.
    mockState.map!.emit("moveend");
    await waitFor(() =>
      expect(mockState.camera.some(([kind, , zoom]) => kind === "setView" && (zoom ?? 0) > 15.5)).toBe(true),
    );

    // A new focus whose flight the viewer interrupts by dragging: no drift after it.
    rerender(<FreeMap markers={markers} title="Route map" labels focusId="a" onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.camera.filter(([kind]) => kind === "flyTo")).toHaveLength(2));
    mockState.map!.emit("dragstart");
    const before = mockState.camera.length;
    mockState.map!.emit("moveend");
    expect(mockState.camera.slice(before).some(([kind]) => kind === "setView")).toBe(false);
  });

  it("leaves the camera to the focus, and only reframes when nothing is focused", async () => {
    const { rerender } = render(
      <FreeMap markers={markers} title="Route map" fitKey="a" focusId="a" onMarkerClick={() => {}} />,
    );
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));
    await waitFor(() => expect(mockState.camera.some(([kind]) => kind === "flyTo")).toBe(true));

    // Stepping to the next place moves the focus and the framing key together.
    const before = mockState.camera.length;
    rerender(<FreeMap markers={markers} title="Route map" fitKey="b" focusId="b" onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.camera.filter(([kind]) => kind === "flyTo")).toHaveLength(2));

    // One camera move, not two. A fit on top of the flight takes the zoom somewhere
    // else a moment later and pulls a second level of tiles over the first — the
    // second of the two blank flashes the owner photographed.
    expect(mockState.camera.slice(before).some(([kind]) => kind === "fitBounds")).toBe(false);

    // With nothing focused ("Show all"), the framing comes back.
    const beforeShowAll = mockState.camera.length;
    rerender(<FreeMap markers={markers} title="Route map" fitKey="all" focusId={null} onMarkerClick={() => {}} />);
    await waitFor(() =>
      expect(mockState.camera.slice(beforeShowAll).some(([kind]) => kind === "fitBounds")).toBe(true),
    );
  });

  it("paints the map's own ground under the tiles, and never fades one in from it", async () => {
    const { container } = render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));

    // What shows in the moment before a tile arrives is the map's ground, not the
    // page's near-white: Leaflet's own grey is overridden inline, and the token is
    // the OpenStreetMap land colour (see globals.css).
    const region = container.querySelector("[role='region']") as HTMLElement;
    expect(region.style.background).toBe("var(--color-map-ground)");
    // Leaflet's panes are z-index 400–700. Without a stacking context on this
    // element they escape it and paint over fixed chrome — they covered the chat
    // dock's left edge — so `isolate` is part of the contract, not decoration.
    expect(region.className).toContain("isolate");

    // A tile that appears instantly, the level already on screen kept while the new
    // one is fetched, and a generous buffer past the edges.
    expect(mockState.mapOptions.fadeAnimation).toBe(false);
    expect(mockState.tileOptions.updateWhenZooming).toBe(false);
    expect(Number(mockState.tileOptions.keepBuffer)).toBeGreaterThanOrEqual(2);
  });

  it("labels stops with their name and kind, and draws the picked one as a pin", async () => {
    const labelled = markers.map((m) => (m.id === "b" ? { ...m, subtitle: "Beach" } : m));
    const { rerender } = render(<FreeMap markers={labelled} title="Route map" labels onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));

    const beach = mockState.markerEls[1];
    expect(beach.tagName).toBe("BUTTON");
    expect(beach.getAttribute("aria-label")).toBe("Stop 2: Bagasbas Beach, Beach");
    expect(beach.textContent).toBe("2 Bagasbas Beach Beach");
    // The full name is in the page (CSS shortens it), so its words match the accessible name.
    expect(mockState.markerEls[0].getAttribute("aria-label")).toBe("Stop 1: First José Rizal Monument");
    expect(mockState.markerEls[0].textContent).toBe("1 First José Rizal Monument");

    rerender(<FreeMap markers={labelled} title="Route map" labels focusId="b" onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.markerEls.at(-1)?.getAttribute("aria-current")).toBe("true"));
    // A picked pin hangs from its tip: the shift is by the marker's own height.
    expect(mockState.markerEls.at(-1)?.parentElement?.className).toContain("-translate-y-full");
  });

  it("draws a photo pin as an orange teardrop with the photo in a white ring and the name under it", async () => {
    const photo = { src: "/photos/bagasbas.jpg" };
    const shown = markers.map((m) => (m.id === "b" ? { ...m, kind: "place" as const, photo } : m));

    render(<FreeMap markers={shown} title="Places map" focusId="b" onFocusPoint={() => {}} />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));

    const pin = mockState.markerEls[1];
    const [drop, frame, name] = Array.from(pin.children) as HTMLElement[];
    expect(drop).toHaveClass("bg-orange-500", "rotate-45");
    expect(frame).toHaveClass("rounded-full", "border-white");
    expect(frame.querySelector("img")?.getAttribute("src")).toBe("/photos/bagasbas.jpg");
    expect(name.textContent).toBe(shown[1].title);
    // The pin hangs from its point.
    expect(pin.parentElement?.className).toContain("-translate-y-full");
  });

  it("names each place beside its pin on a labelled map", async () => {
    const places = markers.map((m) => ({ ...m, kind: "place" as const }));
    render(<FreeMap markers={places} title="Places map" labels />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));
    expect(mockState.markerEls[0].textContent).toContain(places[0].title);
  });

  it("zooms with the wheel on every map, unless a map turns it off", async () => {
    const { rerender } = render(<FreeMap markers={markers} title="Places map" />);
    await waitFor(() => expect(mockState.map).not.toBeNull());
    // Scroll to zoom is on by default (the owner asked for it on all maps).
    await waitFor(() => expect(mockState.wheel).toBe(true));

    rerender(<FreeMap markers={markers} title="Places map" wheelZoom={false} />);
    await waitFor(() => expect(mockState.wheel).toBe(false));
  });

  it("draws a category pin with its stop number and name, and the board's buttons over the map", async () => {
    const pins: FreeMapMarker[] = markers.map((m, i) => ({ ...m, icon: i === 0 ? "heritage" : "beach" }));
    render(<FreeMap markers={pins} title="Day 1 map" chip="Day 1 route" labels />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));
    const pin = mockState.markerEls[1];
    // A dark circle with the category's line icon, the number as a badge, the name beside it.
    expect(pin.querySelector("span.bg-slate-900 svg path")).not.toBeNull();
    expect(pin).toHaveAttribute("aria-label", "Stop 2: Bagasbas Beach");
    expect(pin.textContent).toContain("2");
    expect(pin.textContent).toContain("Bagasbas Beach");

    expect(screen.getByText("Day 1 route")).toBeInTheDocument();
    for (const name of ["Expand map", "Show my location", "Zoom in", "Zoom out"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    // Expand opens a full-screen copy over the page; its button and Escape close it.
    fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Close the full map" })).toBeInTheDocument());
    // An X at the top right, above the location button (owner's note, image-49).
    const close = screen.getByRole("button", { name: "Close the full map" });
    expect(close).toHaveClass("right-3", "top-3");
    expect(close.querySelector("path")).toHaveAttribute("d", "M6 6l12 12M18 6L6 18");
    expect(screen.getAllByRole("button", { name: "Show my location" }).at(-1)).toHaveClass("right-3", "top-16");
    expect(screen.getByRole("region", { name: "Day 1 map (full screen)" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close the full map" })).toBeNull());
  });

  it("keeps only zoom over a map that has its own card", async () => {
    render(<FreeMap markers={markers} title="Places map" controls="zoom" />);
    await waitFor(() => expect(mockState.map).not.toBeNull());
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show my location" })).toBeNull();
  });

  it("puts the focused place's photo in its pin, the point on the spot", async () => {
    const photo = { src: "/photos/bagasbas.jpg", alt: "Bagasbas Beach" };
    const shown = markers.map((m) => (m.id === "b" ? { ...m, kind: "place" as const, photo } : m));

    render(<FreeMap markers={shown} title="Places map" focusId="b" onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));

    const pin = mockState.markerEls[1];
    // The place's own photo is the pin (image-42), not a number or a dot.
    const image = pin.querySelector("img");
    expect(image).toHaveAttribute("src", photo.src);
    expect(image).toHaveAttribute("alt", "");
    // It hangs from its tail: the point, not the middle, sits on the place.
    expect(pin.parentElement?.className).toContain("-translate-y-full");
    // The other places stay plain dots.
    expect(mockState.markerEls[0].querySelector("img")).toBeNull();
  });

  it("sits the focused pin below the middle when a card above it needs the room", async () => {
    render(<FreeMap markers={markers} title="Places map" focusId="b" focusOffsetY={56} />);

    await waitFor(() => expect(mockState.camera.at(-1)?.[0]).toBe("flyTo"));
    // Not the marker's own point: the camera is moved up so the pin lands lower
    // on the card, which is what leaves space for the card over it (image-42).
    expect(mockState.camera.at(-1)?.[1]).toEqual([14.2, 123]);
    expect(mockState.camera.at(-1)?.[1]).not.toEqual([markers[1].lat, markers[1].lng]);
  });

  it("reports where the focused pin is, for a card that points at it", async () => {
    const onFocusPoint = jest.fn();
    const shown = markers.map((m) => (m.id === "b" ? { ...m, kind: "place" as const, photo: { src: "/photos/b.jpg" } } : m));

    const { rerender } = render(
      <FreeMap markers={shown} title="Places map" focusId="b" onFocusPoint={onFocusPoint} />,
    );
    await waitFor(() => expect(onFocusPoint).toHaveBeenCalledWith({ x: 140, y: 96 }));
    expect(mockState.focusedAt).toEqual([shown[1].lat, shown[1].lng]);

    // Nothing focused: no pin to point at, and the card is told so.
    onFocusPoint.mockClear();
    rerender(<FreeMap markers={shown} title="Places map" focusId={null} onFocusPoint={onFocusPoint} />);
    await waitFor(() => expect(onFocusPoint).toHaveBeenCalledWith(null));
  });

  it("draws the route legs, dashed where there is no road", async () => {
    render(
      <FreeMap
        markers={markers}
        title="Route map"
        lines={[{ id: "leg0", path: [markers[0], markers[1]], dashed: true }]}
      />,
    );
    await waitFor(() => expect(mockState.polylineCount).toBe(1));
  });

  it("jumps instead of flying when the device asks for less motion", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("reduced-motion"),
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    const { rerender } = render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));

    rerender(<FreeMap markers={markers} title="Route map" focusId="a" />);
    await waitFor(() => expect(mockState.camera.some(([kind]) => kind === "setView")).toBe(true));
    expect(mockState.camera.some(([kind]) => kind === "flyTo")).toBe(false);
  });

  it("draws the sketch when the map can't start at all", async () => {
    mockState.fail = true;
    render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(screen.getByRole("img", { name: "Route map" })).toBeInTheDocument());
    expect(screen.getByText(/Sketch map/)).toBeInTheDocument();
  });
});
