import { moveItem, swapItems, withDisplayOrder, withStopOrder } from "./edit-order";

/**
 * The server rejects list positions that aren't exactly 1..n
 * ("Image order must be sequential (1, 2, 3...)"), so these helpers are the
 * thing standing between an edited list and a failed save.
 */
describe("list ordering helpers", () => {
  describe("withDisplayOrder", () => {
    it("turns 0-based positions into 1-based ones", () => {
      const items = [{ id: "a", displayOrder: 0 }, { id: "b", displayOrder: 1 }];

      expect(withDisplayOrder(items)).toEqual([
        { id: "a", displayOrder: 1 },
        { id: "b", displayOrder: 2 },
      ]);
    });

    it("closes the gap a deletion leaved behind", () => {
      const items = [{ id: "a", displayOrder: 1 }, { id: "c", displayOrder: 3 }];

      expect(withDisplayOrder(items).map((item) => item.displayOrder)).toEqual([1, 2]);
    });

    it("numbers by list order, not by the incoming values", () => {
      const items = [
        { id: "c", displayOrder: 3 },
        { id: "a", displayOrder: 1 },
        { id: "b", displayOrder: 2 },
      ];

      expect(withDisplayOrder(items)).toEqual([
        { id: "c", displayOrder: 1 },
        { id: "a", displayOrder: 2 },
        { id: "b", displayOrder: 3 },
      ]);
    });

    it("is idempotent, so saving twice can't change the result", () => {
      const items = [{ id: "a", displayOrder: 7 }];
      const once = withDisplayOrder(items);

      expect(withDisplayOrder(once)).toEqual(once);
    });

    it("leaves the input untouched", () => {
      const items = [{ id: "a", displayOrder: 0 }];
      withDisplayOrder(items);

      expect(items[0].displayOrder).toBe(0);
    });

    it("handles an empty list", () => {
      expect(withDisplayOrder([])).toEqual([]);
    });
  });

  describe("moveItem", () => {
    it("moves an item forward", () => {
      expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    });

    it("moves an item backward", () => {
      expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    });

    it("ignores a move that changes nothing", () => {
      const items = ["a", "b"];
      expect(moveItem(items, 1, 1)).toBe(items);
    });

    it("ignores out-of-range positions", () => {
      const items = ["a", "b"];
      expect(moveItem(items, 0, 5)).toBe(items);
      expect(moveItem(items, -1, 0)).toBe(items);
    });

    it("does not mutate the input", () => {
      const items = ["a", "b", "c"];
      moveItem(items, 0, 2);
      expect(items).toEqual(["a", "b", "c"]);
    });
  });

  describe("swapItems", () => {
    it("exchanges two positions and leaves the rest alone", () => {
      expect(swapItems(["a", "b", "c", "d"], 0, 2)).toEqual(["c", "b", "a", "d"]);
    });

    it("works backwards too", () => {
      expect(swapItems(["a", "b", "c"], 2, 0)).toEqual(["c", "b", "a"]);
    });

    it("ignores a swap with itself", () => {
      const items = ["a", "b"];
      expect(swapItems(items, 1, 1)).toBe(items);
    });

    it("ignores out-of-range positions", () => {
      const items = ["a", "b"];
      expect(swapItems(items, 0, 5)).toBe(items);
      expect(swapItems(items, -1, 0)).toBe(items);
    });

    it("does not mutate the input", () => {
      const items = ["a", "b", "c"];
      swapItems(items, 0, 2);
      expect(items).toEqual(["a", "b", "c"]);
    });
  });

  describe("withStopOrder", () => {
    it("numbers stops 1..n", () => {
      const stops = [{ id: "x", stopOrder: 0 }, { id: "y", stopOrder: 0 }];

      expect(withStopOrder(stops).map((stop) => stop.stopOrder)).toEqual([1, 2]);
    });
  });
});
