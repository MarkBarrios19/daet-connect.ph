/**
 * What the QR verification page shows for a genuine booking ticket, in each
 * of its modes.
 *
 * `mode=verify` is the operator dashboard's scanner: it shows the booking and
 * payment details, and deliberately offers no check-in. The plain page (a
 * guide scanning the tourist's ticket) keeps the existing check-in, which the
 * database function decides on. Keeping the decision here means the rule is
 * testable without rendering the page.
 */
export type TicketMode = "checkin" | "verify";

export function ticketMode(mode: string | string[] | undefined): TicketMode {
  const value = Array.isArray(mode) ? mode[0] : mode;
  return value === "verify" ? "verify" : "checkin";
}

/** True when the page may offer the check-in button for this viewer and booking. */
export function showsCheckIn({ mode, isTourist, ruleOk }: { mode: TicketMode; isTourist: boolean; ruleOk: boolean }): boolean {
  if (mode === "verify") return false;
  if (isTourist) return false;
  return ruleOk;
}

/** The line under the details when the ticket is genuine but there is nothing to check in. */
export function verificationNote({
  mode,
  isTourist,
  ruleOk,
  reason,
}: {
  mode: TicketMode;
  isTourist: boolean;
  ruleOk: boolean;
  reason?: string;
}): string | null {
  if (isTourist) return "Show this QR to your guide on the tour day.";
  if (mode === "verify") {
    return ["The signed booking QR is verified.", ruleOk ? null : reason, "This scanner does not check guests in."].filter(Boolean).join(" ");
  }
  return ruleOk ? null : reason ?? null;
}
