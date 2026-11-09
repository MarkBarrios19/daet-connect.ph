import { showsCheckIn, ticketMode, verificationNote } from "@/app/(subsystems)/tours/verify/[token]/ticket-mode";

describe("ticketMode", () => {
  it("reads the operator scanner's mode from the query, defaulting to check-in", () => {
    expect(ticketMode("verify")).toBe("verify");
    expect(ticketMode(["verify", "other"])).toBe("verify");
    expect(ticketMode(undefined)).toBe("checkin");
    expect(ticketMode("other")).toBe("checkin");
  });
});

describe("showsCheckIn", () => {
  it("never checks guests in from the operator's verification scanner", () => {
    expect(showsCheckIn({ mode: "verify", isTourist: false, ruleOk: true })).toBe(false);
  });

  it("keeps the guide's check-in on the plain ticket page", () => {
    expect(showsCheckIn({ mode: "checkin", isTourist: false, ruleOk: true })).toBe(true);
    expect(showsCheckIn({ mode: "checkin", isTourist: false, ruleOk: false })).toBe(false);
  });

  it("does not offer check-in to the tourist who owns the ticket", () => {
    expect(showsCheckIn({ mode: "checkin", isTourist: true, ruleOk: true })).toBe(false);
  });
});

describe("verificationNote", () => {
  it("says the scanner verified the ticket and did not check anyone in", () => {
    const note = verificationNote({ mode: "verify", isTourist: false, ruleOk: true });
    expect(note).toContain("The signed booking QR is verified.");
    expect(note).toContain("does not check guests in");
  });

  it("still gives the reason a check-in is not open in verification mode", () => {
    const note = verificationNote({ mode: "verify", isTourist: false, ruleOk: false, reason: "Check-in opens on the tour date." });
    expect(note).toContain("Check-in opens on the tour date.");
    expect(note).toContain("does not check guests in");
  });

  it("keeps the tourist's own prompt and the guide's reason unchanged", () => {
    expect(verificationNote({ mode: "checkin", isTourist: true, ruleOk: true })).toBe("Show this QR to your guide on the tour day.");
    expect(verificationNote({ mode: "checkin", isTourist: false, ruleOk: false, reason: "This booking isn't paid in full yet, so it can't be checked in." })).toBe(
      "This booking isn't paid in full yet, so it can't be checked in.",
    );
    expect(verificationNote({ mode: "checkin", isTourist: false, ruleOk: true })).toBeNull();
  });
});
