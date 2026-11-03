import { mapsPlaceUrl, placeMapsUrl, plainPlaceName } from "./maps";

describe("a place's own Google Maps link", () => {
  it("hands Google a confirmed pin as coordinates", () => {
    const url = placeMapsUrl({
      name: "Bagasbas Beach",
      municipality: "Daet",
      point: { lat: 14.131583, lng: 122.985083 },
      pinConfirmed: true,
    });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=14.131583%2C122.985083");
  });

  it("searches by name while the pin is unconfirmed, so the visitor lands on the place", () => {
    // An approximation from public sources can be a kilometre out, and Google
    // Maps drops its pin exactly where it is told (owner's note, image-93).
    const url = placeMapsUrl({
      name: "Bagasbas Beach",
      municipality: "Daet",
      point: { lat: 14.131583, lng: 122.985083 },
      pinConfirmed: false,
    });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=Bagasbas+Beach%2C+Daet%2C+Camarines+Norte");
  });

  it("keeps each place in its own town", () => {
    expect(placeMapsUrl({ name: "Apuao Grande Island", municipality: "Mercedes" })).toContain(
      "query=Apuao+Grande+Island%2C+Mercedes%2C+Camarines+Norte",
    );
    expect(placeMapsUrl({ name: "Tinaga Island (Calaguas)", municipality: "Vinzons" })).toContain(
      "query=Tinaga+Island%2C+Vinzons%2C+Camarines+Norte",
    );
  });

  it("falls back to Daet only when no town is known at all", () => {
    expect(placeMapsUrl({ name: "Hotel Formosa" })).toBe(mapsPlaceUrl({ name: "Hotel Formosa" }));
    expect(placeMapsUrl({ name: "Hotel Formosa", municipality: "  " })).toContain("query=Hotel+Formosa%2C+Daet%2C+Camarines+Norte");
  });

  it("does not repeat the province when the town already carries it", () => {
    expect(placeMapsUrl({ name: "Bagasbas Beach", municipality: "Daet, Camarines Norte" })).toContain(
      "query=Bagasbas+Beach%2C+Daet%2C+Camarines+Norte",
    );
  });

  it("leaves a name alone when there is no aside to drop", () => {
    expect(plainPlaceName("Bagasbas Beach")).toBe("Bagasbas Beach");
    expect(plainPlaceName("Tinaga Island (Calaguas)")).toBe("Tinaga Island");
    expect(plainPlaceName("(Calaguas)")).toBe("(Calaguas)");
  });

  it("never sends an unconfirmed pin, even one without a town to fall back on", () => {
    const url = placeMapsUrl({ name: "Somewhere", point: { lat: 1, lng: 2 } });
    expect(url).not.toContain("1%2C2");
    expect(url).toContain("Somewhere");
  });
});
