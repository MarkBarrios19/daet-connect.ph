import { fakeSupabase } from "@/lib/tours/assistant/__fixtures__/fake-supabase";
import { bookableForDays, bookHref, dayFor } from "@/lib/tours/itinerary/bookable";
import type { SavedDay } from "@/lib/tours/itinerary/form";

describe("bookHref", () => {
  it("adds the plan day and group only when known", () => {
    expect(bookHref("p1", "2026-11-10", 3)).toBe("/tours/packages/p1/book?date=2026-11-10&pax=3");
    expect(bookHref("p1", "2026-11-10", null)).toBe("/tours/packages/p1/book?date=2026-11-10");
    expect(bookHref("p1", null)).toBe("/tours/packages/p1/book");
  });
});

describe("dayFor", () => {
  const days = [{ date: "2026-11-10", names: ["Daet Park"] }, { date: "2026-11-11", names: ["Bagasbas Beach"] }];
  it("picks the day the tour's places are visited, else the first day", () => {
    expect(dayFor(["Bagasbas Beach"], days)).toBe("2026-11-11");
    expect(dayFor(["Elsewhere"], days)).toBe("2026-11-10");
    expect(dayFor([], [])).toBeNull();
  });
});

describe("bookableForDays", () => {
  it("finds tours near a saved plan's stops, dated to their day", async () => {
    const supabase = fakeSupabase({
      tours_packages: [
        {
          id: "pkg1", title: "Surf Lesson", cover_image_url: null, status: "published",
          tours_package_stops: [{ location_name: "Bagasbas", latitude: "14.1317", longitude: "122.9850" }],
          tours_package_price_variants: [{ price_per_pax: 800, flat_price: null, is_default: true }],
          tours_package_inclusions: [], tours_operators: { business_name: "Coast Tours", accreditation_status: "approved" },
        },
      ],
    });
    const visit = (name: string, lat: number, lng: number) => ({ kind: "visit" as const, name, start: 480, end: 540, travelMinutes: 0, tip: null, lat, lng, slug: null });
    const days: SavedDay[] = [
      { dayNumber: 1, date: "2026-11-10", items: [visit("Daet Park", 14.115, 122.957)] },
      { dayNumber: 2, date: "2026-11-11", items: [visit("Bagasbas Beach", 14.1316, 122.9851)] },
    ];
    const tours = await bookableForDays(supabase, days);
    expect(tours).toEqual([expect.objectContaining({ id: "pkg1", date: "2026-11-11", verified: true, matched: ["Bagasbas Beach"] })]);
  });
});
