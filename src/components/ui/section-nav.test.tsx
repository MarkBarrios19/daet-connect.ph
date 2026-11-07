/** @jest-environment jsdom */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SectionNav, type EditorSection } from "./section-nav";

const sections: EditorSection[] = [
  { id: "basics-section", label: "Basics" },
  { id: "photos-section", label: "Photos", dirty: true },
  { id: "prices-section", label: "Prices", hasError: true },
  { id: "included-section", label: "What's included" },
  { id: "stops-section", label: "Route & stops" },
  { id: "gallery-section", label: "More photos" },
];

/** The six sections' landing places, laid out as the editor lays them out. */
function Page() {
  return (
    <div>
      <SectionNav sections={sections} />
      <SectionNav sections={sections} compact />
      {sections.map((section) => (
        <section key={section.id} id={section.id} tabIndex={-1}>
          {section.label}
        </section>
      ))}
    </div>
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn();
  window.history.replaceState(null, "", "/tours/operator/packages/package-1/edit");
});

describe("SectionNav sidebar", () => {
  it("lists the sections as real anchors, in reading order", () => {
    render(<Page />);
    const nav = screen.getByRole("navigation", { name: "Sections of this package" });
    const links = Array.from(nav.querySelectorAll("a"));

    // The visible label, plus the words a screen reader adds for a dot.
    expect(links.map((link) => link.textContent)).toEqual([
      "Basics",
      "Photos(unsaved changes)",
      "Prices(needs attention)",
      "What's included",
      "Route & stops",
      "More photos",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(sections.map((section) => `#${section.id}`));
    // Every target is 44px tall, for a thumb.
    links.forEach((link) => expect(link.className).toContain("min-h-11"));
  });

  it("marks unsaved changes with a dot and errors with a red one", () => {
    render(<Page />);
    const nav = screen.getByRole("navigation", { name: "Sections of this package" });

    // The dots are decorative; the words carry the state for a screen reader.
    const links = Array.from(nav.querySelectorAll("a"));
    const photos = links.find((link) => link.textContent?.startsWith("Photos"))!;
    const prices = links.find((link) => link.textContent?.startsWith("Prices"))!;
    expect(photos).toHaveAccessibleName("Photos (unsaved changes)");
    expect(prices).toHaveAccessibleName("Prices (needs attention)");

    // One dot per marked section, and the error is the red one.
    expect(photos.querySelector(".bg-blue-600")).not.toBeNull();
    expect(prices.querySelector(".bg-red-600")).not.toBeNull();
    // A section that is both would carry the error only: one dot each.
    expect(nav.querySelectorAll(".rounded-full.h-2")).toHaveLength(2);
  });

  it("scrolls to the section and takes focus there, keeping the address bar honest", () => {
    render(<Page />);
    const link = screen.getByRole("link", { name: /^Prices/ });

    fireEvent.click(link);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(document.getElementById("prices-section"));
    expect(window.location.hash).toBe("#prices-section");
  });

  it("jumps rather than glides when the person has asked for less motion", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      render(<Page />);
      fireEvent.click(screen.getByRole("link", { name: "Basics" }));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    } finally {
      window.matchMedia = original;
    }
  });

  it("marks the section being read as the page scrolls", () => {
    const seen: IntersectionObserverCallback[] = [];
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        seen.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const original = global.IntersectionObserver;
    Object.defineProperty(global, "IntersectionObserver", { configurable: true, writable: true, value: FakeObserver });

    try {
      render(<Page />);
      const nav = screen.getByRole("navigation", { name: "Sections of this package" });
      expect(nav.querySelector('[aria-current="true"]')?.textContent).toBe("Basics");

      act(() => {
        seen[0](
          [
            {
              target: document.getElementById("stops-section"),
              isIntersecting: true,
              boundingClientRect: { top: 100 },
            } as unknown as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver,
        );
      });

      expect(nav.querySelector('[aria-current="true"]')?.textContent).toBe("Route & stops");
    } finally {
      Object.defineProperty(global, "IntersectionObserver", { configurable: true, writable: true, value: original });
    }
  });
});

describe("SectionNav on a phone", () => {
  it("is a labelled dropdown of the same sections", () => {
    render(<Page />);
    const picker = screen.getByLabelText("Jump to section");

    expect(picker.tagName).toBe("SELECT");
    const options = Array.from(picker.querySelectorAll("option"));
    expect(options.map((option) => option.value)).toEqual(sections.map((section) => section.id));
    expect(options[2].textContent).toBe("Prices — needs attention");
    expect(options[1].textContent).toBe("Photos — unsaved");
  });

  it("sticks under the header, so it is one tap away wherever the page is scrolled", () => {
    render(<Page />);
    const picker = screen.getByLabelText("Jump to section");
    const rail = picker.closest("div.sticky");
    expect(rail).not.toBeNull();
    expect(rail?.className).toContain("top-[var(--header-h)]");
  });

  it("scrolls to the chosen section", () => {
    render(<Page />);
    fireEvent.change(screen.getByLabelText("Jump to section"), { target: { value: "gallery-section" } });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(document.getElementById("gallery-section"));
  });
});
