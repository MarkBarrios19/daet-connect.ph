/**
 * @jest-environment jsdom
 */

import { act, render, screen } from "@testing-library/react";
import { RevealObserver } from "./reveal-observer";

jest.mock("next/navigation", () => ({ usePathname: () => "/" }));

type Entry = { target: Element; isIntersecting: boolean };
type Callback = (entries: Entry[]) => void;

const observers: Array<{
  callback: Callback;
  observed: Element[];
  unobserved: Element[];
  disconnected: boolean;
}> = [];

const original = global.IntersectionObserver;

beforeEach(() => {
  observers.length = 0;
  global.IntersectionObserver = class {
    callback: Callback;
    observed: Element[] = [];
    unobserved: Element[] = [];
    disconnected = false;

    constructor(callback: Callback) {
      this.callback = callback;
      observers.push(this);
    }

    observe(element: Element) {
      this.observed.push(element);
    }

    unobserve(element: Element) {
      this.unobserved.push(element);
    }

    disconnect() {
      this.disconnected = true;
    }
  } as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  global.IntersectionObserver = original;
});

/** A page with two sections waiting for their entrance. */
function Section({ label }: { label: string }) {
  return (
    <p data-reveal data-testid={label}>
      {label}
    </p>
  );
}

describe("RevealObserver", () => {
  it("watches every section that is still waiting", () => {
    render(
      <>
        <Section label="one" />
        <Section label="two" />
        <p data-reveal data-revealed="true" data-testid="already">
          already
        </p>
        <p data-testid="plain">plain</p>
        <RevealObserver />
      </>,
    );

    expect(observers).toHaveLength(1);
    expect(observers[0].observed.map((element) => element.textContent)).toEqual(["one", "two"]);
  });

  it("marks a section once it arrives, and stops watching it", () => {
    render(
      <>
        <Section label="one" />
        <RevealObserver />
      </>,
    );

    const section = screen.getByTestId("one");
    observers[0].callback([{ target: section, isIntersecting: true }]);

    expect(section).toHaveAttribute("data-revealed");
    expect(observers[0].unobserved).toEqual([section]);

    // Leaving the viewport can't take the reveal back: it is done.
    observers[0].callback([{ target: section, isIntersecting: false }]);
    expect(section).toHaveAttribute("data-revealed");
  });

  it("leaves a section that isn't in view yet alone", () => {
    render(
      <>
        <Section label="one" />
        <RevealObserver />
      </>,
    );

    observers[0].callback([{ target: screen.getByTestId("one"), isIntersecting: false }]);

    expect(screen.getByTestId("one")).not.toHaveAttribute("data-revealed");
    expect(observers[0].unobserved).toEqual([]);
  });

  it("shows everything straight away when the browser has no observer", () => {
    // @ts-expect-error – the point of the test is a browser without one.
    delete global.IntersectionObserver;

    render(
      <>
        <Section label="one" />
        <Section label="two" />
        <RevealObserver />
      </>,
    );

    expect(screen.getByTestId("one")).toHaveAttribute("data-revealed");
    expect(screen.getByTestId("two")).toHaveAttribute("data-revealed");
  });

  it("watches a section that arrives after the first scan", async () => {
    // The home page's hero streams in first; the sections under it can land
    // afterwards. A section nobody is watching is invisible for good under
    // `html.js`, which is a page of bare canvas — the bug the owner photographed.
    render(<RevealObserver />);
    expect(observers[0].observed).toHaveLength(0);

    const late = document.createElement("section");
    late.setAttribute("data-reveal", "");
    late.textContent = "late";

    await act(async () => {
      document.body.append(late);
      await Promise.resolve();
    });

    expect(observers[0].observed).toEqual([late]);
  });

  it("shows anything that reaches the fold, even if the observer never said so", async () => {
    render(
      <>
        <Section label="one" />
        <Section label="two" />
        <RevealObserver />
      </>,
    );

    const one = screen.getByTestId("one");
    const two = screen.getByTestId("two");
    // One is at the fold; two is still a screen below it.
    one.getBoundingClientRect = () => ({ top: 120, bottom: 200 }) as DOMRect;
    two.getBoundingClientRect = () => ({ top: 2000, bottom: 2100 }) as DOMRect;

    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(one).toHaveAttribute("data-revealed");
    expect(two).not.toHaveAttribute("data-revealed");
  });

  it("stops watching when it unmounts", () => {
    const view = render(
      <>
        <Section label="one" />
        <RevealObserver />
      </>,
    );

    view.unmount();

    expect(observers[0].disconnected).toBe(true);
  });
});
