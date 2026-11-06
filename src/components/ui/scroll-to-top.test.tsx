/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScrollToTop } from "./scroll-to-top";

/**
 * `window.scrollY` is a read-only getter in jsdom, and the page has no layout to
 * scroll, so the tests set the number the component reads and fire the event the
 * browser would.
 */
const scrollTo = (y: number) => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  fireEvent.scroll(window);
};

/** jsdom has no `scrollTo`; this is the call the button makes. */
const stubScroll = () => {
  const spy = jest.fn();
  Object.defineProperty(window, "scrollTo", { configurable: true, writable: true, value: spy });
  return spy;
};

const setReducedMotion = (reduce: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
};

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  scrollTo(0);
  setReducedMotion(false);
});

describe("ScrollToTop", () => {
  it("is not there until there is a screen's worth of reading behind the visitor", () => {
    render(<ScrollToTop />);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();

    scrollTo(700);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();

    scrollTo(1400);
    expect(screen.getByRole("button", { name: "Back to top" })).toBeInTheDocument();

    // …and it goes again near the top of the page.
    scrollTo(200);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
  });

  it("is a 44px target in the bottom-right corner, over the assistant pill", () => {
    const button = (() => {
      render(<ScrollToTop />);
      scrollTo(1400);
      return screen.getByRole("button", { name: "Back to top" });
    })();

    // A thumb-sized target, fixed and right-aligned — not a link in the flow, and
    // not the page's centreline any more (owner's note, image-91).
    expect(button).toHaveClass("h-11", "w-11", "fixed", "right-4");
    expect(button.className).not.toContain("left-1/2");
    // Clear of a phone's bottom edge, and lifted over a dashboard's tab bar.
    expect(button.className).toContain("env(safe-area-inset-bottom)");
  });

  it("stands above the assistant pill on both counts of the corner", () => {
    // The pill is 48px tall, 1rem off a phone's foot and 1.5rem on a wide screen;
    // this clears it by half a rem either way. With a tab bar the pill steps down
    // to 5rem, and the tab bar is the thing to clear.
    const { unmount } = render(<ScrollToTop />);
    scrollTo(1400);
    const alone = screen.getByRole("button", { name: "Back to top" });
    expect(alone.className).toContain("bottom-[calc(4.5rem+env(safe-area-inset-bottom))]");
    expect(alone).toHaveClass("sm:bottom-20");
    unmount();

    render(<ScrollToTop raised />);
    scrollTo(1400);
    const raised = screen.getByRole("button", { name: "Back to top" });
    expect(raised.className).toContain("bottom-[calc(5rem+env(safe-area-inset-bottom))]");
    expect(raised).toHaveClass("sm:bottom-20");
  });

  it("is a solid blue button with a white arrow, so it shows on light and dark paper", () => {
    // The owner's note (image-48): the dark button vanished on the dark page.
    render(<ScrollToTop />);
    scrollTo(1400);
    const button = screen.getByRole("button", { name: "Back to top" });

    expect(button).toHaveClass("bg-blue-600", "text-white");
    expect(button.className).not.toMatch(/(^|\s)dark:bg-/);
  });

  it("scrolls the page back to the top, smoothly by default", () => {
    const scroll = stubScroll();
    render(<ScrollToTop />);
    scrollTo(1400);
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));

    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("jumps instead when the visitor has asked for less motion", () => {
    setReducedMotion(true);
    const scroll = stubScroll();
    render(<ScrollToTop />);
    scrollTo(1400);
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));

    // The stylesheet's `scroll-behavior: auto !important` cannot override a
    // programmatic "smooth", so the choice is made here.
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("asks once on arrival, so a reload that lands mid-page shows it", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 1400 });
    render(<ScrollToTop />);

    expect(screen.getByRole("button", { name: "Back to top" })).toBeInTheDocument();
  });
});
