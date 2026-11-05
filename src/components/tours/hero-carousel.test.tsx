/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { HeroCarousel } from "@/components/tours/hero-carousel";
import type { HeroPhoto } from "@/lib/tours/hero-photos";

const photos = (n: number): HeroPhoto[] => Array.from({ length: n }, (_, k) => ({ src: `/p${k + 1}.jpg`, alt: `Photo ${k + 1}` }));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: query.includes("min-width"), addEventListener() {}, removeEventListener() {} }),
  });
});

const counter = () => screen.getByText(/^\d+ \/ \d+$/);
const dotGroup = () => screen.getByRole("group", { name: "Choose a photo" });

describe("HeroCarousel", () => {
  it("starts on the first photo and steps with the buttons, wrapping at both ends", () => {
    render(<HeroCarousel photos={photos(5)} title="Calaguas" />);
    expect(counter()).toHaveTextContent("1 / 5");
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(counter()).toHaveTextContent("2 / 5");
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(counter()).toHaveTextContent("5 / 5");
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(counter()).toHaveTextContent("1 / 5");
  });

  it("changes photo with the arrow keys", () => {
    render(<HeroCarousel photos={photos(5)} title="Calaguas" />);
    const carousel = screen.getByRole("region", { name: "Photos of Calaguas" });
    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    expect(counter()).toHaveTextContent("2 / 5");
    fireEvent.keyDown(carousel, { key: "ArrowLeft" });
    expect(counter()).toHaveTextContent("1 / 5");
  });

  it("gives only the middle photo an alt text, and marks the current dot", () => {
    render(<HeroCarousel photos={photos(5)} title="Calaguas" />);
    expect(screen.getAllByRole("img").map((img) => img.getAttribute("alt"))).toEqual(["Photo 1"]);
    expect(within(dotGroup()).getByRole("button", { name: /Show photo 1 of 5/ })).toHaveAttribute("aria-current", "true");
    fireEvent.click(within(dotGroup()).getByRole("button", { name: /Show photo 4 of 5/ }));
    expect(counter()).toHaveTextContent("4 / 5");
    expect(within(dotGroup()).getByRole("button", { name: /Show photo 4 of 5/ })).toHaveAttribute("aria-current", "true");
  });

  it("keeps the indicator to a window of dots however many photos there are", () => {
    render(<HeroCarousel photos={photos(40)} title="Calaguas" />);
    const reachable = within(dotGroup()).getAllByRole("button");
    expect(reachable).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(counter()).toHaveTextContent("40 / 40");
    expect(within(dotGroup()).getAllByRole("button")).toHaveLength(7);
  });

  it("opens the photo viewer on the current photo and closes it", () => {
    render(<HeroCarousel photos={photos(3)} title="Calaguas" />);
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand photo: Photo 2" }));
    const viewer = screen.getByRole("dialog", { name: "Photo viewer: Calaguas" });
    expect(within(viewer).getByRole("img", { name: "Photo 2" })).toBeInTheDocument();
    expect(within(viewer).getByText(/2 \/ 3 · 100%/)).toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole("button", { name: "Close photo viewer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("zooms in steps, up to 4x, and back out", () => {
    render(<HeroCarousel photos={photos(3)} title="Calaguas" />);
    fireEvent.click(screen.getByRole("button", { name: "Expand photo: Photo 1" }));
    const viewer = screen.getByRole("dialog");
    const zoomIn = within(viewer).getByRole("button", { name: "Zoom in" });
    const zoomOut = within(viewer).getByRole("button", { name: "Zoom out" });
    expect(zoomOut).toBeDisabled();
    for (let step = 0; step < 3; step++) fireEvent.click(zoomIn);
    expect(within(viewer).getByText(/400%/)).toBeInTheDocument();
    expect(zoomIn).toBeDisabled();
    fireEvent.click(zoomOut);
    expect(within(viewer).getByText(/300%/)).toBeInTheDocument();
  });

  it("changes photo inside the viewer with the arrow keys when not zoomed", () => {
    render(<HeroCarousel photos={photos(3)} title="Calaguas" />);
    fireEvent.click(screen.getByRole("button", { name: "Expand photo: Photo 1" }));
    const viewer = screen.getByRole("dialog");
    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    expect(within(viewer).getByText(/2 \/ 3/)).toBeInTheDocument();
    fireEvent.keyDown(viewer, { key: "+" });
    expect(within(viewer).getByText(/200%/)).toBeInTheDocument();
    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    expect(within(viewer).getByText(/2 \/ 3/)).toBeInTheDocument();
  });
});
