import { readAccreditationCounts } from "./accreditation";

describe("readAccreditationCounts", () => {
  it("reads the single row a table function returns", () => {
    expect(readAccreditationCounts([{ operators: 4, guides: 11 }])).toEqual({ operators: 4, guides: 11 });
  });

  it("reads an object too, in case the function returns one row", () => {
    expect(readAccreditationCounts({ operators: 0, guides: 1 })).toEqual({ operators: 0, guides: 1 });
  });

  it("accepts numeric strings, which PostgREST may send for integer columns", () => {
    expect(readAccreditationCounts([{ operators: "12", guides: "3" }])).toEqual({ operators: 12, guides: 3 });
  });

  it("says nothing is known when the function is not there yet", () => {
    expect(readAccreditationCounts(null)).toBeNull();
    expect(readAccreditationCounts([])).toBeNull();
    expect(readAccreditationCounts([{ code: "42883", message: "function does not exist" }])).toBeNull();
  });

  it("refuses a negative or unreadable count rather than showing it", () => {
    expect(readAccreditationCounts([{ operators: -1, guides: 2 }])).toBeNull();
    expect(readAccreditationCounts([{ operators: null, guides: 2 }])).toBeNull();
    expect(readAccreditationCounts([{ operators: "many", guides: 2 }])).toBeNull();
  });
});
