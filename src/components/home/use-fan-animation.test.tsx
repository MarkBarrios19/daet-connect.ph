/**
 * @jest-environment jsdom
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import React, { useRef } from "react";
import { act, render } from "@testing-library/react";
import {
  fanGeometry,
  fanWedgePoints,
  lerpPoints,
  rectPolygon,
  restWidths,
  toClipPath,
  widthsWithFocus,
  type Point,
} from "./fan-geometry";
import { useFanAnimation } from "./use-fan-animation";

type Call = { kind: "set" | "to"; targets: unknown; vars: Record<string, unknown>; position?: unknown };
type Timeline = {
  steps: Call[];
  callbacks: Record<string, () => void>;
  options?: { defaults?: Record<string, unknown> };
  killed: boolean;
  reversed: boolean;
  set(targets: unknown, vars: Record<string, unknown>): Timeline;
  to(targets: unknown, vars: Record<string, unknown>, position?: unknown): Timeline;
  eventCallback(name: string, callback: () => void): Timeline;
  kill(): Timeline;
  reverse(): Timeline;
};

jest.mock("@/lib/gsap", () => {
  const records = {
    to: [] as Call[],
    set: [] as Call[],
    timelines: [] as Timeline[],
    quickTo: [] as Array<{ target: Element; prop: string; vars: Record<string, unknown>; move: jest.Mock }>,
    killed: [] as unknown[],
    conditions: { desktop: true, phone: false, reduce: false },
  };

  const makeTimeline = (options?: Timeline["options"]) => {
    const timeline: Timeline = {
      steps: [],
      callbacks: {},
      options,
      killed: false,
      reversed: false,
      set(targets, vars) {
        this.steps.push({ kind: "set", targets, vars });
        return this;
      },
      to(targets, vars, position) {
        this.steps.push({ kind: "to", targets, vars, position });
        return this;
      },
      eventCallback(name: string, callback: () => void) {
        this.callbacks[name] = callback;
        return this;
      },
      kill() {
        this.killed = true;
        return this;
      },
      // A real timeline finishes reversing over 450ms; answering the callback
      // straight away keeps the assertion about the ordering, not the clock.
      reverse() {
        this.reversed = true;
        this.callbacks.onReverseComplete?.();
        return this;
      },
    };
    records.timelines.push(timeline);
    return timeline;
  };

  const gsap = {
    timeline: (options?: Timeline["options"]) => makeTimeline(options),
    to: (targets: unknown, vars: Record<string, unknown>) => {
      records.to.push({ kind: "to", targets, vars });
      return { kill() {} };
    },
    set: (targets: unknown, vars: Record<string, unknown>) => {
      records.set.push({ kind: "set", targets, vars });
      return {};
    },
    killTweensOf: (targets: unknown) => {
      records.killed.push(targets);
    },
    quickTo: (target: Element, prop: string, vars: Record<string, unknown>) => {
      const move = jest.fn();
      records.quickTo.push({ target, prop, vars, move });
      return move;
    },
    utils: {
      toArray: (selector: string, scope: Element) => Array.from(scope.querySelectorAll(selector)),
    },
    matchMedia: () => ({
      add: (_queries: unknown, handler: (context: { conditions: Record<string, boolean> }) => void) => {
        handler({ conditions: records.conditions });
      },
      revert() {},
    }),
  };

  // The real hook runs its callback in a layout effect, once the ref is
  // pointing at the DOM; the mock has to as well.
  const useGSAP = (callback: () => void) => {
    const { useLayoutEffect } = jest.requireActual<typeof import("react")>("react");
    useLayoutEffect(() => {
      callback();
    }, []);
    return { contextSafe: <T,>(fn: T) => fn };
  };

  return { gsap, useGSAP, ScrollTrigger: {}, __records: records };
});

const { __records: records } = jest.requireMock("@/lib/gsap") as {
  __records: {
    to: Call[];
    set: Call[];
    timelines: Timeline[];
    quickTo: Array<{ target: Element; prop: string; vars: Record<string, unknown>; move: jest.Mock }>;
    killed: unknown[];
    conditions: { desktop: boolean; phone: boolean; reduce: boolean };
  };
};

const WIDTH = 1440;
const HEIGHT = 900;
const geometry = fanGeometry(WIDTH, HEIGHT, "desktop");

/** The clip-path a wedge has at the given widths, as the hook would write it. */
const shapeAt = (widths: number[], index: number): string =>
  toClipPath(fanWedgePoints(geometry, 0, widths)[index], WIDTH, HEIGHT);

