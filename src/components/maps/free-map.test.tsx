/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
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
    getPane() {
      return mockState.pane;
    }
    invalidateSize() {}
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
