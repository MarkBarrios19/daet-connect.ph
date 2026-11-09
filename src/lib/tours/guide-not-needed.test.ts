import {
  GUIDE_NOT_NEEDED_NOTE_MAX,
  guideCoverage,
  guideCoverageNote,
  guideNotNeededDay,
  parseGuideNotNeededNote,
} from "@/lib/tours/guide-not-needed";

describe("guideCoverage", () => {
  it("reads a guide on the booking as assigned", () => {
    expect(guideCoverage({ assigned_guide_id: "g1", guide_not_needed_at: null })).toBe("assigned");
  });

  it("reads the guest's request as waived when nobody is assigned", () => {
    expect(guideCoverage({ assigned_guide_id: null, guide_not_needed_at: "2026-11-09T02:00:00Z" })).toBe("waived");
  });

  it("reads a booking with neither as unassigned", () => {
    expect(guideCoverage({ assigned_guide_id: null, guide_not_needed_at: null })).toBe("unassigned");
    expect(guideCoverage({})).toBe("unassigned");
  });

  it("treats a guide as winning over a stale flag", () => {
    // The database clears the flag when a guide goes on, so this only happens
    // between a write and its refresh; a named guide is still the truth.
    expect(guideCoverage({ assigned_guide_id: "g1", guide_not_needed_at: "2026-11-09T02:00:00Z" })).toBe("assigned");
  });
});

describe("guideCoverageNote", () => {
  it("says nothing when a guide is leading the tour", () => {
    expect(guideCoverageNote({ assigned_guide_id: "g1" })).toBe("");
  });

  it("distinguishes a forgotten guide from a guest who asked for none", () => {
    expect(guideCoverageNote({ assigned_guide_id: null })).toBe(" · no guide yet");
    expect(guideCoverageNote({ assigned_guide_id: null, guide_not_needed_at: "2026-11-09T02:00:00Z" })).toBe(
      " · no guide, as the guest asked",
    );
  });
});

describe("parseGuideNotNeededNote", () => {
  it("keeps a note, squashed to one line", () => {
    expect(parseGuideNotNeededNote("  Guest asked\n in chat  ")).toEqual({ ok: true, note: "Guest asked in chat" });
  });

  it("treats a blank note as none", () => {
    expect(parseGuideNotNeededNote("   ")).toEqual({ ok: true, note: null });
    expect(parseGuideNotNeededNote(undefined)).toEqual({ ok: true, note: null });
    expect(parseGuideNotNeededNote(42)).toEqual({ ok: true, note: null });
  });

  it("refuses a note over the limit", () => {
    const long = "a".repeat(GUIDE_NOT_NEEDED_NOTE_MAX + 1);
    const result = parseGuideNotNeededNote(long);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/under 300 characters/);
  });

  it("accepts a note exactly at the limit", () => {
    const exact = "a".repeat(GUIDE_NOT_NEEDED_NOTE_MAX);
    expect(parseGuideNotNeededNote(exact)).toEqual({ ok: true, note: exact });
  });
});

describe("guideNotNeededDay", () => {
  it("shows the day in Manila time", () => {
    // 2026-11-08T16:30:00Z is already 9 November in Daet.
    expect(guideNotNeededDay("2026-11-08T16:30:00Z")).toBe("Nov 9");
  });

  it("shows nothing for a timestamp it cannot read", () => {
    expect(guideNotNeededDay("not a date")).toBe("");
  });
});
