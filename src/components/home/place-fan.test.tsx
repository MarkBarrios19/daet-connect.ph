/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { gsap } from "@/lib/gsap";
import { fanGeometry, fanWedgePoints, restWidths, toClipPath, widthsWithFocus } from "./fan-geometry";
import React from "react";
import { PlaceFan } from "./place-fan";
import { FAN_PLACES } from "./fan-places";

// The open place's map is Leaflet's; free-map.test pins it. Here it is a region.
jest.mock("@/components/maps/free-map", () => ({
  FreeMap: ({ title, markers }: { title: string; markers: Array<{ id: string; title: string }> }) => (
    <div role="region" aria-label={title}>
      {markers.map((marker) => (
        <span key={marker.id}>{marker.title}</span>
      ))}
    </div>
  ),
}));

/** jsdom has no ResizeObserver; the fan falls back to the server's default size. */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  Object.defineProperty(global, "ResizeObserver", {
    writable: true,
    value: NoopResizeObserver,
  });
});

const renderFan = (signedInOrProps: boolean | Partial<React.ComponentProps<typeof PlaceFan>> = false) => {
  const props = typeof signedInOrProps === "boolean" ? { signedIn: signedInOrProps } : signedInOrProps;
  return render(<PlaceFan places={FAN_PLACES} signedIn={false} {...props} />);
};

// The hero's own geometry at the size the fan renders at before it is measured.
const WIDTH = 1440;
const HEIGHT = 900;
const geometry = fanGeometry(WIDTH, HEIGHT, "desktop");

/** The clip-path a wedge ends up with once it has finished widening. */
const widened = (index: number) =>
  toClipPath(fanWedgePoints(geometry, 0, widthsWithFocus(geometry, index))[index], WIDTH, HEIGHT);

/** …and at rest again, which is the server's own rest string for that wedge. */
const REST = (index: number) => toClipPath(fanWedgePoints(geometry, 0, restWidths(geometry))[index], WIDTH, HEIGHT);
const OPEN = toClipPath(geometry.openPoints, WIDTH, HEIGHT);

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  gsap.globalTimeline.timeScale(1);
});

describe("PlaceFan", () => {
  it("renders one button per place, in order, inside the labelled group", () => {
    renderFan();

    const group = screen.getByRole("group", { name: "Places in Daet" });
    const buttons = within(group).getAllByRole("button");

    expect(buttons).toHaveLength(6);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Calaguas: open photo and details",
      "Apuao sandbar: open photo and details",
      "Bagasbas Beach: open photo and details",
      "First Rizal Monument: open photo and details",
      "Daet Heritage Center: open photo and details",
      "Cathedral of the Most Holy Trinity: open photo and details",
    ]);
    buttons.forEach((button) => expect(button).toHaveAttribute("aria-expanded", "false"));
  });

  it("clips each wedge with a nine-point polygon", () => {
    const { container } = renderFan();
    const wedges = container.querySelectorAll("[data-wedge]");

    expect(wedges).toHaveLength(6);
    wedges.forEach((wedge) => {
      const clip = (wedge as HTMLElement).style.clipPath;
      expect(clip).toMatch(/^polygon\(/);
      expect(clip.match(/%/g)).toHaveLength(18);
    });
  });

  it("gives every photo the alt text from its place", () => {
    renderFan();

    FAN_PLACES.forEach((place) => {
      expect(screen.getByAltText(place.photo.alt)).toBeInTheDocument();
    });
  });

  it("keeps the approved headline and subline", () => {
    renderFan();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Start in Daet.");
    expect(heading).toHaveTextContent("Go anywhere in Camarines Norte.");
    expect(
      screen.getByText(/Beaches, islands and old-town walks, with operators and guides verified/),
    ).toBeInTheDocument();
  });

  it("offers Book Now, and the assistant for a signed-out visitor", () => {
    renderFan(false);

    expect(screen.getByRole("link", { name: "Book Now" })).toHaveAttribute("href", "/tours/browse");
    expect(screen.getByRole("button", { name: "Ask the travel guide" })).toBeInTheDocument();
  });

  it("keeps the hero's second button legible on the pale ground", () => {
    // The outline used to be white on white: the label vanished in light mode.
    // Ink in light, white in dark, so the button reads on either ground.
    renderFan(false);

    const assistant = screen.getByRole("button", { name: "Ask the travel guide" });
    expect(assistant.className).toContain("text-daet-ink");
    expect(assistant.className).toContain("dark:text-white");
    expect(assistant.className).not.toMatch(/(^|\s)text-white(\s|$)/);
    expect(assistant.className).not.toContain("ring-white/60");
  });

  it("runs the headline a tenth smaller and gives both hero buttons the Wayra sweep", () => {
    // Owner's notes on the hero (image-57, image-58): the statement 10% down,
    // the buttons 5% up, and the Wayra slab on hover (globals.css).
    renderFan(false);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.style.getPropertyValue("--display-scale")).toBe("0.9");

    ["Book Now", "Ask the travel guide"].forEach((name) => {
      const control = screen.getByRole(name === "Book Now" ? "link" : "button", { name });
      expect(control.className).toContain("wayra");
      // lg + 5%, and a fill and label the sweep can use.
      expect(control.className).toContain("min-h-[3.15rem]");
      expect(control.className).toContain("--wayra-fill");
      expect(control.className).toContain("--wayra-ink");
    });
  });

  it("asks the assistant to open when that button is pressed", () => {
    const opened = jest.fn();
    window.addEventListener("daet:open-assistant", opened);

    renderFan(false);
    fireEvent.click(screen.getByRole("button", { name: "Ask the travel guide" }));

    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("daet:open-assistant", opened);
  });

  it("shows My dashboard instead of the assistant once signed in", () => {
    renderFan(true);

    const dashboard = screen.getByRole("link", { name: "My dashboard" });
    expect(dashboard).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: "Ask the travel guide" })).not.toBeInTheDocument();
    // Same ground, same problem: the signed-in button is theme-aware too.
    expect(dashboard.className).toContain("text-daet-ink");
    expect(dashboard.className).toContain("dark:text-white");
    expect(dashboard.className).not.toMatch(/(^|\s)text-white(\s|$)/);
  });

  it("names every wedge on screen for a mouse visitor to hover", () => {
    const { container } = renderFan();

    const chips = container.querySelectorAll("[data-chip]");
    expect(chips).toHaveLength(6);
    expect(Array.from(chips).map((chip) => chip.textContent)).toEqual([
      "Calaguas",
      "Apuao sandbar",
      "Bagasbas Beach",
      "First Rizal Monument",
      "Daet Heritage Center",
      "Cathedral of the Most Holy Trinity",
    ]);
  });

  it("shows no name at all on load, since nothing is hovered", () => {
    const { container } = renderFan();

    container.querySelectorAll("[data-chip]").forEach((chip) => expect(chip).not.toBeVisible());
  });

  it("names only the wedge under the mouse, and drops the name when it leaves", async () => {
    gsap.globalTimeline.timeScale(40);
    const { container } = renderFan();
    const wedge = screen.getByRole("button", {
      name: "Bagasbas Beach: open photo and details",
    });

    fireEvent.pointerOver(wedge, { pointerType: "mouse" });

    await waitFor(() => {
      const showing = Array.from(container.querySelectorAll("[data-chip]")).filter(
        (chip) => (chip as HTMLElement).style.visibility !== "hidden",
      );
      expect(showing.map((chip) => chip.textContent)).toEqual(["Bagasbas Beach"]);
    });

    fireEvent.pointerOut(wedge, { pointerType: "mouse" });

    await waitFor(() => container.querySelectorAll("[data-chip]").forEach((chip) => expect(chip).not.toBeVisible()));
  });

  it("names the wedge a keyboard visitor has tabbed to", async () => {
    gsap.globalTimeline.timeScale(40);
    const { container } = renderFan();
    const wedge = screen.getByRole("button", {
      name: "Calaguas: open photo and details",
    });

    act(() => wedge.focus());

    await waitFor(() => expect(container.querySelector('[data-chip="0"]')).toBeVisible());

    act(() => wedge.blur());

    await waitFor(() => expect(container.querySelector('[data-chip="0"]')).not.toBeVisible());
  });
});

