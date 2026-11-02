import { PAN_CENTRE, coverRoom, panBy, panStyle } from "./photo-pan";

describe("coverRoom", () => {
  it("measures the photo the crop hides, on the axis that has a spare", () => {
    // A landscape photo in a portrait phone: it is scaled to the height, and the
    // width overflows by everything the screen cannot show.
    const room = coverRoom({ width: 375, height: 812 }, { width: 1920, height: 1280 });
    expect(room.y).toBeCloseTo(0, 6);
    // Scaled to the height, the photo is 1218 wide against a 375 frame.
    expect(room.x).toBeCloseTo(1920 * (812 / 1280) - 375, 6);
  });

  it("gives the height the spare on a wide screen, and the width nothing", () => {
    const room = coverRoom({ width: 1920, height: 880 }, { width: 1920, height: 1280 });
    expect(room.x).toBeCloseTo(0, 6);
    expect(room.y).toBeCloseTo(1280 - 880, 6);
  });

  it("has nothing to pan when the photo and the frame agree", () => {
    expect(coverRoom({ width: 1000, height: 500 }, { width: 2000, height: 1000 })).toEqual({ x: 0, y: 0 });
  });

  it("says nothing rather than dividing by a photo it hasn't decoded", () => {
    expect(coverRoom({ width: 0, height: 0 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("panBy", () => {
  const room = { x: 800, y: 200 };

  it("moves the photo with the finger, not against it", () => {
    // Dragging right uncovers what was to the photo's left: the position drops.
    expect(panBy({ x: 50, y: 50 }, { dx: 80, dy: 0 }, room).x).toBeCloseTo(40, 6);
    // Dragging down uncovers what was above it.
    expect(panBy({ x: 50, y: 50 }, { dx: 0, dy: 20 }, room).y).toBeCloseTo(40, 6);
  });

  it("stops at the photo's edges instead of showing past them", () => {
    expect(panBy({ x: 50, y: 50 }, { dx: 5000, dy: 5000 }, room)).toEqual({ x: 0, y: 0 });
    expect(panBy({ x: 50, y: 50 }, { dx: -5000, dy: -5000 }, room)).toEqual({ x: 100, y: 100 });
  });

  it("keeps an axis with no room at the middle", () => {
    expect(panBy({ x: 50, y: 50 }, { dx: 0, dy: 300 }, { x: 800, y: 0 })).toEqual({
      x: PAN_CENTRE.x,
      y: PAN_CENTRE.y,
    });
  });

  it("writes the position as CSS reads it", () => {
    expect(panStyle({ x: 33.333, y: 66.667 })).toBe("33.33% 66.67%");
  });
});
