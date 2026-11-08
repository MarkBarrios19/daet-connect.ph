import { formatPeso } from "@/lib/money";
import { ledgerMethodLabel } from "@/lib/tours/ledger";

/**
 * The operator's bookings board: how a booking reads at a glance.
 *
 * A booking's own status is what the lifecycle wrote (booking-lifecycle.ts).
 * On the board one more state is derived: **refunded**. A declined or
 * cancelled booking whose money has all been returned is a refunded one, so
 * the Refunded chip and the Declined chip never count the same booking twice
 * (the chips add up to All, as the design shows).
 */

export type BoardStatus = "pending" | "confirmed" | "completed" | "declined" | "refunded";

export const BOARD_STATUSES = ["all", "pending", "confirmed", "completed", "declined", "refunded"] as const;
export type BoardFilter = (typeof BOARD_STATUSES)[number];

export const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  pending: "To confirm",
  confirmed: "Confirmed",
  completed: "Completed",
  declined: "Declined",
  refunded: "Refunded",
};

export const BOARD_FILTER_LABELS: Record<BoardFilter, string> = {
  all: "All",
  ...BOARD_STATUS_LABELS,
};

/** The chip values that are not a status of their own, mapped back for old links. */
const LEGACY_FILTERS: Record<string, BoardFilter> = {
  rejected: "declined",
  cancelled: "declined",
  "to-confirm": "pending",
};

export function parseBoardFilter(value: unknown): BoardFilter {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((BOARD_STATUSES as readonly string[]).includes(raw)) return raw as BoardFilter;
  return LEGACY_FILTERS[raw] ?? "all";
}

/** The slice of a booking the board reads. */
export type BoardBooking = {
  id: string;
  status: string;
  total_amount: number | string;
  total_paid: number | string | null;
};

