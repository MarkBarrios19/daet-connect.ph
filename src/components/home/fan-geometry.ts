/**
 * The place fan's geometry: pure maths, no React, no DOM.
 *
 * Every shape is nine points — the apex the wedges radiate from, plus eight
 * samples along the outer arc — so any two of them can be blended point by
 * point. Nothing here builds a `clip-path` string except `toClipPath()`: GSAP
 * is never asked to interpolate one, because it reads the numbers inside the
 * string as CSS lengths and mangles anything past ±100%.
 *
 * Points are in pixels for the hero's real box and are written as percentages
 * of that box, so a shape stays correct while the box resizes between frames
 * (or between the server's guess and the first measurement).
 */

export type Point = [number, number];

/** The two arrangements: one fan of six, or two fans of three on a phone. */
export type FanLayout = "desktop" | "phone";

/** How much one wedge widens on hover, as a fraction of the whole span. */
export const HOVER_BUMP = 0.05;

/** Points sampled along each wedge's outer arc; apex + this = 9. */
const ARC_POINTS = 8;

/**
 * The seam between two wedges, in pixels. An angle would widen with distance —
 * thin at the point, tens of pixels at the edge — and the poster's lines are
 * the same weight all the way out.
 */
export const SEAM_PX: Record<FanLayout, number> = { desktop: 16, phone: 8 };

/** Long enough to leave the box from any apex; short enough to keep numbers sane. */
const RADIUS_FACTOR = 1.5;

/** What the server renders before it can measure the hero. */
export const DEFAULT_HERO_SIZE = { width: 1440, height: 900 } as const;

/** The fan's standing point, as a fraction of the hero's height. */
const DEFAULT_VP_Y = 0.578;

/**
 * The clear band between the phone's two fans, as a fraction of the hero's
 * height: wide enough for the headline and its line of hint.
 */
export const PHONE_BAND = 0.18;

/** What covers the hero's top and foot, in pixels, on the box it is drawn in. */
export interface FanInsets {
  /** The sticky header, which the hero sits under. */
  top: number;
  /** The dashboard's tab bar, fixed to the bottom of the screen. */
  bottom: number;
}

const NO_INSETS: FanInsets = { top: 0, bottom: 0 };

const toRad = (degrees: number) => (degrees * Math.PI) / 180;
const toDeg = (radians: number) => (radians * 180) / Math.PI;

/** A unit vector along `degrees`. 0 = right, 90 = down (screen coordinates). */
const unitAt = (degrees: number): Point => [Math.cos(toRad(degrees)), Math.sin(toRad(degrees))];

/** The unit vector 90° on from `degrees`, towards increasing angles. */

const pointAt = (from: Point, direction: Point, distance: number): Point => [
  from[0] + direction[0] * distance,
  from[1] + direction[1] * distance,
];

/**
 * Angular width of each wedge. The focused one gains `bump` of the whole span
 * and the others give up that much between them, so the fan never moves.
 */
export function fanWidths(n: number, span: number, focus: number | null, bump = HOVER_BUMP): number[] {
  const base = span / n;
  if (focus === null || focus < 0 || focus >= n) return Array(n).fill(base);

  const extra = span * bump;
  return Array.from({ length: n }, (_, i) => (i === focus ? base + extra : base - extra / (n - 1)));
}

/**
 * One wedge: the fan's own point, then eight points along the outer arc.
 *
 * The seam between two wedges is a *taper*, not a band of one width: each edge
 * is turned inward by the angle that leaves `gapPx` between neighbours at
 * `taperAt` — the hero's diagonal, so the seam measures `gapPx` where the photos
 * leave the screen — and that gap narrows in proportion to the distance from the
 * point, reaching nothing where all the wedges meet. A constant offset instead
 * leaves a navy hole at the point and a uniform stripe all the way out, which is
 * what the owner marked up on image-2 ("taper this down to 0px").
 */
/**
 * How far the hero's box reaches from a fan's point — the distance at which a
 * seam measures its full `SEAM_PX`, and beyond which nothing can be drawn.
 */
function reachFrom(vp: Point, width: number, height: number): number {
  return Math.max(
    Math.hypot(vp[0], vp[1]),
    Math.hypot(width - vp[0], vp[1]),
    Math.hypot(vp[0], height - vp[1]),
    Math.hypot(width - vp[0], height - vp[1]),
  );
}

