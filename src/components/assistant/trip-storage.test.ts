/** @jest-environment jsdom */
import { loadTrip, saveTrip, TRIP_KEY } from "./trip-storage";

const trip = { dates: { start: "2026-11-20", end: "2026-11-22" }, travelers: { adults: 2, children: [] }, origin: { city: "Manila" } };

describe("trip details on the phone (decision 34)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps the trip across visits (localStorage, not just the tab)", () => {
    saveTrip(trip);
    expect(localStorage.getItem(TRIP_KEY)).not.toBeNull();
    expect(loadTrip("2026-11-06")).toEqual(trip);
  });

  it("carries over a trip kept by an older visit in the tab", () => {
    sessionStorage.setItem(TRIP_KEY, JSON.stringify(trip));
    expect(loadTrip("2026-11-06")).toEqual(trip);
    expect(JSON.parse(localStorage.getItem(TRIP_KEY)!)).toEqual(trip);
  });

  it("drops dates that have passed, and keeps the rest", () => {
    saveTrip(trip);
    expect(loadTrip("2026-11-30")).toEqual({ travelers: trip.travelers, origin: trip.origin });
  });
});
