import { extractQrTokenForType } from "@/lib/tours/qr-token-input";

const token = (type: "guide" | "booking") =>
  `CD1.${type}.9b7e5a5e-0000-4000-8000-000000000001.1790000000.${"a".repeat(43)}`;

describe("extractQrTokenForType", () => {
  it("accepts a raw token of the expected type", () => {
    expect(extractQrTokenForType(` ${token("guide")} `, "guide")).toBe(token("guide"));
    expect(extractQrTokenForType(token("booking"), "booking")).toBe(token("booking"));
  });

  it("extracts signed QR tokens from full and relative verify links", () => {
    expect(extractQrTokenForType(`https://daet.example/tours/verify/${token("guide")}`, "guide")).toBe(token("guide"));
    expect(extractQrTokenForType(`/tours/verify/${token("booking")}`, "booking")).toBe(token("booking"));
  });

  it("rejects other QR types and malformed or unrelated content", () => {
    expect(extractQrTokenForType(token("booking"), "guide")).toBeNull();
    expect(extractQrTokenForType(token("guide"), "booking")).toBeNull();
    expect(extractQrTokenForType("hello", "guide")).toBeNull();
    expect(extractQrTokenForType("https://example.com/other", "guide")).toBeNull();
    expect(extractQrTokenForType("CD1.guide.not-a-uuid.12.signature", "guide")).toBeNull();
    expect(extractQrTokenForType(`javascript:/tours/verify/${token("guide")}`, "guide")).toBeNull();
  });
});
