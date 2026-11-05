/**
 * List positions in the package editor are 1-based and must be exactly
 * sequential — the server rejects anything else ("Image order must be
 * sequential (1, 2, 3...)"). The UI used to hand out array indexes (0-based)
 * for new items and after reorders, and left gaps when an item was deleted,
 * which made every save fail once a list had been edited.
 *
 * Every list mutation runs through these helpers, so the invariant holds by
 * construction instead of by care.
 */

/** Gallery images and inclusions use `displayOrder`. */
export function withDisplayOrder<T>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, displayOrder: index + 1 }));
}

/** Trip stops use `stopOrder`. */
export function withStopOrder<T>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, stopOrder: index + 1 }));
}

/** Moves one item to another position. Out-of-range or no-op moves are ignored. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Exchanges two items' positions, leaving everything between them alone. */
export function swapItems<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;

  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
