import { cheapestPrice, durationLabel, fromPrice, matchPlacePhoto, nextOpenDate, placePhoto, shortDay, tripLength } from "@/lib/tours/trip-board";

describe("trip board", () => {
  it("groups tours by the time they take", () => {
    expect(tripLength(3, "hours")).toBe("half");
    expect(tripLength(6, "hours")).toBe("half");
    expect(tripLength(10, "hours")).toBe("day");
    expect(tripLength(1, "days")).toBe("day");
    expect(tripLength(2, "days")).toBe("two");
    expect(tripLength(30, "hours")).toBe("two");
    expect(durationLabel(1, "days")).toBe("1 day");
    expect(durationLabel(3, "hours")).toBe("3 hours");
  });

  it("finds the price to show", () => {
    expect(fromPrice([{ price_per_pax: 800, flat_price: null, is_default: true }])).toEqual({ amount: 800, perPerson: true });
    expect(fromPrice([{ price_per_pax: null, flat_price: "5000", is_default: false }])).toEqual({ amount: 5000, perPerson: false });
    expect(fromPrice([{ price_per_pax: 900, flat_price: null }, { price_per_pax: 700, flat_price: null }])).toEqual({ amount: 700, perPerson: true });
    expect(fromPrice([])).toBeNull();
  });

  it("finds the cheapest of every price variant, for a \"from\" price", () => {
    expect(
      cheapestPrice([
        { price_per_pax: 4200, flat_price: null },
        { price_per_pax: 3799, flat_price: null },
        { price_per_pax: 5100, flat_price: null },
      ]),
    ).toEqual({ price: 3799, perPerson: true });

    // A flat price is the whole trip, not one seat: when the flat one is the
    // cheapest, the card must not say "per person".
    expect(cheapestPrice([{ price_per_pax: null, flat_price: "800" }, { price_per_pax: 900, flat_price: null }])).toEqual({
      price: 800,
      perPerson: false,
    });

    // A variant with both uses the per-person figure, as fromPrice() does.
    expect(cheapestPrice([{ price_per_pax: 900, flat_price: "5000" }])).toEqual({ price: 900, perPerson: true });

    // Numbers arrive as strings from PostgREST.
    expect(cheapestPrice([{ price_per_pax: "1500", flat_price: null }])).toEqual({ price: 1500, perPerson: true });
  });

  it("has no price to show when none was set, or none is greater than zero", () => {
    expect(cheapestPrice(null)).toBeNull();
    expect(cheapestPrice([])).toBeNull();
    expect(cheapestPrice([{ price_per_pax: 0, flat_price: 0 }])).toBeNull();
    expect(cheapestPrice([{ price_per_pax: null, flat_price: null }])).toBeNull();
  });

  it("finds the next date with a seat left", () => {
    const slots = [
      { available_date: "2026-10-28", capacity_total: 10, capacity_booked: 0 },
      { available_date: "2026-11-07", capacity_total: 6, capacity_booked: 6 },
      { available_date: "2026-11-08", capacity_total: 6, capacity_booked: 2 },
    ];
    expect(nextOpenDate(slots, "2026-10-29")).toBe("2026-11-08");
    expect(nextOpenDate([], "2026-10-29")).toBeNull();
    expect(shortDay("2026-11-08")).toMatch(/Sun.*Nov.*8/);
  });

  it("picks a photo of the place", () => {
    expect(placePhoto("Calaguas Island Day Trip")).toBe("calaguasBeach");
    expect(placePhoto(null, "Mercedes")).toBe("apuao");
    expect(placePhoto("Daet Heritage Walk")).toBe("rizal");
    expect(placePhoto("Somewhere")).toBe("bagasbas");
    expect(matchPlacePhoto("Somewhere")).toBeNull();
    // A place never gets a photo of somewhere else.
    expect(matchPlacePhoto("Daet Heritage Center and Museum")).toBeNull();
    expect(matchPlacePhoto("Canimog Island")).toBeNull();
    expect(matchPlacePhoto("First José Rizal Monument")).toBe("rizal");
  });
});
