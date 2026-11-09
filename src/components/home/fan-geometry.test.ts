import {
  PHONE_BAND,
  PHONE_BAND_MIN,
  DEFAULT_HERO_SIZE,
  HOVER_BUMP,
  SEAM_PX,
  fanGeometry,
  fanWedgePoints,
  fanWidths,
  lerpPoints,
  midVector,
  pointAboveHeadline,
  rectPolygon,
  rectPoints,
  restWidths,
  toClipPath,
  wedgePolygon,
  widthsWithFocus,
  type Point,
} from "./fan-geometry";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const SPAN = 184; // 178° → 362°, the desktop fan

/** The numeric pairs inside a clip-path string. */
const tokens = (clip: string) => clip.match(/-?\d+(\.\d+)?%/g) ?? [];

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const along = (from: Point, degrees: number, distance: number): Point => [
  from[0] + distance * Math.cos(rad(degrees)),
  from[1] + distance * Math.sin(rad(degrees)),
];

/** Perpendicular distance from a point to the line through `a` and `b`. */
const distanceToLine = (point: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.abs(dx * (point[1] - a[1]) - dy * (point[0] - a[0])) / Math.hypot(dx, dy);
};

describe("fanWidths", () => {
  it("splits the span evenly when nothing is focused", () => {
    const widths = fanWidths(6, SPAN, null);

    expect(widths).toHaveLength(6);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(SPAN, 10);
    expect(new Set(widths).size).toBe(1);
  });

  it("still sums to the span while one wedge is focused", () => {
    const widths = fanWidths(6, SPAN, 3);

    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(SPAN, 10);
  });

  it("widens the focused wedge by exactly the hover bump", () => {
    const base = SPAN / 6;
    const widths = fanWidths(6, SPAN, 2);

    expect(widths[2] - base).toBeCloseTo(SPAN * HOVER_BUMP, 10);
    expect(widths[2] - base).toBeCloseTo(SPAN * 0.05, 10);
  });

  it("takes the extra width out of the other wedges equally", () => {
    const widths = fanWidths(6, SPAN, 0);
    const others = widths.slice(1);

    expect(new Set(others.map((w) => w.toFixed(6))).size).toBe(1);
    expect(others[0]).toBeLessThan(widths[0]);
  });

  it("falls back to an even fan when the focus index is out of range", () => {
    expect(fanWidths(6, SPAN, 9)).toEqual(fanWidths(6, SPAN, null));
    expect(fanWidths(6, SPAN, -1)).toEqual(fanWidths(6, SPAN, null));
  });
});

