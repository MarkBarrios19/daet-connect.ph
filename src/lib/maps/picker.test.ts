import { insideBounds, parsePlaces, roundCoord } from "./picker";

describe("location picker helpers", () => {
  it("accepts Daet and rejects places outside Camarines Norte", () => {
    expect(insideBounds(14.1122, 122.9553)).toBe(true);
    expect(insideBounds(14.5995, 120.9842)).toBe(false);
    expect(insideBounds(Number.NaN, 122.9)).toBe(false);
  });
  it("rounds to six decimals", () => {
    expect(roundCoord(14.11223456789)).toBe(14.112235);
  });
  it("parses search rows and drops malformed or out-of-area ones", () => {
    const rows = [
      { name: "Bagasbas Beach", display_name: "Bagasbas Beach, Daet, Camarines Norte, Philippines", lat: "14.1316", lon: "122.9810" },
      { display_name: "Manila, Philippines", lat: "14.5995", lon: "120.9842" },
      { display_name: "", lat: "14.1", lon: "122.9" },
    ];
    expect(parsePlaces(rows)).toEqual([{ name: "Bagasbas Beach", detail: "Daet, Camarines Norte", lat: 14.1316, lng: 122.981 }]);
    expect(parsePlaces("nope")).toEqual([]);
  });
});
