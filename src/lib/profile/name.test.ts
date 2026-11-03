import { displayName, FALLBACK_NAME, initials } from "./name";

describe("displayName", () => {
  it("prefers the profile row, then the sign-up metadata, then the address", () => {
    expect(displayName({ profileName: "Juan Dela Cruz", metaName: "JD", email: "juan@example.ph" })).toBe(
      "Juan Dela Cruz",
    );
    expect(displayName({ profileName: null, metaName: "Juan Dela Cruz", email: "juan@example.ph" })).toBe(
      "Juan Dela Cruz",
    );
    expect(displayName({ profileName: "  ", metaName: "", email: "juan.dc@example.ph" })).toBe("juan.dc");
  });

  it("ignores anything that is not a usable name", () => {
    // The header used to fall through to the whole address; a local part is
    // shorter and says the same thing.
    expect(displayName({ profileName: 42 as unknown as string, email: "maria@example.ph" })).toBe("maria");
    expect(displayName({})).toBe(FALLBACK_NAME);
    expect(displayName({ profileName: "\u00a0\t " })).toBe(FALLBACK_NAME);
  });

  it("collapses the whitespace a paste leaves behind", () => {
    expect(displayName({ profileName: "  Juan   Dela\tCruz " })).toBe("Juan Dela Cruz");
  });
});

describe("initials", () => {
  it("keeps one letter, upper-cased", () => {
    expect(initials("juan dela cruz")).toBe("J");
    expect(initials("  Ñina")).toBe("Ñ");
    expect(initials("3rd Street Tours")).toBe("3");
  });

  it("skips what cannot be drawn", () => {
    expect(initials("🙂 Ana")).toBe("A");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