describe("polygons", () => {
  it("gives every wedge nine points: the apex and eight along the arc", () => {
    const wedge = wedgePolygon([720, 520], 178, 208, 3600);

    expect(wedge).toHaveLength(9);
  });

  it("puts every wedge's apex on the fan's own point, so they meet", () => {
    const vp: Point = [720, 520];
    const wedge = wedgePolygon(vp, 178, 208, 3600);

    // The seam tapers to nothing at the point: no inset, no notch between the
    // wedges. (This used to be half a seam over sin 15° of clearance.)
    expect(wedge[0]).toEqual(vp);
  });

  it("gives the open rectangle the same nine points, so the two can be blended", () => {
    const rect = rectPolygon(DESKTOP.width, DESKTOP.height);

    expect(rect).toHaveLength(9);
    expect(rect[0]).toEqual([DESKTOP.width / 2, DESKTOP.height]);
    expect(rectPoints(DESKTOP.width, DESKTOP.height)).toEqual(rect);
  });

  it("tapers the seam to nothing at the point, and to SEAM_PX at the far edge", () => {
    const geo = fanGeometry(DESKTOP.width, DESKTOP.height, "desktop");
    const vp = geo.fans[0].vp;

    // The seam between wedge 2 and wedge 3 runs along wedge 2's `a1`.
    const boundary = geo.wedges[2].a1;
    const first = geo.points[2];
    const second = geo.points[3];

    const widthAt = (distance: number) => {
      const point = along(vp, boundary, distance);
      const leftEdge = distanceToLine(point, first[0], first[first.length - 1]);
      const rightEdge = distanceToLine(point, second[0], second[1]);
      return leftEdge + rightEdge;
    };

    // The furthest corner of the hero from the fan's point, where the seam is
    // at its nominal width; from there it is proportional to the distance.
    const far = Math.max(
      Math.hypot(vp[0], vp[1]),
      Math.hypot(DESKTOP.width - vp[0], vp[1]),
      Math.hypot(vp[0], DESKTOP.height - vp[1]),
      Math.hypot(DESKTOP.width - vp[0], DESKTOP.height - vp[1]),
    );

    expect(widthAt(far)).toBeCloseTo(SEAM_PX.desktop, 1);
    expect(widthAt(far / 2)).toBeCloseTo(SEAM_PX.desktop / 2, 1);
    expect(widthAt(far / 4)).toBeCloseTo(SEAM_PX.desktop / 4, 1);
    expect(widthAt(far / 8)).toBeCloseTo(SEAM_PX.desktop / 8, 1);
    // Nothing left at the point itself.
    expect(widthAt(2)).toBeLessThan(0.1);
  });

  it("uses a thinner seam on a phone", () => {
    const geo = fanGeometry(PHONE.width, PHONE.height, "phone");
    const vp = geo.fans[0].vp;
    const boundary = geo.wedges[0].a1;
    const first = geo.points[0];
    const second = geo.points[1];

    const far = Math.max(
      Math.hypot(vp[0], vp[1]),
      Math.hypot(PHONE.width - vp[0], vp[1]),
      Math.hypot(vp[0], PHONE.height - vp[1]),
      Math.hypot(PHONE.width - vp[0], PHONE.height - vp[1]),
    );
    const at = (share: number) => {
      const point = along(vp, boundary, far * share);
      return distanceToLine(point, first[0], first[first.length - 1]) + distanceToLine(point, second[0], second[1]);
    };

    expect(at(1)).toBeCloseTo(SEAM_PX.phone, 1);
    expect(at(0.5)).toBeCloseTo(SEAM_PX.phone / 2, 1);
    expect(SEAM_PX.phone).toBeLessThan(SEAM_PX.desktop);
  });

  it("writes clip-paths as percentages", () => {
    const clip = toClipPath(wedgePolygon([720, 520], 178, 208, 3600), 1440, 900);

    expect(clip.startsWith("polygon(")).toBe(true);
    expect(tokens(clip)).toHaveLength(18); // nine points, x and y
    expect(clip).toContain("%");
    expect(clip).not.toMatch(/\d+px/);
  });
});

describe("lerpPoints", () => {
  const a: Point[] = [
    [0, 0],
    [10, 20],
  ];
  const b: Point[] = [
    [100, 50],
    [30, 40],
  ];

  it("returns the first shape at 0 and the second at 1", () => {
    expect(lerpPoints(a, b, 0)).toEqual(a);
    expect(lerpPoints(a, b, 1)).toEqual(b);
  });

  it("blends point by point at the halfway mark", () => {
    expect(lerpPoints(a, b, 0.5)).toEqual([
      [50, 25],
      [20, 30],
    ]);
  });

  it("clamps outside 0..1 rather than overshooting", () => {
    expect(lerpPoints(a, b, -2)).toEqual(a);
    expect(lerpPoints(a, b, 4)).toEqual(b);
  });
});

