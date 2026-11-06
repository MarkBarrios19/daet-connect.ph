import { maskEmail } from "./mask-email";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("jeremiah@gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("nope")).toBeNull();
    expect(maskEmail(null)).toBeNull();
  });
});
