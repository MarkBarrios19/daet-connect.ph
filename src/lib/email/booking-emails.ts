import { formatPeso } from "@/lib/money";

/**
 * Booking emails: plain text plus simple HTML built from the same lines.
 * Only what the traveller needs on the day; never child ages or payment
 * details beyond amounts.
 */

export type BookingEmailData = {
  reference: string;
  contactName: string | null;
  tourTitle: string;
  tourDate: string;
  pax: number;
  operatorName: string | null;
  meetingPoint: string | null;
  meetingTime: string | null;
  totalAmount: number;
  totalPaid: number;
  /** Absolute links, e.g. https://…/tours/bookings/{id} */
  bookingUrl: string;
  ticketUrl: string;
};

export const CALL_OFF_RULE = "If the operator calls the trip off for weather or safety, you choose a new date or get a full refund.";

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Line = string | { label: string; href: string };

function render(subject: string, lines: Line[]): { subject: string; text: string; html: string } {
  const text = lines.map((l) => (typeof l === "string" ? l : `${l.label}: ${l.href}`)).join("\n");
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:560px">`,
    ...lines.map((l) =>
      typeof l === "string"
        ? l === ""
          ? "<br>"
          : `<p style="margin:0 0 8px">${escape(l)}</p>`
        : `<p style="margin:16px 0"><a href="${escape(l.href)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${escape(l.label)}</a></p>`,
    ),
    `<p style="margin:24px 0 0;font-size:13px;color:#475569">CONNECT-Daet · Tours in Daet, Camarines Norte</p>`,
    `</div>`,
  ].join("\n");
  return { subject, text, html };
}

function tripLines(b: BookingEmailData): string[] {
  return [
    `Booking reference: ${b.reference}`,
    `Tour: ${b.tourTitle}`,
    `Date: ${longDate(b.tourDate)}`,
    `Guests: ${b.pax}`,
    ...(b.operatorName ? [`Operator: ${b.operatorName}`] : []),
    ...(b.meetingPoint ? [`Meet at: ${b.meetingPoint}${b.meetingTime ? `, ${b.meetingTime}` : ""}`] : []),
  ];
}

const hello = (name: string | null) => `Hi${name ? ` ${name.split(" ")[0]}` : ""},`;

/** Sent when the operator confirms: the booking is accepted and can be paid. */
export function bookingConfirmedEmail(b: BookingEmailData) {
  const due = Math.max(0, b.totalAmount - b.totalPaid);
  return render(`Booking confirmed: ${b.tourTitle} on ${longDate(b.tourDate)}`, [
    hello(b.contactName),
    `${b.operatorName ?? "The operator"} confirmed your booking.${due > 0 ? ` Pay ${formatPeso(due)} to secure your seats.` : ""}`,
    "",
    ...tripLines(b),
    `Total: ${formatPeso(b.totalAmount)}${b.totalPaid > 0 ? ` (paid so far ${formatPeso(b.totalPaid)})` : ""}`,
    { label: due > 0 ? "Pay now" : "View booking", href: b.bookingUrl },
    CALL_OFF_RULE,
  ]);
}

/** Sent when a payment is recorded: the receipt and the ticket. */
export function paymentReceivedEmail(b: BookingEmailData, amount: number) {
  const due = Math.max(0, b.totalAmount - b.totalPaid);
  return render(`Payment received: ${b.tourTitle} (${b.reference})`, [
    hello(b.contactName),
    `We received ${formatPeso(amount)} for your booking.${due > 0 ? ` ${formatPeso(due)} is still due.` : " Your booking is fully paid."}`,
    "",
    ...tripLines(b),
    `Paid: ${formatPeso(b.totalPaid)} of ${formatPeso(b.totalAmount)}`,
    { label: "Open your ticket", href: b.ticketUrl },
    "Show the ticket's QR code to your guide on the day.",
    CALL_OFF_RULE,
  ]);
}

/** Sent when the operator calls the trip off: why, and the two choices. */
export function tripCalledOffEmail(b: BookingEmailData, reason: string) {
  return render(`Trip called off: ${b.tourTitle} on ${longDate(b.tourDate)}`, [
    hello(b.contactName),
    `${b.operatorName ?? "The operator"} called off your trip for safety: ${reason}`,
    "Nothing is lost. Choose what you'd like: pick a new date, or get a full refund.",
    "",
    ...tripLines(b),
    { label: "Choose a new date or a refund", href: b.bookingUrl },
  ]);
}