describe("fanGeometry", () => {
  it("builds the desktop fan from six wedges in left-to-right order", () => {
    const geo = fanGeometry(DESKTOP.width, DESKTOP.height, "desktop");

    expect(geo.wedges).toHaveLength(6);
    expect(geo.wedges[0].a0).toBeCloseTo(178, 6);
    expect(geo.wedges[5].a1).toBeCloseTo(362, 6);

    const mids = geo.wedges.map((wedge) => wedge.mid);
    expect([...mids].sort((a, b) => a - b)).toEqual(mids);
  });

  it("hands the animation nine pixel points per wedge, and one open shape", () => {
    const geo = fanGeometry(DESKTOP.width, DESKTOP.height, "desktop");

    expect(geo.points).toHaveLength(6);
    geo.points.forEach((points) => expect(points).toHaveLength(9));
    expect(geo.openPoints).toHaveLength(9);
    geo.wedges.forEach((wedge) => expect(tokens(wedge.rest)).toHaveLength(18));
  });

  it("ends an open phone photo at the measured tab bar, not underneath it", () => {
    const tabBarHeight = 57;
    const geo = fanGeometry(PHONE.width, PHONE.height, "phone", {
      insets: { top: 56, bottom: tabBarHeight },
    });
    const x = geo.openPoints.map(([pointX]) => pointX);
    const y = geo.openPoints.map(([, pointY]) => pointY);

    expect(Math.min(...x)).toBe(0);
    expect(Math.max(...x)).toBe(PHONE.width);
    expect(Math.min(...y)).toBe(0);
    expect(Math.max(...y)).toBe(PHONE.height - tabBarHeight);
  });

  it("puts the point where the caller asks on a desktop, and keeps the default otherwise", () => {
    expect(fanGeometry(DESKTOP.width, DESKTOP.height).wedges[0].vp[1]).toBeCloseTo(0.578 * DESKTOP.height, 6);
    expect(fanGeometry(DESKTOP.width, DESKTOP.height, "desktop", { vpY: 500 }).wedges[0].vp[1]).toBe(500);
  });

  it("re-spaces only the hovered wedge's own fan", () => {
    const geo = fanGeometry(PHONE.width, PHONE.height, "phone");
    const rest = restWidths(geo);
    const focused = widthsWithFocus(geo, 0);

    // The bottom fan keeps its widths while the top one re-spaces.
    expect(focused.slice(3)).toEqual(rest.slice(3));
    expect(focused.slice(0, 3)).not.toEqual(rest.slice(0, 3));
  });

  it("gives fanWedgePoints one polygon per width, still nine points each", () => {
    const geo = fanGeometry(DESKTOP.width, DESKTOP.height, "desktop");
    const polygons = fanWedgePoints(geo, 0, fanWidths(6, SPAN, 2));

    expect(polygons).toHaveLength(6);
    polygons.forEach((polygon) => expect(polygon).toHaveLength(9));
  });

  it("normalises the widths it is handed, so a rounding error cannot move the fan", () => {
    const geo = fanGeometry(DESKTOP.width, DESKTOP.height, "desktop");
    const wide = fanWedgePoints(geo, 0, fanWidths(6, SPAN, 1).map((width) => width * 2));
    const exact = fanWedgePoints(geo, 0, fanWidths(6, SPAN, 1));

    expect(wide[1][1][0]).toBeCloseTo(exact[1][1][0], 6);
  });

  it("renders a usable fan for the server's default size", () => {
    const geo = fanGeometry(DEFAULT_HERO_SIZE.width, DEFAULT_HERO_SIZE.height, "desktop");

    expect(geo.wedges).toHaveLength(6);
    geo.wedges.forEach((wedge) => expect(wedge.rest.startsWith("polygon(")).toBe(true));
  });
});

