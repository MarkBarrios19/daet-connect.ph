import {
  boardCounts,
  boardStatus,
  boardUrl,
  capacityCheck,
  guideOptionLabel,
  matchesBoardFilter,
  pageNumbers,
  paginate,
  parseBoardFilter,
  paymentNote,
  refundedTotal,
} from "./booking-board";

const booking = (over: Partial<{ id: string; status: string; total_amount: number; total_paid: number }> = {}) => ({
  id: "b1",
  status: "confirmed",
  total_amount: 1398,
  total_paid: 1398,
  ...over,
});

const refund = (
  amount: number,
  over: Partial<{ provider: string; provider_method: string | null; payment_method: string; reference_number: string }> = {},
) => ({
  booking_id: "b1",
  amount,
  payment_method: "gcash",
  provider: "paymongo",
  provider_method: "gcash",
  reference_number: "ref_abc123",
  payment_status: "refunded",
  ...over,
});

describe("parseBoardFilter", () => {
  it("keeps every chip value", () => {
    for (const value of ["all", "pending", "confirmed", "completed", "declined", "refunded"]) {
      expect(parseBoardFilter(value)).toBe(value);
    }
  });

  it("maps old and lifecycle links onto a chip", () => {
    expect(parseBoardFilter("rejected")).toBe("declined");
    expect(parseBoardFilter("cancelled")).toBe("declined");
    expect(parseBoardFilter("to-confirm")).toBe("pending");
    expect(parseBoardFilter("Confirmed")).toBe("confirmed");
  });

  it("falls back to All for anything else", () => {
    expect(parseBoardFilter(undefined)).toBe("all");
    expect(parseBoardFilter("")).toBe("all");
    expect(parseBoardFilter("nonsense")).toBe("all");
  });
});

describe("boardStatus", () => {
  it("reads the lifecycle status for a live booking", () => {
    expect(boardStatus(booking({ status: "pending", total_paid: 0 }))).toBe("pending");
    expect(boardStatus(booking({ status: "confirmed" }))).toBe("confirmed");
    expect(boardStatus(booking({ status: "completed" }))).toBe("completed");
  });

  it("calls a closed booking declined while money is still out", () => {
    expect(boardStatus(booking({ status: "rejected", total_paid: 1398 }), [refund(500)])).toBe("declined");
    expect(boardStatus(booking({ status: "cancelled", total_paid: 0 }))).toBe("declined");
  });

  it("calls it refunded once everything paid has come back", () => {
    expect(boardStatus(booking({ status: "cancelled" }), [refund(1398)])).toBe("refunded");
    // Two instalments: the sum is what counts, not one row.
    expect(boardStatus(booking({ status: "rejected" }), [refund(700), refund(698)])).toBe("refunded");
  });

  it("never says refunded when nothing was paid", () => {
    expect(boardStatus(booking({ status: "rejected", total_paid: 0 }), [])).toBe("declined");
    expect(boardStatus(booking({ status: "completed", total_paid: 0 }), [])).toBe("completed");
  });
});

describe("refundedTotal", () => {
  it("adds the rows and rounds to centavos", () => {
    expect(refundedTotal([refund(699.99), refund(698.01)])).toBe(1398);
    expect(refundedTotal([])).toBe(0);
  });
});

describe("boardCounts", () => {
  it("puts each booking in exactly one chip, so the chips add up to All", () => {
    const bookings = [
      booking({ id: "p1", status: "pending", total_paid: 0 }),
      booking({ id: "c1", status: "confirmed" }),
      booking({ id: "d1", status: "completed" }),
      booking({ id: "x1", status: "cancelled" }),
      booking({ id: "r1", status: "cancelled" }),
      booking({ id: "r2", status: "rejected" }),
    ];
    const refunds = new Map([
      ["r1", [refund(1398)]],
      ["r2", [refund(1398)]],
    ]);
    const counts = boardCounts(bookings, refunds);
    expect(counts).toEqual({ all: 6, pending: 1, confirmed: 1, completed: 1, declined: 1, refunded: 2 });
    const sum =
      counts.pending + counts.confirmed + counts.completed + counts.declined + counts.refunded;
    expect(sum).toBe(counts.all);
  });

  it("counts an empty board as zeros", () => {
    expect(boardCounts([])).toEqual({ all: 0, pending: 0, confirmed: 0, completed: 0, declined: 0, refunded: 0 });
  });
});

describe("matchesBoardFilter", () => {
  it("lets All through and matches the rest", () => {
    expect(matchesBoardFilter("pending", "all")).toBe(true);
    expect(matchesBoardFilter("refunded", "refunded")).toBe(true);
    expect(matchesBoardFilter("refunded", "declined")).toBe(false);
  });
});

