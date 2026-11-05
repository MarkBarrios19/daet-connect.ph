/**
 * Dragging the open photo: pure maths, no DOM.
 *
 * The open place fills the hero, so its photo is drawn with `object-fit: cover`
 * — the image is scaled up until it covers the frame and the rest of it is
 * cropped away. `object-position` says which part of that overflow shows
 * through, and dragging moves it. Because the crop is what moves, the frame can
 * never show a gap: the photo always covers the screen.
 */

/** The middle of the photo: what the open place starts at. */
export const PAN_CENTRE = { x: 50, y: 50 } as const;

export type PanPosition = { x: number; y: number };

/**
 * How much of the photo is drawn outside its frame, in the box's own pixels.
 * A zero on an axis means the photo exactly fits it that way, so there is
 * nothing to pan towards.
 */
export function coverRoom(
  box: { width: number; height: number },
  image: { width: number; height: number },
): { x: number; y: number } {
  if (!box.width || !box.height || !image.width || !image.height) return { x: 0, y: 0 };
  const scale = Math.max(box.width / image.width, box.height / image.height);
  return {
    x: Math.max(0, image.width * scale - box.width),
    y: Math.max(0, image.height * scale - box.height),
  };
}

/**
 * `object-position` after dragging `dx`/`dy` pixels from `start`.
 *
 * Dragging right pulls the photo right, which uncovers what was to its left, so
 * the position moves the other way. An axis with no room stays centred: there
 * is nothing beyond the frame there.
 */
export function panBy(
  start: PanPosition,
  delta: { dx: number; dy: number },
  room: { x: number; y: number },
): PanPosition {
  const along = (value: number, moved: number, span: number, centre: number) =>
    span <= 0 ? centre : Math.min(100, Math.max(0, value - (moved / span) * 100));

  return {
    x: along(start.x, delta.dx, room.x, PAN_CENTRE.x),
    y: along(start.y, delta.dy, room.y, PAN_CENTRE.y),
  };
}

/** The CSS value for a position. */
export const panStyle = (position: PanPosition) => `${position.x.toFixed(2)}% ${position.y.toFixed(2)}%`;

/** How far a pointer may travel and still count as a tap rather than a drag. */
export const DRAG_AFTER = 6;