export function wedgePolygon(
  vp: Point,
  a0: number,
  a1: number,
  radius: number,
  gapPx: number = SEAM_PX.desktop,
  n = ARC_POINTS,
  taperAt: number = radius,
): Point[] {
  // Half the seam, as the angle it subtends at `taperAt` — in degrees, which is
  // what the angles around it are in.
  const half = (Math.atan2(gapPx / 2, Math.max(taperAt, 1)) * 180) / Math.PI;
  const start = a0 + half;
  const end = a1 - half;

  const samples = Array.from({ length: n }, (_, k) => {
    const angle = start + ((end - start) * k) / (n - 1);
    return pointAt(vp, unitAt(angle), radius);
  });

  return [vp, ...samples];
}

/**
 * The whole box as the same nine points, ordered to match a wedge: apex at the
 * bottom centre, then clockwise from the bottom-left round to the bottom-right.
 * Opening therefore reads as the slice spreading out from its point.
 */
export function rectPolygon(width: number, height: number): Point[] {
  return [
    [width / 2, height],
    [0, height],
    [0, height / 2],
    [0, 0],
    [width / 3, 0],
    [(2 * width) / 3, 0],
    [width, 0],
    [width, height / 2],
    [width, height],
  ];
}

/** The same box, under the name the animation uses when it blends towards it. */
export const rectPoints = rectPolygon;

/** Blend two shapes point by point. Both must have the same number of points. */
export function lerpPoints(a: Point[], b: Point[], t: number): Point[] {
  const eased = Math.min(1, Math.max(0, t));
  return a.map((point, i) => [
    point[0] + (b[i][0] - point[0]) * eased,
    point[1] + (b[i][1] - point[1]) * eased,
  ]);
}

/** Percentages, three decimals — short enough to write every frame, precise enough to avoid seams. */
export function toClipPath(points: Point[], width: number, height: number): string {
  const tokens = points.map(
    ([x, y]) => `${((x / width) * 100).toFixed(3)}% ${((y / height) * 100).toFixed(3)}%`,
  );
  return `polygon(${tokens.join(", ")})`;
}

/** One fan of wedges: where it stands, how far it spreads, and which wedges it owns. */
export interface FanSpan {
  vp: Point;
  a0: number;
  a1: number;
  /** Index of this fan's first wedge in the global order. */
  from: number;
  count: number;
}

export interface Wedge {
  /** The point this wedge radiates from — two fans on a phone have two. */
  vp: Point;
  /** Which fan this wedge belongs to, as an index into `fans`. */
  fan: number;
  /** Rest angles, in screen degrees (0 = right, 90 = down). */
  a0: number;
  a1: number;
  /** Middle of the wedge at rest: where its chip and photo offset go. */
  mid: number;
  /** The clip-path at rest, for the server render. */
  rest: string;
}

export interface FanGeometry {
  width: number;
  height: number;
  layout: FanLayout;
  fans: FanSpan[];
  wedges: Wedge[];
  /** Rest shapes in pixels, in DOM order. */
  points: Point[][];
  /** The shape that fills the hero when a place is open, in pixels. */
  openPoints: Point[];
}

/**
 * One fan of six (desktop, and landscape phones) or two fans of three (phones),
 * placed as the mock-up has them: the top pair spread upward, the bottom ones
 * downward, leaving the middle band for the headline.
 */
export function fansFor(
  layout: FanLayout,
  width: number,
  height: number,
  vpY?: number,
  insets: FanInsets = NO_INSETS,
): FanSpan[] {
  if (layout === "phone") {
    // The two fans mirror each other about the part of the hero a visitor can
    // actually see. Centring them on the whole box instead left the top fan
    // taller than the bottom one by exactly the header's height — the hero
    // starts under the sticky bar — and the tab bar takes as much again off the
    // foot, so the band between them sat low and the headline rode up on it.
    const band = PHONE_BAND * height;
    const centre = (insets.top + (height - insets.bottom)) / 2;
    return [
      { vp: [0.5 * width, centre - band / 2], a0: 188, a1: 352, from: 0, count: 3 },
      { vp: [0.5 * width, centre + band / 2], a0: 8, a1: 172, from: 3, count: 3 },
    ];
  }

  return [{ vp: [0.5 * width, vpY ?? DEFAULT_VP_Y * height], a0: 178, a1: 362, from: 0, count: 6 }];
}

