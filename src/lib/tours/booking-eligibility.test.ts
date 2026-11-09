import { canStartBooking } from "@/lib/tours/booking-eligibility";

describe("canStartBooking", () => {
  it("lets a visitor start the flow, because signing in is part of it", () => {
    expect(canStartBooking({ user: null, role: null, error: null })).toBe(true);
  });

  it("lets only a verified tourist start the flow", () => {
    expect(canStartBooking({ user: { id: "tourist-1" }, role: "tourist", error: null })).toBe(true);
    for (const role of ["admin", "operator", "guide", null]) {
      expect(canStartBooking({ user: { id: "staff-1" }, role, error: null })).toBe(false);
    }
  });

  it("fails closed when the role lookup failed", () => {
    expect(
      canStartBooking({
        user: { id: "user-1" },
        role: "tourist",
        error: "Your account role could not be verified. Please try again later.",
      }),
    ).toBe(false);
  });
});
