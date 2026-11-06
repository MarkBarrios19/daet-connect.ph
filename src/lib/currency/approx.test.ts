import { approxLabel, visitorCurrency } from "./approx";

describe("rough amounts in the visitor's currency (decision 24)", () => {
  it("guesses the currency from the phone's language region", () => {
    expect(visitorCurrency("en-GB", "Europe/London")).toBe("GBP");
    expect(visitorCurrency("ko-KR", "Asia/Seoul")).toBe("KRW");
    expect(visitorCurrency("de-DE", "Europe/Berlin")).toBe("EUR");
  });

  it("shows nothing in the Philippines, even on an en-US phone", () => {
    expect(visitorCurrency("en-US", "Asia/Manila")).toBeNull();
    expect(visitorCurrency("fil-PH", "Asia/Dubai")).toBeNull();
  });

  it("falls back to US dollars when the region is unknown", () => {
    expect(visitorCurrency("en", "Europe/Paris")).toBe("USD");
    expect(visitorCurrency(undefined, undefined)).toBe("USD");
  });

  it("is always marked approx., in whole units for larger amounts", () => {
    expect(approxLabel(1000, 0.0172, "USD", "en-US")).toBe("≈ $17.20 approx.");
    expect(approxLabel(10000, 0.0172, "USD", "en-US")).toBe("≈ $172 approx.");
    expect(approxLabel(1000, 23.5, "KRW", "ko-KR")).toMatch(/^≈ ₩23,500 approx\.$/);
  });
});
