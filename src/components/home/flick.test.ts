import { flickStep, FLICK_MIN } from "./flick";

describe("flickStep", () => {
  it("steps on with a quick swipe to the left, and back with one to the right", () => {
    expect(flickStep({ dx: -70, dy: 4, ms: 120 })).toBe(1);
    expect(flickStep({ dx: 70, dy: -6, ms: 120 })).toBe(-1);
  });

  it("is not a flick when the drag was slow: that is looking along the photo", () => {
    expect(flickStep({ dx: -120, dy: 0, ms: 900 })).toBe(0);
  });

  it("is not a flick when the drag was short", () => {
    expect(flickStep({ dx: -(FLICK_MIN - 1), dy: 0, ms: 90 })).toBe(0);
  });

  it("is not a flick when the drag was mostly up or down", () => {
    expect(flickStep({ dx: 60, dy: 120, ms: 100 })).toBe(0);
  });

  it("accepts a slightly slanted flick, since a thumb never goes straight", () => {
    expect(flickStep({ dx: -60, dy: 20, ms: 140 })).toBe(1);
  });
});
