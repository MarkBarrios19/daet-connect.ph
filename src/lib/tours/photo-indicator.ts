/** The arc's own box, in the units its curve is drawn in. */
export const ARC = { width: 420, height: 72, ends: 46, bow: 10 } as const;

/**
 * Which photos get a dot. At most `size` dots show, centred on the current
 * photo and pinned at the ends, so the indicator is the same length with 5
 * photos or 50.
 */
export function dotWindow(index: number, count: number, size: number): { first: number; shown: number } {
  const shown = Math.min(count, size);
  const first = count <= size ? 0 : Math.max(0, Math.min(count - size, index - Math.floor(size / 2)));
  return { first, shown };
}

/** A point on the arc as fractions of its width and height (t runs 0 to 1, left to right). */
export function arcPoint(t: number): { x: number; y: number } {
  const { ends, bow, height } = ARC;
  const y = (1 - t) * (1 - t) * ends + 2 * (1 - t) * t * bow + t * t * ends;
  return { x: t, y: y / height };
}

export type Dot = { k: number; x: number; y: number; inside: boolean; edge: boolean; here: boolean };

/**
 * Every photo keeps its own dot so dots glide sideways when the window shifts.
 * A dot outside the window waits, shrunk to nothing, at the nearest end. The
 * dots at the window's ends shrink (`edge`) when more photos lie beyond them.
 */
export function indicatorDots(index: number, count: number, size: number): Dot[] {
  const { first, shown } = dotWindow(index, count, size);
  return Array.from({ length: count }, (_, k) => {
    const inside = k >= first && k < first + shown;
    const p = Math.max(0, Math.min(shown - 1, k - first));
    const t = shown === 1 ? 0.5 : p / (shown - 1);
    const edge = inside && ((p === 0 && first > 0) || (p === shown - 1 && first + shown < count));
    return { k, ...arcPoint(t), inside, edge, here: k === index };
  });
}
