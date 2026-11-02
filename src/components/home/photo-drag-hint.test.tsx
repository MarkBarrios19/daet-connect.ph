/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { gsap } from "@/lib/gsap";
import { PhotoDragHint } from "./photo-drag-hint";

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

describe("PhotoDragHint", () => {
  it("says the photo can be dragged, and takes no pointer events", () => {
    motion(false);
    render(<PhotoDragHint onDone={jest.fn()} />);

    expect(screen.getByText("Drag to look around")).toBeInTheDocument();
    // Dragging through the hint must reach the photo underneath it.
    expect(document.querySelector("[data-drag-hint]")).toHaveClass("pointer-events-none");
    expect(document.querySelector("[data-drag-hand]")).toBeInTheDocument();
  });

  it("sways the hand left and right, then puts itself away", async () => {
    motion(false);
    const onDone = jest.fn();
    render(<PhotoDragHint onDone={onDone} />);

    // Runs the animation fast, but through the real timeline.
    gsap.globalTimeline.timeScale(40);

    const hand = document.querySelector("[data-drag-hand]") as HTMLElement;
    await waitFor(() => expect(hand.style.transform).toMatch(/translate/));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("holds the hand still when the device asks for less motion, and still says it", async () => {
    motion(true);
    const onDone = jest.fn();
    render(<PhotoDragHint onDone={onDone} />);

    gsap.globalTimeline.timeScale(40);

    const hand = document.querySelector("[data-drag-hand]") as HTMLElement;
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(hand.style.transform).toBe("");
    expect(screen.getByText("Drag to look around")).toBeInTheDocument();
  });
});
