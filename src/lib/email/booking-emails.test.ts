import { bookingConfirmedEmail, CALL_OFF_RULE, paymentReceivedEmail, type BookingEmailData } from "@/lib/email/booking-emails";

const booking: BookingEmailData = {
  reference: "BK-20261110-AAAA11",
  contactName: "Maria Santos",
  tourTitle: "Calaguas <Island> Hopping",
  tourDate: "2026-11-10",
  pax: 3,
  operatorName: "Bagasbas Coast Tours",
  meetingPoint: "Vinzons port",
  meetingTime: "6:00 AM",
  totalAmount: 4500,
  totalPaid: 0,
  bookingUrl: "https://example.test/tours/bookings/b1",
  ticketUrl: "https://example.test/tours/bookings/b1/ticket",
};

describe("booking emails", () => {
  it("confirmed: says what to pay, where to meet, and links to the booking", () => {
    const email = bookingConfirmedEmail(booking);
    expect(email.subject).toBe("Booking confirmed: Calaguas <Island> Hopping on Tuesday, November 10, 2026");
    expect(email.text).toContain("Hi Maria,");
    expect(email.text).toContain("Pay ₱4,500.00 to secure your seats.");
    expect(email.text).toContain("Meet at: Vinzons port, 6:00 AM");
    expect(email.text).toContain("Pay now: https://example.test/tours/bookings/b1");
    expect(email.text).toContain(CALL_OFF_RULE);
    expect(email.html).toContain('href="https://example.test/tours/bookings/b1"');
  });

  it("escapes HTML from names and titles", () => {
    expect(bookingConfirmedEmail(booking).html).toContain("Calaguas &lt;Island&gt; Hopping");
    expect(bookingConfirmedEmail(booking).html).not.toContain("<Island>");
  });

  it("payment: shows the amount, what is still due, and the ticket link", () => {
    const partial = paymentReceivedEmail({ ...booking, totalPaid: 1500 }, 1500);
    expect(partial.text).toContain("We received ₱1,500.00 for your booking. ₱3,000.00 is still due.");
    expect(partial.text).toContain("Open your ticket: https://example.test/tours/bookings/b1/ticket");
    const full = paymentReceivedEmail({ ...booking, totalPaid: 4500 }, 3000);
    expect(full.text).toContain("Your booking is fully paid.");
  });

  it("leaves out what isn't known", () => {
    const email = bookingConfirmedEmail({ ...booking, contactName: null, operatorName: null, meetingPoint: null });
    expect(email.text).toMatch(/^Hi,/);
    expect(email.text).toContain("The operator confirmed your booking.");
    expect(email.text).not.toContain("Meet at");
  });
});