describe("paymentNote", () => {
  it("names PayMongo and its refund reference", () => {
    const note = paymentNote({ totalAmount: 1398, totalPaid: 1398, refunds: [refund(1398)] });
    expect(note).toEqual({ text: "Refunded via PayMongo (Ref: ref_abc123)", tone: "refund" });
  });

  it("names the wallet for a manual refund", () => {
    const note = paymentNote({
      totalAmount: 1398,
      totalPaid: 1398,
      refunds: [refund(1398, { provider: "manual", provider_method: null, payment_method: "gcash", reference_number: "GC-1" })],
    });
    expect(note.text).toBe("Refunded via GCash (Ref: GC-1)");
    expect(note.tone).toBe("refund");
  });

  it("says what is still owed", () => {
    expect(paymentNote({ totalAmount: 1398, totalPaid: 1398 })).toEqual({ text: "₱1,398.00 paid in full", tone: "success" });
    expect(paymentNote({ totalAmount: 1398, totalPaid: 500 })).toEqual({
      text: "₱500.00 of ₱1,398.00 paid",
      tone: "warning",
    });
    expect(paymentNote({ totalAmount: 1398, totalPaid: 0 })).toEqual({ text: "Nothing paid yet", tone: "neutral" });
  });

  it("keeps the refund as the payment line when a receipt is also waiting", () => {
    const note = paymentNote({ totalAmount: 1398, totalPaid: 1398, pendingProofs: 1, refunds: [refund(1398)] });
    expect(note.tone).toBe("refund");
    expect(note.text).toContain("Refunded via PayMongo");
  });

  it("flags receipts waiting to be verified", () => {
    expect(paymentNote({ totalAmount: 1398, totalPaid: 0, pendingProofs: 1 })).toEqual({
      text: "Pending verification",
      tone: "warning",
    });
  });
});

describe("guideOptionLabel", () => {
  it("shows the specialties in brackets", () => {
    expect(guideOptionLabel({ full_name: "Bianca Zabala", specialties: ["Surfing & Coastal Specialist"] })).toBe(
      "Bianca Zabala (Surfing & Coastal Specialist)",
    );
    expect(guideOptionLabel({ full_name: "Bianca Zabala", specialties: [] })).toBe("Bianca Zabala");
    expect(guideOptionLabel({ full_name: "Bianca Zabala" })).toBe("Bianca Zabala");
  });
});

describe("capacityCheck", () => {
  it("passes when the day has room", () => {
    const check = capacityCheck({
      tourDate: "2026-11-15",
      pax: 4,
      capacity: { capacity_total: 12, capacity_booked: 6 },
    });
    expect(check.ok).toBe(true);
    expect(check.checked).toBe(true);
    expect(check.text).toBe("Daily capacity check verified: sufficient slots available for 2026-11-15.");
  });

  it("fails when the group does not fit", () => {
    const almost = capacityCheck({ tourDate: "2026-11-15", pax: 4, capacity: { capacity_total: 12, capacity_booked: 10 } });
    expect(almost.ok).toBe(false);
    expect(almost.text).toBe("Only 2 seats left on 2026-11-15 for a group of 4.");

    const full = capacityCheck({ tourDate: "2026-11-15", pax: 2, capacity: { capacity_total: 12, capacity_booked: 12 } });
    expect(full.ok).toBe(false);
    expect(full.text).toBe("This date is fully booked on 2026-11-15. Open more seats before confirming.");
  });

  it("acknowledges a tour with no calendar", () => {
    const check = capacityCheck({ tourDate: "2026-11-15", pax: 4, capacity: null });
    expect(check.ok).toBe(true);
    expect(check.checked).toBe(false);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ id: i + 1 }));

  it("slices the page and reports where it starts", () => {
    const page = paginate(rows, 1, 10);
    expect(page.rows).toHaveLength(10);
    expect(page.rows[0]).toEqual({ id: 1 });
    expect(page.pageCount).toBe(3);
    expect(page.first).toBe(1);

    const last = paginate(rows, 3, 10);
    expect(last.rows).toHaveLength(3);
    expect(last.rows[0]).toEqual({ id: 21 });
    expect(last.first).toBe(21);
  });

  it("lands a page past the end on the last one", () => {
    const page = paginate(rows, 99, 10);
    expect(page.page).toBe(3);
    expect(page.first).toBe(21);
  });

  it("treats a nonsense page as the first and always has at least one page", () => {
    expect(paginate(rows, 0, 10).page).toBe(1);
    expect(paginate([], 5, 10)).toEqual({ rows: [], page: 1, pageCount: 1, first: 0 });
  });
});

describe("pageNumbers", () => {
  it("lists every page when few", () => {
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
  });

  it("collapses the middle when many", () => {
    expect(pageNumbers(1, 9)).toEqual([1, 2, "gap", 9]);
    expect(pageNumbers(5, 9)).toEqual([1, "gap", 4, 5, 6, "gap", 9]);
    expect(pageNumbers(9, 9)).toEqual([1, "gap", 8, 9]);
  });
});

describe("boardUrl", () => {
  it("keeps the filters, dropping defaults", () => {
    expect(boardUrl("/tours/operator/bookings", { status: "all", q: "", page: 1 })).toBe("/tours/operator/bookings");
    expect(
      boardUrl(
        "/tours/operator/bookings",
        { status: "pending", q: "bianca", packageId: "pkg-1", date: "2026-11-15", page: 2 },
        { page: 1 },
      ),
    ).toBe("/tours/operator/bookings?status=pending&q=bianca&package=pkg-1&date=2026-11-15");
  });

  it("switches the chip without losing the search", () => {
    expect(
      boardUrl("/tours/operator/bookings", { status: "all", q: "bianca" }, { status: "refunded" }),
    ).toBe("/tours/operator/bookings?status=refunded&q=bianca");
  });
});
