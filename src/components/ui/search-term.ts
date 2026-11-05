/** The search text, trimmed and stripped of the characters PostgREST filters treat as syntax. */
export function searchTerm(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[%_,()*\\:."']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