/**
 * Where the fan's point goes, given the top of the headline: just above it, so
 * the headline stands in the dark below the fan rather than on a photo.
 *
 * The headline has the last word. Holding a floor at 45% as well looked safer,
 * but on a short desktop screen the headline block is taller than that — the
 * floor won, the point sank to 45%, and the headline's own first line landed on
 * the photos again. The 62% ceiling stays: a headline that low would otherwise
 * drag the fan down into the buttons.
 */
export function pointAboveHeadline(headlineTop: number, height: number, clearance = 16): number {
  return Math.min(headlineTop - clearance, 0.62 * height);
}

/**
 * The angles of every wedge in `fanIndex`, given one angular width per wedge.
 * The widths are scaled to the fan's span, so the fan neither grows nor drifts
 * when hover widths arrive rounded.
 */
export function fanAngles(fan: FanSpan, widths: number[]): Array<{ a0: number; a1: number }> {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const scale = total > 0 ? (fan.a1 - fan.a0) / total : 1;

  let cursor = fan.a0;
  return widths.map((width) => {
    const span = width * scale;
    const wedge = { a0: cursor, a1: cursor + span };
    cursor += span;
    return wedge;
  });
}

/** Every wedge of one fan, as polygons, for the given angular widths. */
export function fanWedgePoints(geometry: FanGeometry, fanIndex: number, widths: number[]): Point[][] {
  const fan = geometry.fans[fanIndex];
  const gap = SEAM_PX[geometry.layout];
  const far = reachFrom(fan.vp, geometry.width, geometry.height);
  const radius = RADIUS_FACTOR * Math.hypot(geometry.width, geometry.height);

  return fanAngles(fan, widths).map(({ a0, a1 }) =>
    wedgePolygon(fan.vp, a0, a1, radius, gap, ARC_POINTS, far),
  );
}

/**
 * The rest widths of every wedge, in DOM order: how wide each one is when
 * nothing is hovered, in degrees.
 */
export function restWidths(geometry: FanGeometry): number[] {
  return geometry.fans.flatMap((fan) => fanWidths(fan.count, fan.a1 - fan.a0, null));
}

/** The widths of every wedge while `focus` is hovered, or all six at rest for null. */
export function widthsWithFocus(geometry: FanGeometry, focus: number | null): number[] {
  return geometry.fans.flatMap((fan) =>
    fanWidths(fan.count, fan.a1 - fan.a0, focus === null ? null : focus - fan.from),
  );
}

export function fanGeometry(
  width: number,
  height: number,
  layout: FanLayout = "desktop",
  options: { vpY?: number; insets?: FanInsets } = {},
): FanGeometry {
  const fans = fansFor(layout, width, height, options.vpY, options.insets);
  const radius = RADIUS_FACTOR * Math.hypot(width, height);
  const gap = SEAM_PX[layout];

  const far = new Map(fans.map((fan) => [fan, reachFrom(fan.vp, width, height)]));

  const wedges: Wedge[] = fans.flatMap((fan, fanIndex) =>
    fanAngles(fan, fanWidths(fan.count, fan.a1 - fan.a0, null)).map(({ a0, a1 }) => ({
      vp: fan.vp,
      fan: fanIndex,
      a0,
      a1,
      mid: (a0 + a1) / 2,
      rest: toClipPath(wedgePolygon(fan.vp, a0, a1, radius, gap, ARC_POINTS, far.get(fan)), width, height),
    })),
  );

  return {
    width,
    height,
    layout,
    fans,
    wedges,
    points: fans.flatMap((fan, fanIndex) =>
      fanAngles(fan, fanWidths(fan.count, fan.a1 - fan.a0, null)).map(({ a0, a1 }) =>
        wedgePolygon(fan.vp, a0, a1, radius, gap, ARC_POINTS, far.get(fan)),
      ),
    ),
    openPoints: rectPolygon(width, height),
  };
}

/** The unit vector pointing along a wedge's mid angle, for chip and slide offsets. */
export function midVector(midDegrees: number): Point {
  return unitAt(midDegrees);
}

/** Exposed for tests that check a seam's width from the angles it spans. */
export const angleOf = (from: Point, to: Point) => toDeg(Math.atan2(to[1] - from[1], to[0] - from[0]));