const OPEN = toClipPath(rectPolygon(WIDTH, HEIGHT), WIDTH, HEIGHT);

/** The shape a wedge has part-way towards the whole hero, as `render` writes it. */
const lerpShape = (index: number, open: number): string =>
  toClipPath(lerpPoints(fanWedgePoints(geometry, 0, restWidths(geometry))[index], rectPolygon(WIDTH, HEIGHT), open), WIDTH, HEIGHT);

type Api = ReturnType<typeof useFanAnimation>;

function Harness({
  onOpened,
  onClosed,
  api,
}: {
  onOpened?: () => void;
  onClosed?: () => void;
  api: { current: Api | null };
}) {
  const root = useRef<HTMLDivElement>(null);
  const fan = useFanAnimation({ root, geometry, onOpened, onClosed });
  api.current = fan;

  return (
    <div ref={root}>
      <div data-headline />
      {geometry.wedges.map((_, index) => (
        <button type="button" key={index} data-wedge={index}>
          <span data-photo={index} />
          <span data-chip={index} />
        </button>
      ))}
    </div>
  );
}

function mount(options: { onOpened?: () => void; onClosed?: () => void } = {}) {
  const api: { current: Api | null } = { current: null };
  const view = render(<Harness api={api} onOpened={options.onOpened} onClosed={options.onClosed} />);
  const wedges = Array.from(view.container.querySelectorAll<HTMLElement>("[data-wedge]"));
  const photos = Array.from(view.container.querySelectorAll<HTMLElement>("[data-photo]"));
  const chips = Array.from(view.container.querySelectorAll<HTMLElement>("[data-chip]"));
  const headline = view.container.querySelector<HTMLElement>("[data-headline]") as HTMLElement;
  return { view, api, wedges, photos, chips, headline };
}

const tweensOn = (calls: Call[], target: Element) =>
  calls.filter((entry) => entry.targets === target || (Array.isArray(entry.targets) && entry.targets.includes(target)));

/**
 * Run one frame of a width tween: the mocked GSAP does not interpolate, so the
 * targets array is filled in by hand — it is the hook's own state, by reference
 * — and the tween's `onUpdate` does the rest.
 */
const advanceWidths = (call: Call, widths: number[]) => {
  const state = call.targets as number[];
  state.splice(0, state.length, ...widths);
  (call.vars.onUpdate as () => void)();
};

/** Fill in the object tween that opens a wedge, then render it. */
const advanceOpen = (step: Call, to: number) => {
  (step.targets as { t: number }).t = to;
  (step.vars.onUpdate as () => void)();
};

beforeEach(() => {
  records.to.length = 0;
  records.set.length = 0;
  records.timelines.length = 0;
  records.quickTo.length = 0;
  records.killed.length = 0;
  records.conditions.desktop = true;
  records.conditions.phone = false;
  records.conditions.reduce = false;
});

