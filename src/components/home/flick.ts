/**
 * A flick, for stepping between places with the open photo.
 *
 * The sideways drag on the open photo is the "look along it" gesture, so a step
 * cannot simply be any horizontal drag. It is a flick: far enough, flat enough,
 * and over soon enough. Anything slower is the visitor looking around the photo,
 * and stays a pan.
 */
export const FLICK_MIN = 48;
export const FLICK_MS = 260;
export const FLICK_FLATNESS = 1.6;

/** Did this drag end as a flick, and if so which way? -1 is back, 1 is on. */
export function flickStep({ dx, dy, ms }: { dx: number; dy: number; ms: number }): -1 | 0 | 1 {
  if (ms > FLICK_MS) return 0;
  if (Math.abs(dx) < FLICK_MIN) return 0;
  if (Math.abs(dx) < Math.abs(dy) * FLICK_FLATNESS) return 0;
  // A finger moving left pushes the photo away and brings the next place in.
  return dx < 0 ? 1 : -1;
}
