/**
 * How many operators and guides the Tourism Office has accredited.
 *
 * The numbers come from `tours_accreditation_counts()` (a security-definer
 * function, since anonymous readers cannot select those two tables). PostgREST
 * hands a single-row table function back as an array of one row; anything that
 * does not look like two counts is treated as "not known", and the page says so
 * instead of showing a made-up number.
 */
export type AccreditationCounts = { operators: number; guides: number };

function toCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

export function readAccreditationCounts(rows: unknown): AccreditationCounts | null {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== "object") return null;

  const { operators, guides } = row as { operators?: unknown; guides?: unknown };
  const operatorCount = toCount(operators);
  const guideCount = toCount(guides);

  if (operatorCount === null || guideCount === null) return null;
  return { operators: operatorCount, guides: guideCount };
}