describe("phone layout", () => {
  const geo = fanGeometry(PHONE.width, PHONE.height, "phone");

  it("splits six places into two fans of three", () => {
    expect(geo.wedges).toHaveLength(6);

    const apexes = new Set(geo.wedges.map((wedge) => wedge.vp[1].toFixed(3)));
    expect(apexes.size).toBe(2);
  });

  it("leaves the middle band clear for the headline", () => {
    const [top, bottom] = geo.fans.map((fan) => fan.vp[1]);
    expect(bottom - top).toBeCloseTo(PHONE_BAND * PHONE.height, 6);

    geo.points.slice(0, 3).forEach((points) => {
      // The top fan spreads upward: it never reaches below its own apex.
      const lowest = Math.max(...points.map(([, y]) => y));
      expect(lowest).toBeLessThanOrEqual(top + 0.001);
    });

    geo.points.slice(3).forEach((points) => {
      // The bottom fan spreads downward from the lower apex.
      const highest = Math.min(...points.map(([, y]) => y));
      expect(highest).toBeGreaterThanOrEqual(bottom - 0.001);
    });
  });

  it("keeps the band tall enough for the headline, the hint and one action on a short phone", () => {
    // 375×667 is the smallest phone the two-fan layout is used at (below a 500px
    // hero a landscape phone takes the desktop fan). Eight tenths of that hero
    // is 120px, which is less than the band's own contents: the headline, a line
    // of hint, and the 44px "Book Now" beside it.
    const small = fanGeometry(375, 667, "phone");
    const [top, bottom] = small.fans.map((fan) => fan.vp[1]);
    expect(bottom - top).toBeCloseTo(PHONE_BAND_MIN, 6);
    expect(bottom - top).toBeGreaterThan(120);

    // A tall phone keeps the proportion it was drawn with: the floor only
    // matters where the fraction is too small to hold the band's contents.
    const tall = fanGeometry(390, 844, "phone");
    const [tallTop, tallBottom] = tall.fans.map((fan) => fan.vp[1]);
    expect(tallBottom - tallTop).toBeCloseTo(PHONE_BAND * 844, 6);
  });

  it("mirrors the two fans about the box when nothing covers it", () => {
    const [top, bottom] = geo.fans.map((fan) => fan.vp[1]);

    expect(top).toBeCloseTo(PHONE.height / 2 - (PHONE_BAND * PHONE.height) / 2, 6);
    expect(bottom).toBeCloseTo(PHONE.height / 2 + (PHONE_BAND * PHONE.height) / 2, 6);
  });

  it("mirrors them about what the header and the tab bar leave visible", () => {
    // The hero starts under the sticky header and its foot sits under the tab
    // bar, so centring the pair on the whole box makes the top fan taller by
    // exactly the header's height — which is what the owner saw on a phone.
    const insets = { top: 56, bottom: 57 };
    const covered = fanGeometry(PHONE.width, PHONE.height, "phone", { insets });
    const [top, bottom] = covered.fans.map((fan) => fan.vp[1]);

    const above = top - insets.top;
    const below = PHONE.height - insets.bottom - bottom;
    expect(above).toBeCloseTo(below, 6);
    // And the band between them is centred on that visible strip.
    expect((top + bottom) / 2).toBeCloseTo((insets.top + PHONE.height - insets.bottom) / 2, 6);
  });
});

describe("pointAboveHeadline", () => {
  it("puts the point 16px above the headline", () => {
    expect(pointAboveHeadline(500, 900)).toBe(484);
  });

  it("keeps it in the middle band when the headline is very low", () => {
    // 62% of 900 is 558: a headline at the very bottom can't drag the fan with it.
    expect(pointAboveHeadline(860, 900)).toBeCloseTo(0.62 * 900, 6);
  });

  it("follows the headline even when that puts the point high up", () => {
    // A tall headline on a short screen: it still gets the dark, not the photos.
    expect(pointAboveHeadline(120, 900)).toBe(104);
    expect(pointAboveHeadline(210, 656)).toBe(194);
  });
});

describe("midVector", () => {
  it("points right at 0°, down at 90°, left at 180°", () => {
    expect(midVector(0)[0]).toBeCloseTo(1, 10);
    expect(midVector(90)[1]).toBeCloseTo(1, 10);
    expect(midVector(180)[0]).toBeCloseTo(-1, 10);
  });
});
