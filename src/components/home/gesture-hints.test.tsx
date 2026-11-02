/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { gsap } from "@/lib/gsap";
import { GestureHints } from "./gesture-hints";

const motion = (reduced: boolean) =>
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes("reduced-motion"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });

afterEach(() => {
  gsap.globalTimeline.timeScale(1);
});

describe("GestureHints", () => {
  it("says what the open photo does, and takes no pointer events", () => {
    motion(false);
    render(<GestureHints phone={false} onDone={jest.fn()} />);

    expect(screen.getByText("Drag to look around")).toBeInTheDocument();
    expect(screen.getByText("Flick left or right to step")).toBeInTheDocument();
    expect(screen.getByText("Fold the card with its caret")).toBeInTheDocument();
    expect(screen.getByText("Double-click the photo to go back")).toBeInTheDocument();
    // A gesture that starts on top of the coach must reach the photo under it.
    expect(document.querySelector("[data-gesture-hints]")).toHaveClass("pointer-events-none");
  });

  it("tells a phone to tap, not to double-click", () => {
    motion(false);
    render(<GestureHints phone onDone={jest.fn()} />);

    expect(screen.getByText("Tap the photo to go back")).toBeInTheDocument();
    expect(screen.queryByText("Double-click the photo to go back")).not.toBeInTheDocument();
  });

  it("walks through the cues with the hand leading, then puts itself away", async () => {
    motion(false);
    const onDone = jest.fn();
    render(<GestureHints phone={false} onDone={onDone} />);

    // The timeline is real; only the clock is hurried along.
    gsap.globalTimeline.timeScale(40);

    const hand = document.querySelector("[data-gesture-hand]") as HTMLElement;
    await waitFor(() => expect(hand.style.transform).toMatch(/translate/));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("stands the cues still and together when the device asks for less motion", async () => {
    motion(true);
    const onDone = jest.fn();
    render(<GestureHints phone={false} onDone={onDone} />);

    gsap.globalTimeline.timeScale(40);
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const hand = document.querySelector("[data-gesture-hand]") as HTMLElement;
    expect(hand.style.transform).toBe("");
    // Every cue is readable at once, rather than arriving one at a time.
    const pills = Array.from(document.querySelectorAll("[data-gesture-cue]")) as HTMLElement[];
    expect(pills).toHaveLength(4);
    expect(pills.every((pill) => pill.style.visibility !== "hidden")).toBe(true);
  });
});
