/**
 * A booking that goes ahead without a guide.
 *
 * The guest asks (usually in chat — "di namin kailangan ng tour guide") and the
 * operator records it on the booking. Without that record, a cleared guide
 * looks the same as one the operator forgot to pick: the board, the dashboard
 * and the live page all keep saying "no guide yet".
 *
 * The rule lives here so every screen reads the same two columns the same way:
 * `assigned_guide_id` and `guide_not_needed_at` (migration
 * 20261201_guide_not_needed.sql). The database clears the flag whenever a guide
 * is put back on the booking, so the two can never disagree.
 */

export const GUIDE_NOT_NEEDED_NOTE_MAX = 300;

/** Who, if anyone, is leading a booking. */
export type GuideCoverage = "assigned" | "waived" | "unassigned";

export type GuideBookingFields = {
  assigned_guide_id?: string | null;
  guide_not_needed_at?: string | null;
};

/**
 * assigned: a guide is leading it.
 * waived:   the guest asked for no guide, so none is expected.
 * unassigned: nobody yet, and nobody has said none is needed.
 */
export function guideCoverage(booking: GuideBookingFields): GuideCoverage {
  if (booking.assigned_guide_id) return "assigned";
  if (booking.guide_not_needed_at) return "waived";
  return "unassigned";
}

/** The short line an operator's booking lists end with, or "" when a guide is leading. */
export function guideCoverageNote(booking: GuideBookingFields): string {
  const coverage = guideCoverage(booking);
  if (coverage === "assigned") return "";
  if (coverage === "waived") return " · no guide, as the guest asked";
  return " · no guide yet";
}

/**
 * What the operator typed with the request. Empty means nothing to show; over
 * the limit is refused before the round trip, the same as the database's check.
 */
export function parseGuideNotNeededNote(raw: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  const note = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!note) return { ok: true, note: null };
  if (note.length > GUIDE_NOT_NEEDED_NOTE_MAX) {
    return { ok: false, error: `Keep the note under ${GUIDE_NOT_NEEDED_NOTE_MAX} characters.` };
  }
  return { ok: true, note };
}

/** "Mar 4" for a timestamp, so the board can say when the guest asked. */
export function guideNotNeededDay(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

/**
 * True when the database has not had migration 20261201_guide_not_needed.sql
 * applied yet. PostgREST answers a read with `42703` ("column
 * tours_bookings.guide_not_needed_at does not exist") and a write with
 * `PGRST204` ("could not find the '…' column … in the schema cache").
 *
 * Code and database deploy separately here — SQL is run by hand — so the
 * feature must be able to be absent without taking a page down with it.
 */
export function isMissingGuideNotNeededColumn(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  // PostgREST names the column it could not find, so that is the surest sign.
  if (/guide_not_needed_(at|note)/.test(message)) return true;
  // Unknown-column / "not in the schema cache", with no message to read: the
  // only optional columns these queries name are the two above.
  const code = String(error.code ?? "");
  return (code === "42703" || code === "PGRST204") && message.trim() === "";
}
