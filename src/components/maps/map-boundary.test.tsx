/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MapBoundary } from "./map-boundary";

/** A map that throws the way Leaflet did: from inside its own effect. */
function ExplodingMap(): never {
  throw new Error("Map container is being reused by another instance");
}

describe("MapBoundary", () => {
  let reported: jest.SpyInstance;

  beforeEach(() => {
    // React prints the caught error itself; the test says it was handled.
    reported = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    reported.mockRestore();
  });

  it("shows the map when there is nothing wrong", () => {
    render(
      <MapBoundary>
        <p>the map</p>
      </MapBoundary>,
    );

    expect(screen.getByText("the map")).toBeInTheDocument();
  });

  it("keeps the rest of the page when the map throws", () => {
    render(
      <MapBoundary>
        <ExplodingMap />
      </MapBoundary>,
    );

    // The page's own copy, not "Something went wrong.": the reader is told what
    // is missing and where else to look, and the section stays where it was.
    expect(screen.getByText(/The map is not available just now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "places page" })).toHaveAttribute("href", "/tours/attractions");
    expect(reported).toHaveBeenCalled();
  });
});
