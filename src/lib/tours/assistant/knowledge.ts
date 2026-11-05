import { STATUS_LABELS } from "@/lib/tours/booking-lifecycle";
import { FREE_CANCELLATION_HOURS } from "@/lib/tours/cancellation";
import { normalizeText } from "@/lib/tours/itinerary/assistant";
import { PROOF_METHODS } from "@/lib/tours/payment-proof";
import { TOURS_REWARD_RULES } from "@/lib/rewards";
import { TRANSPORT_FAQS } from "@/lib/tours/assistant/transport";

/**
 * What the travel assistant (F13) knows about how CONNECT-Daet works. Every
 * rule is built from the constants the app itself uses, so the assistant
 * can't drift from the real policy. Used as the `policy` tool for the model and
 * answered directly in basic mode.
 */

export type FaqLink = { href: string; label: string };
export type Faq = { id: string; title: string; keywords: string[]; answer: string; links: FaqLink[] };

const proofMethods = Object.values(PROOF_METHODS).filter((m) => m !== "Other").join(", ");

export const FAQS: Faq[] = [
  {
    id: "cancel",
    title: "Cancelling and refunds",
    keywords: ["cancel", "cancellation", "refund", "refunds", "money back", "change plans", "plans changed", "kansela", "ikansela", "icancel", "mag cancel", "magcancel", "ibalik", "bawiin"],
    answer: [
      "Open the booking and use the cancel panel.",
      "If nothing has been paid and the operator hasn't confirmed yet, you can cancel straight away.",
      "Once you've paid or the operator has confirmed, you send a cancellation request; the operator reviews it and arranges any refund to you.",
      `Cancelling at least ${FREE_CANCELLATION_HOURS} hours before the tour day is the free window. Closer than that, the operator's own refund policy may apply.`,
      "Once the tour day has started, the booking can't be cancelled in the app, so message the operator.",
    ].join(" "),
    links: [{ href: "/tours/my-bookings", label: "My bookings" }],
  },
  {
    id: "pay",
    title: "How to pay",
    keywords: ["pay", "payment", "paying", "gcash", "maya", "paymaya", "card", "bank", "transfer", "bayad", "magbayad", "paano magbayad", "downpayment", "balance", "proof", "receipt", "paymongo"],
    answer: [
      "You pay after the operator confirms your booking.",
      "On the booking page, tap Pay to pay online with GCash, Maya or a card through PayMongo; it's marked paid within about a minute.",
      `Or pay the operator directly by ${proofMethods} using the details on the booking page, then upload a screenshot of the receipt so the operator can verify it.`,
      "The booking page always shows what you've paid and what's left.",
    ].join(" "),
    links: [{ href: "/tours/my-bookings", label: "My bookings" }],
  },
  {
    id: "ticket",
    title: "Your ticket and check-in",
    keywords: ["ticket", "qr", "qr code", "check in", "checkin", "check-in", "boarding", "show the guide", "e-ticket", "voucher", "tiket"],
    answer: [
      "Once your booking is confirmed and paid in full, open it and tap Show ticket QR.",
      "On the tour day, show the QR to your guide; they scan it to check your group in. A screenshot works offline.",
      "Guides can only check in bookings that are paid in full. If the QR won't load, show your booking reference (it starts with BK-) instead.",
    ].join(" "),
    links: [{ href: "/tours/my-bookings", label: "My bookings" }],
  },
  {
    id: "status",
    title: "What booking statuses mean",
    keywords: ["status", "pending", "confirmed", "waiting", "not confirmed", "declined", "rejected", "approved", "kailan", "confirm"],
    answer: [
      `${STATUS_LABELS.pending}: the operator hasn't accepted it yet; you'll be notified when they do.`,
      `${STATUS_LABELS.confirmed}: your seats are held and you can pay and show your ticket.`,
      `${STATUS_LABELS.completed}: the tour is done, and you can leave a review.`,
      `${STATUS_LABELS.rejected}: the operator couldn't take it (the reason is on the booking).`,
      `${STATUS_LABELS.cancelled}: it was cancelled; any refund is arranged by the operator.`,
    ].join(" "),
    links: [{ href: "/tours/my-bookings", label: "My bookings" }],
  },
  {
    id: "book",
    title: "How to book a tour",
    keywords: ["book", "booking", "reserve", "reservation", "how to book", "paano mag book", "magpabook", "pabook", "sign up for a tour", "join a tour"],
    answer: [
      "Open a tour, tap Book this experience, choose an open date and the number of people, and send the request.",
      "Only dates with free seats can be picked. The operator then confirms, and you pay and get your ticket QR.",
    ].join(" "),
    links: [{ href: "/tours/browse", label: "Browse tours" }],
  },
  {
    id: "rewards",
    title: "Reward points",
    keywords: ["points", "reward", "rewards", "loyalty", "puntos"],
    answer: `You earn points automatically: ${TOURS_REWARD_RULES.map((r) => `${r.label.toLowerCase()} (+${r.points})`).join(", ")}. Your balance is on your home page.`,
    links: [{ href: "/tours/me", label: "My home" }],
  },
  {
    id: "plan",
    title: "Planning a trip",
    keywords: ["plan", "itinerary", "schedule", "trip plan", "what to do", "day trip", "itinerary planner", "places to visit", "saan pwede"],
    answer: "The trip planner builds a day-by-day plan from our attraction list that fits opening hours, travel time and your budget. Describe your trip in your own words and it fills in the details, then suggests tours that match.",
    links: [{ href: "/tours/plan", label: "Plan a trip" }],
  },
  {
    id: "contact",
    title: "Talking to a person",
    keywords: ["operator", "contact", "talk to", "human", "person", "agent", "staff", "complain", "complaint", "problem", "issue", "emergency", "lost", "tourism office", "kausapin", "reklamo"],
    answer: "For anything about a booking, message its operator from the booking page. For general questions or a complaint, message the Daet Tourism Office. I can open either chat with a summary of our conversation.",
    links: [{ href: "/tours/messages", label: "Messages" }],
  },
  {
    id: "account",
    title: "Your account",
    keywords: ["account", "password", "sign in", "login", "log in", "sign out", "logout", "register", "signup", "sign up", "profile"],
    answer: "Use Sign in at the top of any page; new visitors can create an account from there. Sign out is next to the bell once you're signed in. To change your password, use \"Forgot password\" on the sign-in page.",
    links: [{ href: "/login", label: "Sign in" }],
  },
  // R5: getting here, getting around and boats (curated, provisional).
  ...TRANSPORT_FAQS,
];

/** Best FAQ for a question, or null. Matches whole words and phrases, English and Taglish. */
export function matchFaq(text: string): Faq | null {
  const t = ` ${normalizeText(text).replace(/[.,;!?-]/g, " ").replace(/\s+/g, " ")} `;
  let best: { faq: Faq; score: number } | null = null;
  for (const faq of FAQS) {
    let score = 0;
    for (const keyword of faq.keywords) if (t.includes(` ${keyword} `)) score += keyword.includes(" ") ? 3 : 2;
    if (score > 0 && (!best || score > best.score)) best = { faq, score };
  }
  return best?.faq ?? null;
}

export function faqById(id: string): Faq | null {
  return FAQS.find((faq) => faq.id === id) ?? null;
}