describe("PlaceFan opening a place", () => {
  // The fold-in runs on a real timeline; speed the clock up rather than sit
  // through 450ms of it, and keep every other suite's timing untouched.
  const hurry = () => gsap.globalTimeline.timeScale(40);

  const openThird = () => {
    renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );
  };

  it("opens the panel, marks the wedge expanded and names the place in the URL", () => {
    openThird();

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    // Open, the wedge's own action is to close, and its label says so.
    expect(
      screen.getByRole("button", {
        name: "Bagasbas Beach: close photo and details",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(window.location.hash).toBe("#place-bagasbas-beach");
  });

  it("keeps the page heading in the accessibility tree while a place is open", () => {
    openThird();

    // Faded out behind the photo, but a screen reader still has an h1 to start from.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Start in Daet.");
  });

  it("takes the headline's buttons out of the tab order while a place is open", () => {
    const { container } = renderFan();

    const row = (name: string) => screen.getByRole("link", { name }).parentElement;
    expect(row("Book Now")).not.toHaveAttribute("inert");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    expect(row("Book Now")).toHaveAttribute("inert");
    expect(container.querySelector("[data-headline]")).not.toBeNull();
  });

  it("centres the open photo, and puts it back on its own angle when it closes", async () => {
    hurry();
    const { container } = renderFan();

    /** How far a photo sits from the middle of its own box, off its transform. */
    const offsetOf = (index: number) => {
      const element = container.querySelector(`[data-wedge="${index}"] [data-nudge]`) as HTMLElement;
      // GSAP writes `translate(0, 0)`; the server writes `translate(-42px, -9px)`.
      const read = /translate3?d?\((-?[\d.e+]+)(?:px)?, *(-?[\d.e+]+)(?:px)?/.exec(element.style.transform);
      return { x: read ? Number(read[1]) : 0, y: read ? Number(read[2]) : 0 };
    };
    const restOf = (index: number) => {
      const element = container.querySelector(`[data-wedge="${index}"] [data-nudge]`) as HTMLElement;
      return {
        x: Number(element.dataset.nudgeX),
        y: Number(element.dataset.nudgeY),
      };
    };
    /**
     * Wait for the open/close tweens, turning GSAP's clock as we go: jsdom's
     * frame callbacks arrive unreliably, and a timeline that never ticked is a
     * flaky test rather than a broken fan.
     */
    const until = (assert: () => void) =>
      waitFor(() => {
        gsap.ticker.tick();
        assert();
      });

    // Each photo looks down its own wedge while the fan is closed.
    const rest = restOf(2);
    expect(Math.abs(rest.x)).toBeGreaterThan(1);
    await until(() => expect(Math.abs(offsetOf(2).x)).toBeGreaterThan(1));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    // A photo still pushed out along its old wedge leaves a corner of the hero
    // empty — the opened one has to sit dead centre, filling the screen.
    await until(() => expect(offsetOf(2)).toEqual({ x: 0, y: 0 }));

    fireEvent.keyDown(screen.getByRole("heading", { level: 2 }), {
      key: "Escape",
    });

    await until(() => expect(offsetOf(2).x).toBeCloseTo(rest.x, 0));
  });

  it("steps to the next place square on the hero, with no strip of the page down its side", async () => {
    hurry();
    const { container } = renderFan();

    /** How far a wedge sits from where it belongs, read off its own transform. */
    const wedgeOffsetOf = (index: number) => {
      const element = container.querySelector(`[data-wedge="${index}"]`) as HTMLElement;
      const read = /translate3?d?\((-?[\d.e+]+)(?:px)?, *(-?[\d.e+]+)(?:px)?/.exec(element.style.transform);
      return { x: read ? Number(read[1]) : 0, y: read ? Number(read[2]) : 0 };
    };
    const until = (assert: () => void) =>
      waitFor(() => {
        gsap.ticker.tick();
        assert();
      });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );
    await until(() => expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument());

    // Opening a place slides the other five out along their own angles.
    await until(() => {
      const slid = wedgeOffsetOf(3);
      expect(Math.abs(slid.x) + Math.abs(slid.y)).toBeGreaterThan(1);
    });

    // Stepping onto that wedge must put it back square first: opened where it
    // was slid to, its photo sat up to 60px off the hero and left a band of the
    // page down one side — the gap the owner photographed on their phone.
    fireEvent.click(screen.getByRole("button", { name: "Next place" }));
    await until(() =>
      expect(screen.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeInTheDocument(),
    );
    await until(() => expect(wedgeOffsetOf(3)).toEqual({ x: 0, y: 0 }));

    // …and the same for every place after it, stepping on.
    fireEvent.click(screen.getByRole("button", { name: "Next place" }));
    await until(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Daet Heritage Center" })).toBeInTheDocument(),
    );
    await until(() => expect(wedgeOffsetOf(4)).toEqual({ x: 0, y: 0 }));
  });

  it("slides the next photo in beside the last, so the hero is never left uncovered", async () => {
    hurry();
    const { container } = renderFan();

    const photoOf = (wedge: number) => container.querySelector(`[data-wedge="${wedge}"] [data-photo]`) as HTMLElement;
    /** The photo's sideways offset as a share of its own width, as GSAP writes it. */
    const slideOf = (photo: HTMLElement) => {
      const read = /translate\((-?[\d.]+)%/.exec(photo.style.transform);
      return read ? Number(read[1]) : 0;
    };

    // The wedge's own fan shape, before anything opens: with the place open it
    // becomes the hero's rectangle, and it must stay that while it slides out.
    const fanShapeOfWedgeTwo = (container.querySelector("[data-wedge='2']") as HTMLElement).style.clipPath;

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument());
    await waitFor(() =>
      expect(container.querySelector("[data-wedge='2']") as HTMLElement).toHaveStyle({ opacity: "1" }),
    );

    // The slide itself, at the speed a visitor sees it.
    gsap.globalTimeline.timeScale(1);
    fireEvent.click(screen.getByRole("button", { name: "Next place" }));

    const frames: Array<{ incoming: number; outgoing: number }> = [];
    for (let frame = 0; frame < 12; frame += 1) {
      gsap.ticker.tick();
      frames.push({ incoming: slideOf(photoOf(3)), outgoing: slideOf(photoOf(2)) });
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    // Both photos really travel, and in opposite directions: next swipes in from
    // the right, pushing the one it replaces out to the left.
    const moving = frames.filter((frame) => frame.incoming > 1 && frame.outgoing < -1);
    // Two photos on the move, and in step with each other.
    expect(moving.length).toBeGreaterThan(0);

    // Their edges meet at every frame — the incoming photo's left edge is the
    // outgoing photo's right edge — so the pair covers the hero end to end, with no
    // strip of the page's own ground between them at any moment.
    moving.forEach((frame) => {
      expect(Math.abs(frame.incoming - 100 - frame.outgoing)).toBeLessThanOrEqual(0.5);
    });

    // …and both keep the hero's own shape all the way. A wedge that fell back to
    // its fan sliver while it was leaving would show the fan through the gap where
    // its photo used to be, which is the flash the owner photographed.
    const outgoingShape = (container.querySelector("[data-wedge='2']") as HTMLElement).style.clipPath;
    const incomingShape = (container.querySelector("[data-wedge='3']") as HTMLElement).style.clipPath;
    expect(incomingShape).not.toBe(fanShapeOfWedgeTwo);
    expect(outgoingShape).toBe(incomingShape);
  });

  it("puts a way back to the fan at the photo's top right on a desktop", () => {
    const { container } = renderFan();
    expect(screen.queryByRole("button", { name: "Back to the fan" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));
    const back = screen.getByRole("button", { name: "Back to the fan" });
    expect(back).toBeInTheDocument();
    // Over the photo, at its right edge — not inside the card.
    const row = container.querySelector("[data-detail]")!.parentElement!;
    expect(row.contains(back)).toBe(false);

    fireEvent.click(back);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens the place a map pin names on top of an open one, photo and all", async () => {
    hurry();
    const { container } = renderFan();

    const until = (assert: () => void) =>
      waitFor(() => {
        gsap.ticker.tick();
        assert();
      });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );
    await until(() => expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument());

    // A pin is the one way in that skips the panel's cross-fade: it sets the
    // hash with a place already open, so the next one arrives by `openAt` —
    // which found it still hidden (the last place hid it) and still slid out
    // along its angle. It grew to full size invisible: the card over an empty
    // hero, and no way to scroll out of it.
    act(() => {
      window.location.hash = "#place-daet-heritage-center";
    });
    await until(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Daet Heritage Center" })).toBeInTheDocument(),
    );

    const wedge = container.querySelector("[data-wedge='4']") as HTMLElement;
    await until(() => expect(wedge.style.visibility).not.toBe("hidden"));
    expect(wedge.style.opacity).toBe("1");

    const offset = /translate3?d?\((-?[\d.e+]+)(?:px)?, *(-?[\d.e+]+)(?:px)?/.exec(wedge.style.transform);
    expect({
      x: Number(offset?.[1] ?? 0),
      y: Number(offset?.[2] ?? 0),
    }).toEqual({ x: 0, y: 0 });
  });

  it("tells a screen reader which place just opened", () => {
    openThird();

    expect(screen.getByRole("status")).toHaveTextContent("Bagasbas Beach, 3 of 6");
  });

  it("keeps the place open on one click, and goes back to the fan on a double-click", () => {
    // A desktop has a mouse, so the owner asked for the double-click as the way
    // back — one click no longer takes the photo away while you are looking at
    // it. (Phones keep the single tap; that is tested with the phone layout.)
    openThird();
    const photo = screen.getByRole("button", {
      name: "Bagasbas Beach: close photo and details",
    });

    fireEvent.click(photo);
    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#place-bagasbas-beach");

    fireEvent.doubleClick(photo);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("closes on Escape", () => {
    openThird();
    fireEvent.keyDown(screen.getByRole("heading", { level: 2 }), {
      key: "Escape",
    });

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("steps to the next and previous place with the arrow keys, wrapping", () => {
    openThird();

    const panel = screen.getByRole("heading", { level: 2 });

    fireEvent.keyDown(panel, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#place-first-rizal-monument");

    fireEvent.keyDown(panel, { key: "ArrowLeft" });
    fireEvent.keyDown(panel, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { level: 2, name: "Apuao sandbar" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#place-apuao-grande-island");
  });

  it("steps with the panel's own arrow buttons too", () => {
    openThird();

    fireEvent.click(screen.getByRole("button", { name: "Previous place" }));
    expect(screen.getByRole("heading", { level: 2, name: "Apuao sandbar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next place" }));
    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
  });

  it("closes when the Back button strips the hash", () => {
    openThird();

    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("opens the place a map pin names, without a click on the fan", async () => {
    renderFan();

    // The map further down the page sets the same hash the fan reads.
    act(() => {
      window.location.hash = "#place-first-rizal-monument";
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("First Rizal Monument, 4 of 6");
  });

  it("opens straight onto the place a shared link names", () => {
    window.history.replaceState(null, "", "/#place-cathedral-most-holy-trinity");
    renderFan();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Cathedral of the Most Holy Trinity",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("6 of 6")).toBeInTheDocument();
  });

  it("leaves the panel closed for a hash that names no place", () => {
    window.history.replaceState(null, "", "/#place-nowhere");
    renderFan();

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("moves focus into the panel on open, and back to the wedge on close", async () => {
    hurry();
    openThird();

    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Previous place" }));
    fireEvent.keyDown(screen.getByRole("heading", { level: 2 }), {
      key: "Escape",
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Apuao sandbar: open photo and details",
          hidden: true,
        }),
      ).toHaveFocus(),
    );
  });

  it("walks the fan with the arrow keys while it is closed", () => {
    renderFan();
    const first = screen.getByRole("button", {
      name: "Calaguas: open photo and details",
    });
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(
      screen.getByRole("button", {
        name: "Apuao sandbar: open photo and details",
      }),
    ).toHaveFocus();
  });

  it("widens the wedge under a mouse and restores it when the pointer leaves", async () => {
    hurry();
    renderFan();
    const wedge = screen.getByRole("button", {
      name: "Daet Heritage Center: open photo and details",
    });

    fireEvent.pointerOver(wedge, { pointerType: "mouse" });
    await waitFor(() => expect(wedge.style.clipPath).toBe(widened(4)));

    fireEvent.pointerOut(wedge, { pointerType: "mouse" });
    await waitFor(() => expect(wedge.style.clipPath).toBe(REST(4)));
  });

  it("ignores hovering from a finger, which taps instead", async () => {
    hurry();
    renderFan();
    const wedge = screen.getByRole("button", {
      name: "Daet Heritage Center: open photo and details",
    });

    fireEvent.pointerOver(wedge, { pointerType: "touch" });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(wedge.style.clipPath).toBe(geometry.wedges[4].rest);
  });
});

describe("PlaceFan's hero", () => {
  /** jsdom has no layout, so the hero is told how big it is. */
  const setHeroSize = (width: number, height: number) => {
    Object.defineProperty(Element.prototype, "clientWidth", {
      configurable: true,
      get: () => width,
    });
    Object.defineProperty(Element.prototype, "clientHeight", {
      configurable: true,
      get: () => height,
    });
  };

  afterEach(() => {
    delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
    delete (Element.prototype as unknown as Record<string, unknown>).clientHeight;
  });

  it("runs up under the sticky header, so the photos start at the top of the page", () => {
    // The header is a scrim pinned over the page, not a bar above it: the hero
    // takes the whole viewport and pulls itself up by exactly the header's
    // height, so its last pixel is the fold.
    const { container } = renderFan();
    const section = container.querySelector("section") as HTMLElement;

    expect(section.className).toContain("-mt-[var(--header-h)]");
    expect(section.className).toContain("h-[100svh]");
    expect(section.className).toContain("max-h-[1080px]");
    expect(section.className).toContain("min-h-[520px]");
    expect(section.className).not.toContain("h-[calc(100svh-var(--header-h))]");
  });

  it("leaves the wheel alone, so the page scrolls from the hero", () => {
    // `overscroll-contain` on a full-screen hero swallows the gesture: the wheel
    // never chains to the page and nothing below the fold can be reached. The
    // place panel scopes its own, so the hero does not need one.
    const { container } = renderFan();
    const section = container.querySelector("section") as HTMLElement;

    expect(section.className).not.toContain("overscroll-contain");
    expect(container.querySelector("#place-detail")?.className ?? "").not.toContain("overscroll-contain");
  });

  it("stands the map card at nine tenths of the viewport, the map filling it", () => {
    // The owner's note on image-61: the map was a 16rem band in the corner of a
    // tall screen. The card's height is the caller's now — off the viewport, past
    // the header and the frame's gap — and the map takes all of it bar the header
    // row, so it is a column rather than a strip.
    const { container } = renderFan({
      mapPlaces: [{ slug: "bagasbas-beach", name: "Bagasbas Beach", lat: 14.131583, lng: 122.985083 }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    const panel = container.querySelector("[data-place-map]") as HTMLElement;
    // The height travels from the caller, because folding the card has to undo it.
    expect(panel.style.height).toContain("90svh");
    expect(panel.className).toContain("w-[24rem]");
    expect(panel.className).toContain("flex-col");

    const mapBody = panel.querySelector("[data-map-body]") as HTMLElement;
    expect(mapBody.className).toContain("min-h-[16rem]");
    // Nothing left over from the fixed band.
    expect(panel.querySelector(".h-64")).toBeNull();
  });

  it("folds the map card away to its header, and gives the photo back", () => {
    // The owner's note on image-63: the map is a column now, so it needs a way
    // out of the way. Folding drops the map itself — and with it the wheel, the
    // pids and the pins — leaving the "Viewing" bar the card is named for.
    const { container } = renderFan({
      mapPlaces: [{ slug: "bagasbas-beach", name: "Bagasbas Beach", lat: 14.131583, lng: 122.985083 }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    const panel = container.querySelector("[data-place-map]") as HTMLElement;
    const fold = screen.getByRole("button", { name: "Hide the map" });

    expect(fold).toHaveAttribute("aria-expanded", "true");
    expect(fold).toHaveAttribute("aria-controls", "place-map-body");
    expect(panel.getAttribute("data-collapsed")).toBe("false");
    expect(panel.style.height).toContain("90svh");
    expect(panel.querySelector("[data-map-body]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Show all" })).toBeInTheDocument();

    fireEvent.click(fold);

    expect(screen.getByRole("button", { name: "Show the map" })).toHaveAttribute("aria-expanded", "false");
    // The folded card is a new box, not the old one shortened: that is how the
    // height the caller gave it cannot survive the fold.
    const folded = container.querySelector("[data-place-map]") as HTMLElement;
    expect(folded).not.toBe(panel);
    expect(folded.getAttribute("data-collapsed")).toBe("true");
    expect(folded.style.height).toBe("auto");
    expect(folded.querySelector("[data-map-body]")).toBeNull();
    // "Show all" acts on a map nobody can see, so it goes with it.
    expect(screen.queryByRole("button", { name: "Show all" })).not.toBeInTheDocument();
    // The bar itself stays: it still says which place is open.
    expect(folded.querySelector("[data-viewing]")).toHaveTextContent("Bagasbas Beach");

    fireEvent.click(screen.getByRole("button", { name: "Show the map" }));
    const reopened = container.querySelector("[data-place-map]") as HTMLElement;
    expect(reopened.querySelector("[data-map-body]")).not.toBeNull();
    expect(reopened.style.height).toContain("90svh");
  });

  it("leaves a wheel over the open place's map to the map, which zooms with it", () => {
    // The card's map zooms with the wheel, so a wheel over it is someone looking
    // at the place — not someone asking to leave the hero.
    const { container } = renderFan({
      mapPlaces: [{ slug: "bagasbas-beach", name: "Bagasbas Beach", lat: 14.131583, lng: 122.985083 }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));
    expect(window.location.hash).toBe("#place-bagasbas-beach");

    const map = container.querySelector("[data-place-map]") as HTMLElement;
    expect(map).toBeInTheDocument();

    fireEvent.wheel(map, { deltaY: 240 });
    expect(window.location.hash).toBe("#place-bagasbas-beach");

    // A wheel anywhere else still takes the visitor out of the hero.
    fireEvent.wheel(document.body, { deltaY: 240 });
    expect(window.location.hash).toBe("");
    expect(container.querySelector("[data-detail]")).toBeNull();
  });

  it("sets the lead-in smaller than the line under it", () => {
    const { container } = renderFan();
    const lines = Array.from(container.querySelectorAll("#home-title > span"));

    expect(lines).toHaveLength(2);
    expect(lines[0].className).toContain("text-[0.85em]");
    expect(lines[1].className).not.toContain("text-[0.85em]");
  });

  it("sits on the page's own ground, under a headline in the theme's ink", () => {
    // The owner's note on image-59: the hero was a lighter navy band above a
    // darker page, and its words were white where every heading below them is
    // the theme's ink. So neither is overridden for the dark theme any more —
    // the ground is `bg-canvas` and the words are `text-daet-ink`, which switch
    // with the theme by themselves. The seams between the wedges are the ground
    // showing through, so they have to follow it.
    const { container } = renderFan();
    const section = container.querySelector("section") as HTMLElement;

    expect(section.className).toContain("bg-canvas");
    expect(section.className).not.toContain("dark:bg-slate-900");
    expect(section.className).not.toContain("bg-daet-ink");
    container.querySelectorAll("[data-wedge]").forEach((wedge) => {
      expect(wedge.className).toContain("bg-canvas");
      expect(wedge.className).not.toContain("dark:bg-slate-900");
    });

    const title = container.querySelector("#home-title") as HTMLElement;
    expect(title.className).toContain("text-daet-ink");
    expect(title.className).not.toContain("dark:text-white");
  });

  it("keeps the full headline and its subline on a roomy desktop", () => {
    setHeroSize(1280, 800);
    renderFan();

    expect(screen.getByRole("heading", { level: 1 }).className).toContain("display-1");
    expect(screen.getByText(/Beaches, islands and old-town walks/)).toBeInTheDocument();
  });

  it("steps the headline down and drops the subline on a short screen", () => {
    setHeroSize(1280, 600);
    renderFan();

    expect(screen.getByRole("heading", { level: 1 }).className).toContain("display-2");
    expect(screen.queryByText(/Beaches, islands and old-town walks/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Now" })).toBeInTheDocument();
  });

  it("still offers the assistant on a short screen", () => {
    setHeroSize(1280, 600);
    renderFan();

    expect(screen.getByRole("button", { name: "Ask the travel guide" })).toBeInTheDocument();
  });
});

describe("PlaceFan on a phone", () => {
  /**
   * jsdom has no layout, so the hero is told how big it is. The fan measures
   * `clientWidth`/`clientHeight` rather than its bounding box, so that a
   * transformed hero cannot change the shapes mid-scroll.
   */
  const setHeroSize = (width: number, height: number) => {
    Object.defineProperty(Element.prototype, "clientWidth", {
      configurable: true,
      get: () => width,
    });
    Object.defineProperty(Element.prototype, "clientHeight", {
      configurable: true,
      get: () => height,
    });
  };

  afterEach(() => {
    delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
    delete (Element.prototype as unknown as Record<string, unknown>).clientHeight;
    jest.restoreAllMocks();
  });

  it("stands the headline in the middle of the band the two fans leave", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    const headline = container.querySelector("[data-headline]") as HTMLElement;

    // Nothing covers the hero in jsdom, so the band is centred on the box; the
    // point is that the text sits between the fans, not riding up on the top one.
    expect(headline.style.top).toBe(`${844 / 2}px`);
    expect(headline.style.transform).toBe("translateY(-50%)");
  });

  it("mirrors the two fans about what the header and the tab bar leave visible", () => {
    // The hero runs under the sticky header, and the dashboard's tab bar covers
    // its foot: centring the pair on the whole box left the top fan taller by
    // the header's height, which is what the owner saw on their phone.
    const header = document.createElement("header");
    header.getBoundingClientRect = () => ({ height: 56 }) as DOMRect;
    const tabBar = document.createElement("nav");
    tabBar.setAttribute("aria-label", "Dashboard");
    tabBar.getBoundingClientRect = () => ({ height: 57 }) as DOMRect;
    document.body.append(header, tabBar);

    try {
      setHeroSize(390, 844);
      const { container } = renderFan();
      const headline = container.querySelector("[data-headline]") as HTMLElement;

      // The middle of what is left between the two: 56 at the top, 57 at the foot.
      expect(headline.style.top).toBe(`${(56 + 844 - 57) / 2}px`);
    } finally {
      header.remove();
      tabBar.remove();
    }
  });

  it("always shows the short names, since a finger cannot hover", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();

    const chips = Array.from(container.querySelectorAll("[data-chip]"));
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Calaguas",
      "Apuao",
      "Bagasbas",
      "Rizal",
      "Heritage",
      "Cathedral",
    ]);
    // GSAP owns the tags, so they are visible through their inline style, not
    // through a CSS class a hover rule could outrank.
    chips.forEach((chip) => expect(chip).toBeVisible());
  });

  it("keeps the headline band to the headline, a hint and one action", () => {
    setHeroSize(390, 844);
    renderFan();

    // The audit's finding: a phone's first screen had no call to action at all.
    // One button fits beside the hint; the long subline and the second button
    // still do not, because the band is only as tall as the gap between the fans.
    expect(screen.getByText("Tap a place to see it")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Now" })).toHaveAttribute("href", "/tours/browse");
    expect(screen.queryByRole("button", { name: "Ask the travel guide" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Beaches, islands and old-town walks/)).not.toBeInTheDocument();
  });

  it("takes the phone's action out of the tab order while a place is open", () => {
    const { container } = renderFan();
    setHeroSize(390, 844);

    const row = screen.getByRole("link", { name: "Book Now" }).parentElement;
    expect(row).not.toHaveAttribute("inert");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    // Faded out behind the photo: not reachable by keyboard, as on a desktop.
    expect(row).toHaveAttribute("inert");
    expect(container.querySelector("[data-headline]")).not.toBeNull();
  });

  it("drops the chips and keeps one fan of six on a landscape phone", () => {
    setHeroSize(844, 390);
    const { container } = renderFan();

    expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-wedge]")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Book Now" })).toBeInTheDocument();
  });

  it("opens a phone's card as a folded bar at the top, not a sheet over the photo", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const card = container.querySelector("[data-detail]") as HTMLElement;
    expect(card).toBeInTheDocument();
    // Folded: the photo is the point on a small screen, and the words are one tap away.
    expect(document.getElementById("place-detail-body")).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Show the place's details" })).toBeInTheDocument();
    // No map without coordinates, so nothing is left hanging over the photo.
    expect(container.querySelector("[data-place-map]")).toBeNull();
  });

  it("keeps the photo to itself on a phone: no map, and the card centred", () => {
    setHeroSize(390, 844);
    const { container } = renderFan({
      mapPlaces: [
        {
          slug: "bagasbas-beach",
          name: "Bagasbas Beach",
          lat: 14.131583,
          lng: 122.985083,
        },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    // The owner asked for the map at the phone's foot to go, so the photo can be
    // dragged instead; the card is a sheet at the foot of the screen (image-74).
    expect(container.querySelector("[data-place-map]")).toBeNull();
    const card = container.querySelector("[data-detail]") as HTMLElement;
    expect(card.className).toContain("rounded-t-2xl");
    expect(card.parentElement!.parentElement!.className).toContain("bottom-[var(--tab-bar-h)]");
  });

  it("folds a landscape phone's card too", () => {
    setHeroSize(844, 390);
    const { container } = renderFan();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    expect(document.getElementById("place-detail-body")).toHaveAttribute("hidden");
    expect(container.querySelector("[data-detail]")).toBeInTheDocument();
  });

  /**
   * jsdom lays nothing out and decodes nothing, so the photo is given the size
   * and the shape it would have: a landscape photo behind a portrait phone,
   * which leaves room to pan sideways and none up and down.
   */
  const giveThePhotoAShape = (image: HTMLImageElement) => {
    Object.defineProperty(image, "clientWidth", {
      configurable: true,
      value: 375,
    });
    Object.defineProperty(image, "clientHeight", {
      configurable: true,
      value: 812,
    });
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 1280,
    });
  };

  it("drags the open photo to look along it, and steps nothing", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);
    expect(image.style.objectPosition).toBe("50.00% 50.00%");

    fireEvent.pointerDown(image, { clientX: 300, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(image, { clientX: 200, clientY: 400, pointerId: 1 });

    // 100px leftwards over 843px of hidden photo: 11.86% further along it.
    expect(image.style.objectPosition).toBe("61.86% 50.00%");
    // The photo is the gesture now, not the next place.
    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#place-bagasbas-beach");
  });

  it("takes the pointer only once the hand has moved, so the photo still hears its own click", () => {
    // A captured pointer is retargeted to the hero, and the click and
    // double-click that follow are retargeted with it — which is how the two
    // ways back to the fan (a tap, a double-click) silently stopped working in a
    // browser while jsdom, which has no capture, kept passing.
    const capture = jest.fn();
    const release = jest.fn();
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      writable: true,
      value: capture,
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      writable: true,
      value: release,
    });

    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );
    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);

    // A press and a release on the spot: no capture.
    fireEvent.pointerDown(image, { clientX: 300, clientY: 400, pointerId: 1 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerUp(image, { clientX: 300, clientY: 400, pointerId: 1 });
    expect(release).not.toHaveBeenCalled();

    // A drag takes it, so the pan keeps following a hand that leaves the photo.
    fireEvent.pointerDown(image, { clientX: 300, clientY: 400, pointerId: 2 });
    fireEvent.pointerMove(image, { clientX: 200, clientY: 400, pointerId: 2 });
    expect(capture).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(image, { clientX: 200, clientY: 400, pointerId: 2 });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not close the place when a drag lets go", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);
    const wedge = screen.getByRole("button", {
      name: "Bagasbas Beach: close photo and details",
    });

    fireEvent.pointerDown(image, { clientX: 300, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(image, { clientX: 220, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(image, { clientX: 220, clientY: 400, pointerId: 1 });
    // A browser still sends the click after a drag that ends where it began.
    fireEvent.click(wedge);

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
  });

  it("still closes on a tap: a few pixels of drift is not a drag", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);

    fireEvent.pointerDown(image, { clientX: 200, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(image, { clientX: 202, clientY: 401, pointerId: 1 });
    fireEvent.pointerUp(image, { clientX: 202, clientY: 401, pointerId: 1 });

    expect(image.style.objectPosition).toBe("50.00% 50.00%");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: close photo and details",
      }),
    );

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("steps on with a quick flick to the left, and back with one to the right", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);

    const clock = jest.spyOn(Date, "now");
    clock.mockReturnValue(1_000);
    fireEvent.pointerDown(image, { clientX: 300, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(image, { clientX: 220, clientY: 402, pointerId: 1 });
    clock.mockReturnValue(1_120);
    fireEvent.pointerUp(image, { clientX: 220, clientY: 402, pointerId: 1 });

    expect(screen.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#place-first-rizal-monument");
    // The flick that stepped must not also count as a click on the new place.
    expect(container.querySelector("[data-wedge='3']")).toHaveAttribute("aria-expanded", "true");

    const next = container.querySelector("[data-wedge='3'] img") as HTMLImageElement;
    giveThePhotoAShape(next);
    clock.mockReturnValue(2_000);
    fireEvent.pointerDown(next, { clientX: 200, clientY: 400, pointerId: 2 });
    fireEvent.pointerMove(next, { clientX: 280, clientY: 400, pointerId: 2 });
    clock.mockReturnValue(2_100);
    fireEvent.pointerUp(next, { clientX: 280, clientY: 400, pointerId: 2 });
    clock.mockRestore();

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
  });

  it("keeps the keyboard reaching the fan after a flick hides the photo that had focus", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);
    // A real tap on the photo leaves focus on the photo's button — the one the
    // step is about to hide.
    (image.closest("button") as HTMLButtonElement).focus();

    const clock = jest.spyOn(Date, "now");
    clock.mockReturnValue(1_000);
    fireEvent.pointerDown(image, { clientX: 300, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(image, { clientX: 220, clientY: 402, pointerId: 1 });
    clock.mockReturnValue(1_120);
    fireEvent.pointerUp(image, { clientX: 220, clientY: 402, pointerId: 1 });
    clock.mockRestore();

    // A hidden element cannot hold focus, so it moves into the card instead of
    // falling to the body, where the next arrow key would go nowhere.
    const heading = screen.getByRole("heading", { level: 2, name: "First Rizal Monument" });
    expect(document.activeElement).toBe(heading);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { level: 2, name: "Daet Heritage Center" })).toBeInTheDocument();
  });

  it("keeps looking along the photo, and steps nothing, when the drag is slow", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);

    const clock = jest.spyOn(Date, "now");
    clock.mockReturnValue(1_000);
    fireEvent.pointerDown(image, { clientX: 300, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(image, { clientX: 200, clientY: 400, pointerId: 1 });
    clock.mockReturnValue(1_900);
    fireEvent.pointerUp(image, { clientX: 200, clientY: 400, pointerId: 1 });
    clock.mockRestore();

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    expect(image.style.objectPosition).toBe("61.86% 50.00%");
  });

  it("leaves a press on the card alone", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);
    const card = container.querySelector("[data-detail]") as HTMLElement;

    fireEvent.pointerDown(card, { clientX: 300, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 200, clientY: 400, pointerId: 1 });

    expect(image.style.objectPosition).toBe("50.00% 50.00%");
  });

  it("coaches the gestures over an open photo, and never while the fan is shut", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();

    expect(container.querySelector("[data-gesture-hints]")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const coach = container.querySelector("[data-gesture-hints]") as HTMLElement;
    expect(coach).toBeInTheDocument();
    expect(within(coach).getByText("Drag to look around")).toBeInTheDocument();
    expect(within(coach).getByText("Flick left or right to step")).toBeInTheDocument();
    // A phone taps, because it has no double-click.
    expect(within(coach).getByText("Tap the photo to go back")).toBeInTheDocument();
    // The coaching must not stand in the way of the gesture it teaches.
    expect(coach).toHaveClass("pointer-events-none");
  });

  it("takes the coaching down once the photo is dragged, and does not raise it again", async () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    const image = container.querySelector("[data-wedge='2'] img") as HTMLImageElement;
    giveThePhotoAShape(image);
    expect(container.querySelector("[data-gesture-hints]")).toBeInTheDocument();

    const clock = jest.spyOn(Date, "now");
    clock.mockReturnValue(1_000);
    fireEvent.pointerDown(image, { clientX: 300, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(image, { clientX: 200, clientY: 400, pointerId: 1 });

    // A real drag: the visitor knows now, so the coaching goes.
    expect(container.querySelector("[data-gesture-hints]")).not.toBeInTheDocument();

    // …and stays gone for the next place they open. A slow release, so this drag
    // is a look along the photo and not a flick on to the next place.
    clock.mockReturnValue(2_000);
    fireEvent.pointerUp(image, { clientX: 200, clientY: 400, pointerId: 1 });
    clock.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Next place" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeInTheDocument(),
    );
    expect(container.querySelector("[data-gesture-hints]")).not.toBeInTheDocument();
  });

  it("puts the coaching away by itself once it has shown the gestures", async () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    expect(container.querySelector("[data-gesture-hints]")).toBeInTheDocument();

    // The timeline is real; only the clock is hurried along.
    gsap.globalTimeline.timeScale(40);
    await waitFor(() => expect(container.querySelector("[data-gesture-hints]")).not.toBeInTheDocument());
  });

  it("leaves the page's own scrolling to the page while a place is open", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    // A full screen of photo that holds every finger is a trap: no scroll, no
    // drag down and up, no pull to refresh, and no way out but a tap the
    // visitor has to guess at. Sideways is the photo's; up and down is the page's.
    const section = container.querySelector("section") as HTMLElement;
    expect(section.style.touchAction).toBe("pan-y");
  });

  it("ignores a flick while nothing is open", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();

    const section = container.querySelector("section") as HTMLElement;
    fireEvent.pointerDown(section, { clientX: 300, clientY: 400 });
    fireEvent.pointerUp(section, { clientX: 100, clientY: 400 });

    expect(window.location.hash).toBe("");
  });
});

describe("PlaceFan's page position", () => {
  let scrollTo: jest.SpyInstance;

  const scrolledTo = (y: number) => {
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => y });
  };

  beforeEach(() => {
    scrollTo = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).scrollY;
    jest.restoreAllMocks();
  });

  it("brings the page back to the top when a place opens from further down", () => {
    // The open place is the hero, and the hero is the page's first screen. Opened
    // from a deep link or a scrolled page, the hero was left half out of view
    // with the sheet floating in the middle of the next section (image-79).
    scrolledTo(640);
    renderFan();

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("leaves a page that is already at the top alone", () => {
    scrolledTo(0);
    renderFan();

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("focuses the card without asking the browser to scroll to it", async () => {
    // The card folds in from below the photo, so at the moment focus lands it is
    // off screen; a scroll-on-focus is what dragged the page down before.
    const focus = jest.spyOn(HTMLElement.prototype, "focus");
    scrolledTo(0);
    renderFan();

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    await waitFor(() =>
      expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true })),
    );
  });
});

describe("PlaceFan without JavaScript", () => {
  it("leaves a plain list of the six places for a browser that can't run it", () => {
    const { container } = renderFan();
    const fallback = container.querySelector("noscript");

    expect(fallback).not.toBeNull();
    FAN_PLACES.forEach((place) => {
      expect(fallback?.textContent).toContain(place.name);
      expect(fallback?.textContent).toContain(place.href);
    });
  });
});

describe("PlaceFan with reduced motion", () => {
  const original = window.matchMedia;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: original,
    });
  });

  it("still opens the place, but snaps to it instead of folding the fan", () => {
    const { container } = renderFan();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Bagasbas Beach: open photo and details",
      }),
    );

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    const wedge = container.querySelector('[data-wedge="2"]') as HTMLElement;
    expect(wedge.style.clipPath).toBe(OPEN);
  });
});
