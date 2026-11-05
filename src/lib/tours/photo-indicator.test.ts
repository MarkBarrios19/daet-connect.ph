import { arcPoint, dotWindow, indicatorDots } from "@/lib/tours/photo-indicator";

describe("dotWindow", () => {
  it("shows every photo when there are no more than the window", () => {
    expect(dotWindow(2, 5, 5)).toEqual({ first: 0, shown: 5 });
    expect(dotWindow(0, 3, 7)).toEqual({ first: 0, shown: 3 });
  });

  it("centres on the current photo and pins at both ends", () => {
    expect(dotWindow(0, 40, 7)).toEqual({ first: 0, shown: 7 });
    expect(dotWindow(20, 40, 7)).toEqual({ first: 17, shown: 7 });
    expect(dotWindow(39, 40, 7)).toEqual({ first: 33, shown: 7 });
  });
});

describe("indicatorDots", () => {
  it("is the same length for 15 photos as for 40", () => {
    for (const count of [15, 40]) {
      const dots = indicatorDots(9, count, 7);
      expect(dots.filter((d) => d.inside)).toHaveLength(7);
      expect(dots.filter((d) => d.inside).every((d) => d.x >= 0 && d.x <= 1)).toBe(true);
    }
  });

  it("marks the current dot and shrinks the end dots only when more photos lie beyond", () => {
    const middle = indicatorDots(8, 15, 7).filter((d) => d.inside);
    expect(middle.filter((d) => d.edge).map((d) => d.k)).toEqual([5, 11]);
    expect(middle.find((d) => d.here)?.k).toBe(8);
    const start = indicatorDots(0, 15, 7).filter((d) => d.inside);
    expect(start.filter((d) => d.edge).map((d) => d.k)).toEqual([6]);
  });

  it("parks dots outside the window at the nearest end of the arc", () => {
    const dots = indicatorDots(20, 40, 7);
    expect(dots[0]).toMatchObject({ inside: false, x: 0 });
    expect(dots[39]).toMatchObject({ inside: false, x: 1 });
  });
});

describe("arcPoint", () => {
  it("bows upward in the middle", () => {
    expect(arcPoint(0.5).y).toBeLessThan(arcPoint(0).y);
    expect(arcPoint(0).y).toBeCloseTo(arcPoint(1).y);
  });
});
