/**
 * Trip call-offs (trip planner M5). When the sea or weather makes a trip
 * unsafe, the operator calls it off; the traveller then picks a new date or
 * takes a full refund. A called-off booking stays "confirmed" until they choose.
 */

export type CallOffFields = {
  status: string;
  called_off_at?: string | null;
  called_off_reason?: string | null;
  call_off_resolution?: string | null;
  rescheduled_from?: string | null;
};

export type CallOffState = "none" | "awaiting" | "rescheduled" | "refund_requested";

export function callOffState(b: CallOffFields): CallOffState {
  if (!b.called_off_at) return "none";
  if (b.call_off_resolution === "rescheduled") return "rescheduled";
  if (b.call_off_resolution === "refund_requested") return "refund_requested";
  return b.status === "confirmed" ? "awaiting" : "none";
}

/** Whether the operator may call this booking off today. */
export function canCallOff(b: CallOffFields & { tour_date: string }, today: string): boolean {
  return b.status === "confirmed" && b.tour_date >= today && callOffState(b) !== "awaiting";
}

/** Quick reasons an operator can tap; they can also write their own. */
export const CALL_OFF_REASONS = [
  "Rough sea. The Coast Guard stopped boat trips.",
  "Storm or typhoon warning for the area.",
  "Heavy rain makes the route unsafe.",
  "The boat or vehicle can't run safely.",
] as const;

export function parseCallOffReason(value: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (reason.length < 5 || reason.length > 300) return { ok: false, error: "Tell the traveller why the trip is called off (5 to 300 characters)." };
  return { ok: true, reason };
}

/** The traveller's new date: from tomorrow up to a year ahead, and different from the current one. */
export function checkNewDate(date: unknown, current: string, today: string): { ok: true; date: string } | { ok: false; error: string } {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a new date." };
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 365);
  if (date <= today || date > limit.toISOString().slice(0, 10)) return { ok: false, error: "Pick a date from tomorrow up to a year ahead." };
  if (date === current) return { ok: false, error: "Pick a different date." };
  return { ok: true, date };
}
