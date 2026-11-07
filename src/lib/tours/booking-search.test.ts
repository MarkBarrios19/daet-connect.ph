import { bookingSearchFilter, bookingSearchPattern } from "./booking-search";

describe("operator booking search", () => {
  it("creates a literal substring pattern", () => {
    expect(bookingSearchPattern("50%_off\\" )).toBe("%50\\%\\_off\\\\%");
  });

  it("searches the booking fields and matching package ids", () => {
    expect(bookingSearchFilter("Jane", ["package-1", "package-2"])).toBe(
      'booking_reference.ilike."%Jane%",contact_name.ilike."%Jane%",contact_phone.ilike."%Jane%",package_id.in.(package-1,package-2)',
    );
    expect(bookingSearchFilter("Jane", [])).not.toContain("package_id");
  });

  it("quotes filter syntax in user input rather than adding conditions", () => {
    const filter = bookingSearchFilter('x",status.eq.confirmed', []);
    expect(filter).toContain('"%x\\",status.eq.confirmed%"');
    expect(filter).toContain('contact_name.ilike.');
  });
});