describe("useFanAnimation", () => {
  it("writes the rest shapes straight into the wedges as soon as the fan mounts", () => {
    const { wedges } = mount();

    wedges.forEach((wedge, index) => {
      expect(wedge.style.clipPath).toBe(geometry.wedges[index].rest);
    });
  });

  it("tweens the widths as numbers and widens the hovered wedge over 350ms of power3.out", () => {
    const { api, wedges } = mount();

    act(() => api.current?.hover(1));

    const growth = records.to.find((call) => Array.isArray(call.targets));
    expect(growth).toBeDefined();
    expect(growth!.vars).toMatchObject({
      endArray: widthsWithFocus(geometry, 1),
      duration: 0.35,
      ease: "power3.out",
      overwrite: true,
    });
    expect(typeof growth!.vars.onUpdate).toBe("function");

    advanceWidths(growth!, widthsWithFocus(geometry, 1));

    expect(wedges[1].style.clipPath).toBe(shapeAt(widthsWithFocus(geometry, 1), 1));
    expect(wedges[1].style.clipPath).not.toBe(geometry.wedges[1].rest);
    expect(wedges[3].style.clipPath).toBe(shapeAt(widthsWithFocus(geometry, 1), 3));

    // One tween dims the others and leaves the hovered one alone, decided per
    // element, so the fan's brightness never disagrees with its shapes.
    const dimming = records.to.find((call) => typeof call.vars.filter === "function");
    const brightness = dimming!.vars.filter as (index: number) => string;
    expect(brightness(1)).toBe("brightness(1)");
    expect(brightness(3)).toBe("brightness(0.78)");
  });

  it("gives every wedge its rest shape back when the pointer leaves", () => {
    const { api, wedges } = mount();

    act(() => api.current?.hover(1));
    records.to.length = 0;
    act(() => api.current?.hover(null));

    const growth = records.to.find((call) => Array.isArray(call.targets));
    expect(growth!.vars.endArray).toEqual(restWidths(geometry));

    advanceWidths(growth!, restWidths(geometry));

    wedges.forEach((wedge, index) => expect(wedge.style.clipPath).toBe(geometry.wedges[index].rest));
  });

  it("never passes the name tag an undefined opacity, which would leave the last one stuck on", () => {
    const { api } = mount();

    act(() => api.current?.hover(1));
    act(() => api.current?.hover(null));

    const tagTweens = records.to.filter((call) => Boolean((call.targets as HTMLElement).hasAttribute?.("data-chip")));
    expect(tagTweens.length).toBeGreaterThan(0);

    tagTweens.forEach((call) => {
      expect(call.vars).toHaveProperty("autoAlpha");
      expect(call.vars.autoAlpha).not.toBeUndefined();
    });

    // The last thing every tag was told, on the way out, is "hidden" — not
    // "leave that property alone", which is what kept one stuck on screen.
    const lastPerTag = new Map<string, Call>();
    tagTweens.forEach((call) => lastPerTag.set((call.targets as HTMLElement).getAttribute("data-chip") ?? "", call));
    expect(lastPerTag.size).toBe(geometry.wedges.length);
    lastPerTag.forEach((call) => {
      expect(call.vars.autoAlpha).toBe(0);
      expect(call.vars.y).toBe(6);
    });
  });

  it("morphs an opening wedge towards the whole hero, and the others outward", () => {
    const onOpened = jest.fn();
    const { api, wedges, photos, headline } = mount({ onOpened });

    act(() => api.current?.openAt(2));

    const [timeline] = records.timelines;
    expect(timeline.options?.defaults).toMatchObject({ ease: "power3.inOut" });

    const grow = timeline.steps.find((step) => step.vars.duration === 0.45 && typeof step.vars.onUpdate === "function");
    expect(grow).toBeDefined();
    expect(typeof grow!.targets).toBe("object");
    expect(grow!.targets).not.toBeInstanceOf(Element);

    advanceOpen(grow!, 1);
    expect(wedges[2].style.clipPath).toBe(OPEN);

    const shrink = timeline.steps.find((step) => step.targets === photos[2]);
    expect(shrink?.vars).toMatchObject({ x: 0, y: 0, scale: 1 });

    const fadeOut = timeline.steps.filter(
      (step) =>
        step.vars.autoAlpha === 0 &&
        step.targets !== photos[2] &&
        step.targets !== wedges[2] &&
        step.targets !== headline,
    );
    expect(fadeOut).toHaveLength(geometry.wedges.length - 1);
    fadeOut.forEach((step) => {
      expect(step.vars.duration).toBe(0.45);
      expect(Math.abs(Number(step.vars.x)) + Math.abs(Number(step.vars.y))).toBeGreaterThan(0);
    });

    timeline.callbacks.onComplete();
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("reverses the open timeline to fold the fan back, and the shapes follow it", () => {
    const onClosed = jest.fn();
    const { api, wedges } = mount({ onClosed });

    act(() => api.current?.openAt(4));
    act(() => api.current?.close());

    const [timeline] = records.timelines;
    expect(timeline.reversed).toBe(true);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(wedges[4].style.clipPath).toBe(geometry.wedges[4].rest);
    wedges.forEach((wedge, index) => expect(wedge.style.clipPath).toBe(geometry.wedges[index].rest));
  });

  it("folds the fan back with a real animation after a step, not a snap", () => {
    // A step kills the timeline that opened the place. The close then has
    // nothing to reverse, and used to fall straight through to reset(): the
    // owner stepped twice, pressed the ✕, and the fan snapped back with no
    // animation at all.
    const onClosed = jest.fn();
    const { api, wedges } = mount({ onClosed });

    act(() => api.current?.openAt(0));
    act(() => api.current?.swapTo(1, { from: 0, direction: 1 }));

    // The open timeline is gone: nothing of the sort is left to reverse.
    expect(records.timelines[0].killed).toBe(true);

    records.timelines.length = 0;
    records.set.length = 0;
    act(() => api.current?.close());

    // A close timeline exists, and it is not a reversal of the dead one.
    expect(records.timelines).toHaveLength(1);
    const [foldBack] = records.timelines;
    expect(foldBack.reversed).toBe(false);

    // It shrinks the open wedge frame by frame, exactly as opening grew it.
    const steps = foldBack.steps;
    const shrinking = steps.find(
      (step) => step.kind === "to" && typeof step.vars.onUpdate === "function" && typeof (step.targets as { t: number }).t === "number",
    );
    expect(shrinking).toBeDefined();
    expect((shrinking!.targets as { t: number }).t).toBe(1);
    expect(shrinking!.vars.duration).toBeGreaterThan(0);

    // The photo it replaced comes back, the ones that slid out return.
    expect(tweensOn(steps, wedges[0]).map((step) => step.vars)).toContainEqual(
      expect.objectContaining({ autoAlpha: 1, x: 0, y: 0 }),
    );

    advanceOpen(shrinking!, 0.4);
    expect(wedges[1].style.clipPath).toBe(lerpShape(1, 0.4));

    // Still open until it has actually folded back.
    expect(onClosed).not.toHaveBeenCalled();
    act(() => foldBack.callbacks.onComplete?.());

    expect(onClosed).toHaveBeenCalledTimes(1);
    wedges.forEach((wedge, index) => expect(wedge.style.clipPath).toBe(geometry.wedges[index].rest));
  });

  it("closes without a timeline when nothing was open", () => {
    const onClosed = jest.fn();
    const { api } = mount({ onClosed });

    act(() => api.current?.close());

    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("swipes the next photo in from the right, and the one it replaces out to the left", () => {
    const { api, wedges, photos } = mount();

    act(() => api.current?.openAt(0));
    records.to.length = 0;
    records.set.length = 0;
    act(() => api.current?.swapTo(3, { from: 0, direction: 1 }));

    expect(wedges[3].style.clipPath).toBe(OPEN);
    // The one that is leaving keeps the hero's shape while it goes, rather than
    // falling back to its fan sliver under the incoming photo — the fan would show
    // through the gap where its photo used to be.
    expect(wedges[0].style.clipPath).toBe(OPEN);

    // The incoming photo starts a hero to the right of its frame, and is set there
    // rather than tweened: nothing of the page shows behind a slide that starts
    // where the eye can see it.
    const before = tweensOn(records.set, photos[3]).map((call) => call.vars);
    expect(before).toContainEqual(expect.objectContaining({ xPercent: 100 }));

    // The two photos travel together — one to 0, the other to -100 — so their
    // edges meet at every frame and the hero is covered end to end the whole way.
    const swipes = records.to.filter((call) => call.kind === "to" && "xPercent" in call.vars);
    expect(swipes).toHaveLength(2);
    const [incoming, outgoing] = [tweensOn(swipes, photos[3])[0], tweensOn(swipes, photos[0])[0]];
    expect(incoming.vars.xPercent).toBe(0);
    expect(outgoing.vars.xPercent).toBe(-100);
    expect(incoming.vars.duration).toBe(outgoing.vars.duration);
    expect(incoming.vars.ease).toBe(outgoing.vars.ease);

    // Its own ground is taken out of the way for the length of the slide: the
    // incoming wedge is the top layer, and an opaque one would paint over the
    // photo beneath while its own is still off to the side.
    expect(tweensOn(records.set, wedges[3]).map((call) => call.vars)).toContainEqual(
      expect.objectContaining({ backgroundColor: "transparent" }),
    );
  });

  it("swipes the previous photo in from the left, the other way round", () => {
    const { api, photos } = mount();

    act(() => api.current?.openAt(3));
    records.to.length = 0;
    records.set.length = 0;
    act(() => api.current?.swapTo(2, { from: 3, direction: -1 }));

    const before = tweensOn(records.set, photos[2]).map((call) => call.vars);
    expect(before).toContainEqual(expect.objectContaining({ xPercent: -100 }));

    const swipes = records.to.filter((call) => "xPercent" in call.vars);
    expect(tweensOn(swipes, photos[2])[0].vars.xPercent).toBe(0);
    expect(tweensOn(swipes, photos[3])[0].vars.xPercent).toBe(100);
  });

  it("opens a place a link names instantly, with no morph", () => {
    const onOpened = jest.fn();
    const { api, wedges } = mount({ onOpened });

    act(() => api.current?.openAt(5, { instant: true }));

    expect(records.timelines).toHaveLength(0);
    expect(wedges[5].style.clipPath).toBe(OPEN);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("drops the morph for reduced motion but still opens the place", () => {
    records.conditions.reduce = true;
    const onOpened = jest.fn();
    const { api, wedges } = mount({ onOpened });

    act(() => api.current?.openAt(1));

    expect(records.timelines).toHaveLength(0);
    expect(wedges[1].style.clipPath).toBe(OPEN);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("fades the headline by opacity only, so it stays in the accessibility tree", () => {
    const instant = mount();
    act(() => instant.api.current?.openAt(0, { instant: true }));
    expect(records.set.some((call) => call.targets === instant.headline && call.vars.opacity === 0)).toBe(true);
    expect(records.set.some((call) => call.targets === instant.headline && "autoAlpha" in call.vars)).toBe(false);

    records.set.length = 0;
    records.conditions.reduce = true;
    const reduced = mount();
    act(() => reduced.api.current?.openAt(0));
    expect(records.set.some((call) => call.targets === reduced.headline && call.vars.opacity === 0)).toBe(true);
  });

  it("brings the headline back when the fan closes", () => {
    const { api, headline } = mount();

    act(() => api.current?.openAt(0));
    records.set.length = 0;
    act(() => api.current?.close());

    expect(records.set.some((call) => call.targets === headline && call.vars.opacity === 1)).toBe(true);
  });

  it("nudges the photo through one reused tween per wedge", () => {
    const { api, photos } = mount();

    act(() => {
      api.current?.parallax(2, 12);
      api.current?.parallax(2, -8);
    });

    expect(records.quickTo).toHaveLength(1);
    expect(records.quickTo[0].target).toBe(photos[2]);
    expect(records.quickTo[0].prop).toBe("x");
    expect(records.quickTo[0].move.mock.calls).toEqual([[12], [-8]]);
  });

  it("still shows the name under reduced motion, just without the easing", () => {
    records.conditions.reduce = true;
    const { api } = mount();

    act(() => api.current?.hover(2));

    const chips = records.set.filter((call) => (call.targets as HTMLElement).hasAttribute?.("data-chip"));
    const shown = chips.filter((call) => call.vars.autoAlpha === 1);
    expect(shown).toHaveLength(1);
    expect((shown[0].targets as HTMLElement).getAttribute("data-chip")).toBe("2");
    expect(records.set.some((call) => "autoAlpha" in call.vars && call.vars.autoAlpha === undefined)).toBe(false);
  });

  it("leaves the photo alone under reduced motion", () => {
    records.conditions.reduce = true;
    const { api } = mount();

    act(() => api.current?.parallax(0, 10));

    expect(records.quickTo).toHaveLength(0);
  });
});

/**
 * GSAP's CSS plugin mangles a `clip-path` whose percentages pass ±100%, and
 * every arc point in this fan does. The fix is to tween numbers and write the
 * strings ourselves, so no GSAP call may ever be handed a `clipPath` again.
 */
describe("the fan's source", () => {
  const directory = join(process.cwd(), "src", "components", "home");

  /** Each GSAP call in a file: from `gsap.x(` or `tl.x(` to its closing paren. */
  const gsapCalls = (source: string) => {
    const calls: string[] = [];
    const pattern = /\b(?:gsap|tl|timeline(?:\.current)?)\s*\.\s*\w+\s*\(/g;

    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
      let depth = 0;
      let end = match.index + match[0].length - 1;
      for (; end < source.length; end += 1) {
        if (source[end] === "(") depth += 1;
        else if (source[end] === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      calls.push(source.slice(match.index, end + 1));
    }

    return calls;
  };

  it("finds the calls it is meant to be guarding", () => {
    const source = readFileSync(join(directory, "use-fan-animation.ts"), "utf8");
    expect(gsapCalls(source).length).toBeGreaterThan(10);
    expect(gsapCalls(`gsap.to(el, { clipPath: "polygon(0 0)" })`)).toHaveLength(1);
  });

  it("never hands GSAP a clip-path to interpolate", () => {
    const files = readdirSync(directory).filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."));
    expect(files.length).toBeGreaterThan(3);

    const offenders = files.flatMap((name) =>
      gsapCalls(readFileSync(join(directory, name), "utf8"))
        .filter((call) => /clipPath\s*:/.test(call))
        .map((call) => `${name}: ${call.split("\n")[0]}`),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps every shape string in fan-geometry", () => {
    const files = readdirSync(directory).filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."));
    const writers = files.filter((name) =>
      /polygon\(|style\.clipPath\s*=/.test(readFileSync(join(directory, name), "utf8")),
    );

    // toClipPath is the only place a polygon is written; the animation only
    // assigns what it returns.
    expect(writers.sort()).toEqual(["fan-geometry.ts", "use-fan-animation.ts"]);
  });
});
