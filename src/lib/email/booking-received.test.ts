import { bookingReceivedEmail, newBookingForOperatorEmail, type BookingEmailData } from "./booking-emails";

const data: BookingEmailData = {
  reference: "BK-1",
  contactName: "Mark Alfred",
  tourTitle: "Calaguas camping",
  tourDate: "2026-11-27",
  pax: 2,
  operatorName: "Kalmado",
  meetingPoint: null,
  meetingTime: null,
  totalAmount: 7598,
  totalPaid: 0,
  bookingUrl: "https://x/tours/bookings/1",
  ticketUrl: "https://x/tours/bookings/1/ticket",
};

describe("booking received emails", () => {
  it("tells the tourist the request is waiting for the operator", () => {
    const mail = bookingReceivedEmail(data);
    expect(mail.subject).toContain("BK-1");
    expect(mail.text).toContain("Hi Mark,");
    expect(mail.text).toContain("You don't need to pay yet");
  });
  it("tells the operator to review", () => {
    const mail = newBookingForOperatorEmail(data, "https://x/op");
    expect(mail.subject).toContain("New booking request");
    expect(mail.text).toContain("https://x/op");
  });
});