/** A refund row from the payments ledger. */
export type BoardRefund = {
  booking_id: string;
  amount: number | string;
  payment_method: string;
  provider: string | null;
  provider_method: string | null;
  reference_number: string | null;
  payment_status: string;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function refundedTotal(refunds: BoardRefund[]): number {
  return round2(refunds.reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
}

/**
 * What the board calls this booking. Money fully returned wins over the
 * lifecycle status, because that is the news the operator is looking for.
 */
export function boardStatus(booking: BoardBooking, refunds: BoardRefund[] = []): BoardStatus {
  const paid = Number(booking.total_paid ?? 0);
  const refunded = refundedTotal(refunds);
  if (paid > 0 && refunded >= round2(paid) - 0.005) return "refunded";
  switch (booking.status) {
    case "pending":
      return "pending";
    case "confirmed":
      return "confirmed";
    case "completed":
      return "completed";
    default:
      // rejected and cancelled: closed without the tour happening.
      return "declined";
  }
}

export type BoardCounts = Record<BoardFilter, number>;

/** Chip counts. Each booking lands in exactly one chip, so they add up to All. */
export function boardCounts(
  bookings: BoardBooking[],
  refundsByBooking: Map<string, BoardRefund[]> = new Map(),
): BoardCounts {
  const counts: BoardCounts = { all: bookings.length, pending: 0, confirmed: 0, completed: 0, declined: 0, refunded: 0 };
  for (const booking of bookings) counts[boardStatus(booking, refundsByBooking.get(booking.id) ?? [])] += 1;
  return counts;
}

export function matchesBoardFilter(status: BoardStatus, filter: BoardFilter): boolean {
  return filter === "all" || status === filter;
}

/** The "Refunded via PayMongo" / "₱500.00 of ₱1,398.00 paid" line under the total. */
export type PaymentNote = {
  text: string;
  tone: "neutral" | "warning" | "success" | "refund";
};

export function paymentNote({
  totalAmount,
  totalPaid,
  pendingProofs = 0,
  refunds = [],
}: {
  totalAmount: number | string;
  totalPaid: number | string | null;
  pendingProofs?: number;
  refunds?: BoardRefund[];
}): PaymentNote {
  const total = Number(totalAmount ?? 0);
  const paid = Number(totalPaid ?? 0);
  const last = refunds.length ? refunds[refunds.length - 1] : null;
  const refunded = refundedTotal(refunds);

  // A receipt waiting to be checked is the next thing to do, so it leads;
  // a refund already sent is the news that stays.
  if (pendingProofs > 0 && refunded <= 0) return { text: "Pending verification", tone: "warning" };
  if (last && refunded > 0) {
    // An automatic refund is PayMongo's; a manual one names the wallet or bank.
    const via = last.provider === "paymongo" ? "PayMongo" : ledgerMethodLabel(last);
    const reference = last.reference_number?.trim();
    return { text: `Refunded via ${via}${reference ? ` (Ref: ${reference})` : ""}`, tone: "refund" };
  }
  if (pendingProofs > 0) return { text: "Pending verification", tone: "warning" };
  if (total > 0 && paid >= total) return { text: `${formatPeso(paid)} paid in full`, tone: "success" };
  if (paid > 0) return { text: `${formatPeso(paid)} of ${formatPeso(total)} paid`, tone: "warning" };
  return { text: "Nothing paid yet", tone: "neutral" };
}

/** The guide's name for the detail panel; falls back so a deleted guide never blanks it. */
export function guideName(guides: Array<{ id: string; full_name: string }>, id: string | null): string | null {
  if (!id) return null;
  return guides.find((guide) => guide.id === id)?.full_name ?? "A guide";
}

/** "Bianca Zabala (Surfing & Coastal Specialist)" for the assign picker. */
export function guideOptionLabel(guide: { full_name: string; specialties?: string[] | null }): string {
  const specialties = (guide.specialties ?? []).filter(Boolean).join(", ");
  return specialties ? `${guide.full_name} (${specialties})` : guide.full_name;
}

export type CapacityCheck = {
  /** True when the date has room for the group (or the tour has no calendar). */
  ok: boolean;
  checked: boolean;
  /** e.g. "Daily capacity check verified: sufficient slots available for 2026-11-15." */
  text: string;
};

/**
 * What the Approve dialog says about the day. A package with no open dates
 * takes any date (legacy mode), so there is nothing to check; with a calendar,
 * the seats left on that date are what matters.
 */
export function capacityCheck({
  tourDate,
  pax,
  capacity,
}: {
  tourDate: string;
  pax: number;
  capacity: { capacity_total: number; capacity_booked: number } | null;
}): CapacityCheck {
  if (!capacity) {
    return { ok: true, checked: false, text: "This tour has no daily limit, so any date can be confirmed." };
  }
  const left = Math.max(0, capacity.capacity_total - capacity.capacity_booked);
  if (left < pax) {
    return {
      ok: false,
      checked: true,
      text:
        left <= 0
          ? `This date is fully booked on ${tourDate}. Open more seats before confirming.`
          : `Only ${left} seat${left === 1 ? "" : "s"} left on ${tourDate} for a group of ${pax}.`,
    };
  }
  return { ok: true, checked: true, text: `Daily capacity check verified: sufficient slots available for ${tourDate}.` };
}

export type BoardPage<T> = {
  rows: T[];
  /** 1-based page actually shown (a page past the end lands on the last one). */
  page: number;
  pageCount: number;
  /** 1-based index of the first row on this page, for "Showing page 2 of 6". */
  first: number;
};

/** Slices the filtered list; a page past the end lands on the last one. */
export function paginate<T>(rows: T[], requested: number, pageSize: number): BoardPage<T> {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(Math.max(1, Math.trunc(requested) || 1), pageCount);
  const start = (page - 1) * size;
  return { rows: rows.slice(start, start + size), page, pageCount, first: rows.length ? start + 1 : 0 };
}

/** Page numbers to draw: every page when few, else the ends and the neighbours of this one. */
export function pageNumbers(page: number, pageCount: number, span = 1): Array<number | "gap"> {
  const wanted = new Set<number>([1, pageCount]);
  for (let n = page - span; n <= page + span; n += 1) if (n >= 1 && n <= pageCount) wanted.add(n);
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) out.push("gap");
    out.push(value);
  });
  return out;
}

/** Builds a board URL, keeping the filters that are still set. */
export function boardUrl(
  base: string,
  current: { status?: BoardFilter; q?: string; packageId?: string; date?: string; page?: number },
  patch: { status?: BoardFilter; q?: string; packageId?: string; date?: string; page?: number } = {},
): string {
  const next = { ...current, ...patch };
  const values = new URLSearchParams();
  if (next.status && next.status !== "all") values.set("status", next.status);
  if (next.q) values.set("q", next.q);
  if (next.packageId) values.set("package", next.packageId);
  if (next.date) values.set("date", next.date);
  if (next.page && next.page > 1) values.set("page", String(next.page));
  const query = values.toString();
  return query ? `${base}?${query}` : base;
}

/** A whole-Peso amount for ids and aria labels, never a float artefact. */
export function roundedAmount(value: number | string | null | undefined): number {
  return round2(Number(value ?? 0));
}
