import { formatPeso } from "@/lib/money";
import { FAQS, matchFaq } from "@/lib/tours/assistant/knowledge";
import { attractionInfo, handoff, myBookings, planTripLink, searchTours, tourDetails, travelTime, upcomingEvents, type ToolContext } from "@/lib/tours/assistant/tools";
import { findTransportPlace, readTravelQuestion } from "@/lib/tours/assistant/transport";
import { estimateCost, findPlaces, howToGetThere, meetingPoint, tripRoutes } from "@/lib/tours/assistant/guide-tools";
import { detectTripLang, readTripQuestion, tripAnswer } from "@/lib/tours/assistant/trip";
import { isMeetingQuestion, readCostQuestion, readDirectionsQuestion, readPlaceQuestion } from "@/lib/tours/assistant/guide-intents";
import { normalizeText } from "@/lib/tours/itinerary/assistant";

/**
 * Basic mode: answers without a language model. Used when no Anthropic key
 * is configured, when the AI limit is reached, or when the AI call fails.
 * Recognises a few intents, then falls back to the FAQ.
 */

const has = (t: string, pattern: RegExp) => pattern.test(t);
const STOP = new Set(["what", "when", "where", "which", "the", "are", "is", "for", "any", "open", "dates", "date", "available", "availability", "seats", "slots", "tour", "tours", "this", "next", "weekend", "week", "there", "still", "have", "you", "do", "can", "book", "how", "much", "price", "cost", "meron", "pa", "ba", "ang", "sa", "ng", "may", "magkano"]);

export async function basicReply(text: string, ctx: ToolContext): Promise<string> {
  const t = normalizeText(text);

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|kumusta|musta|magandang (umaga|hapon|gabi))\b/.test(t) && t.split(" ").length <= 4) {
    return "Hi! I'm the Daet AI assistant. Ask me where to eat or stay, how to get somewhere and what a trip costs, about tours and open dates, or about your own booking, payment or ticket.";
  }

  // A person, or a complaint
  if (has(t, /\b(talk to|speak (to|with)|human|real person|agent|complain|complaint|reklamo|emergency|kausapin|not happy|scam|lost)\b/)) {
    const ref = /\bbk-[0-9a-z-]+\b/i.exec(text)?.[0] ?? null;
    await handoff(ctx, { summary: text, bookingReference: ref });
    return ctx.userId
      ? "I'll pass this to a person. Check the message below, edit it if you like, and send it."
      : "I'll pass this to a person. Sign in first so they can reply to you.";
  }

  // Fares, routes and travel times to Daet and around it, in the visitor's own language
  const tripQ = readTripQuestion(text);
  // "How long from Daet to Bagasbas?" between two nearby towns is a road time
  // with a directions button (travel_time, below), not a list of fares.
  const roadTime = tripQ?.asks === "time" ? readTravelQuestion(text) : null;
  const local = roadTime?.from && findTransportPlace(roadTime.from) && findTransportPlace(roadTime.to);
  if (tripQ && !local) {
    const routes = await tripRoutes(ctx, tripQ);
    if (routes.length) return tripAnswer(routes, tripQ, detectTripLang(text), formatPeso);
    // A trip from somewhere far with nothing listed: say so, rather than offering tours.
    if (tripQ.from && !/\b(daet|bagasbas|mercedes|vinzons|paracale|calaguas|apuao|talisay|basud|labo)\b/i.test(tripQ.from)) {
      return tripAnswer([], tripQ, detectTripLang(text), formatPeso);
    }
  }

  // How long / how far between two places (R5)
  const trip = readTravelQuestion(text);
  if (trip) {
    const result = await travelTime(ctx, { from: trip.from, to: trip.to });
    if ("error" in result && result.error) return result.error;
    if (result.kind === "boat") {
      if ("options" in result && result.options) return `To ${result.to} by boat: ${result.options.map((o) => `from ${o.from}, ${o.duration}`).join("; ")}. ${result.note}`;
      return `${result.from} to ${result.to} by boat takes ${result.duration}. ${result.note}`;
    }
    if ("distance" in result) return `${result.from} to ${result.to}: about ${result.duration} (${result.distance}) by ${result.kind === "walk" ? "foot" : "road"}. ${result.note}`;
  }

  // Where a tour meets
  if (isMeetingQuestion(text)) {
    const ref = /\bbk-[0-9a-z-]+\b/i.exec(text)?.[0] ?? null;
    const result = await meetingPoint(ctx, { bookingReference: ref });
    if ("error" in result && result.error) return result.error;
    if ("meetingPoint" in result && result.meetingPoint) {
      return `For ${result.tour}, meet at ${result.meetingPoint}${result.time ? ` at ${result.time}` : ""}${result.date ? ` on ${result.date}` : ""}. Tap Get directions to open Google Maps.${result.fromFirstStop ? " This is the tour's first stop; confirm with the operator." : ""}`;
    }
    return "note" in result && result.note ? result.note : "Sign in to see where your tour meets.";
  }

  // What a trip will cost
  const cost = readCostQuestion(text);
  if (cost) {
    const result = await estimateCost(ctx, { to: cost.to, from: cost.from, packageId: null, people: cost.people, nights: cost.nights, style: cost.style });
    return `Estimated total ${result.estimate.total} (${result.estimate.perPerson} per person) for ${cost.people} ${cost.people === 1 ? "person" : "people"}, ${cost.nights ? `${cost.nights} ${cost.nights === 1 ? "night" : "nights"}` : "a day trip"}. ${result.note}`;
  }

  // How to get somewhere, and fares
  const directions = readDirectionsQuestion(text);
  if (directions) {
    const result = await howToGetThere(ctx, directions);
    if ("error" in result && result.error) return result.error;
    if (result.routes?.length) {
      const r = result.routes[0];
      const steps = r.legs.map((l) => `${l.how} from ${l.from} to ${l.to} (${l.fare}${l.time ? `, ${l.time}` : ""})`).join(", then ");
      return `${steps}.${result.routes.length > 1 ? ` There ${result.routes.length === 2 ? "is 1 other way" : `are ${result.routes.length - 1} other ways`} below.` : ""} Fares are provisional; agree on tricycle fares before you ride.`;
    }
    const general = matchFaq(text);
    if (general) {
      for (const link of general.links) ctx.cards.push({ type: "link", ...link });
      return general.answer;
    }
    return `I don't have fares for that route yet. Tap the Google Maps button for directions, or ask the Tourism Office.`;
  }

  // Where to eat, stay, or catch a ride
  const placeQ = readPlaceQuestion(text);
  if (placeQ) {
    const result = await findPlaces(ctx, { kind: placeQ.kind, near: placeQ.near, query: null, maxPrice: null, openNow: null, limit: 5 });
    if (placeQ.near === "me" && !ctx.here) return "Tap Use my location below so I can find the nearest ones, or tell me the area (e.g. near Bagasbas).";
    if (!result.places.length) return `I don't have any ${result.kind.toLowerCase()} listings${result.near ? ` near ${result.near}` : ""} yet. The Tourism Office can recommend some.`;
    return `${result.kind}${result.near ? ` near ${result.near}` : " in Daet"}: ${result.places.slice(0, 3).map((p) => p.name + (p.price ? ` (${p.price})` : "")).join("; ")}. Tap Get directions to open Google Maps.${result.places.some((p) => !p.verified) ? " Some details aren't verified yet, so check locally." : ""}`;
  }

  // Their own bookings, payments and tickets
  if (has(t, /\b(my|ko|namin|ko ba)\b/) && has(t, /\b(booking|bookings|reservation|ticket|tiket|payment|bayad|status|refund|qr)\b/) || /\bbk-[0-9a-z]/i.test(text)) {
    const ref = /\bbk-[0-9a-z-]+\b/i.exec(text)?.[0] ?? null;
    const result = await myBookings(ctx, { reference: ref });
    if ("error" in result && result.error) return result.error;
    if (!("signedIn" in result) || !result.signedIn) return "Sign in to see your bookings, payments and tickets.";
    if (!result.bookings?.length) return ref ? `I couldn't find a booking with reference ${ref.toUpperCase()} on your account.` : "You don't have any bookings yet. Browse tours to book one.";
    // A ticket question is about the next confirmed tour; keep just those cards when there are any.
    if (/\b(ticket|tiket|qr|check in)\b/.test(t)) {
      const upcoming = ctx.cards.filter((c) => c.type === "booking" && c.status === "confirmed" && c.date >= ctx.today);
      if (upcoming.length) ctx.cards.splice(0, ctx.cards.length, ...ctx.cards.filter((c) => c.type !== "booking"), ...upcoming);
    }
    const first = result.bookings[0];
    return `${result.bookings.length === 1 ? "Here's your booking" : `Here are your bookings, upcoming first`}. ${first.reference} (${first.tour}, ${first.date}): ${first.nextStep}`;
  }

  // Events
  if (has(t, /\b(event|events|festival|fiesta|pista|happening|activities)\b/)) {
    const result = await upcomingEvents(ctx, {});
    if ("error" in result && result.error) return result.error;
    if (!result.events?.length) return "There are no published events coming up yet. Check the events calendar later.";
    return `Coming up: ${result.events.slice(0, 3).map((e) => `${e.title} at ${e.venue}`).join("; ")}.`;
  }

  // Opening hours of a place
  if (has(t, /\b(open|close|closing|hours|what time|anong oras|bukas ba|entrance|fee)\b/) && !has(t, /\b(tour|tours|booking)\b/)) {
    const name = t.replace(/\b(what time|anong oras|does|do|is|are|the|open|opens|close|closes|closing|hours|of|at|bukas ba|entrance|fee|how much|magkano)\b/g, " ").replace(/\s+/g, " ").trim();
    if (name.length >= 3) {
      const result = await attractionInfo(ctx, { name });
      if (result.places?.length) {
        const p = result.places[0];
        return `${p.name}: ${p.hours}${p.entranceFee ? ` Entrance fee ${formatPeso(p.entranceFee)} per person.` : ""}`;
      }
    }
  }

  // Tours, prices and open dates
  if (has(t, /\b(tour|tours|package|island|hopping|surf|surfing|calaguas|trip|available|availability|open dates|slots|seats|price|cost|magkano|how much)\b/) && !matchFaqStrong(t)) {
    const words = t.split(" ").filter((w) => w.length >= 4 && !STOP.has(w));
    let result = await searchTours(ctx, { query: words.join(" ") || null });
    if (!result.tours?.length && words.length) result = await searchTours(ctx, { query: words[0] });
    if (!result.tours?.length) result = await searchTours(ctx, {});
    if ("error" in result && result.error) return result.error;
    if (!result.tours?.length) return "There are no published tours yet. Please check back soon.";
    if (result.tours.length === 1 || /\b(open dates|available|availability|slots|seats|when)\b/.test(t)) {
      const details = await tourDetails(ctx, { packageId: result.tours[0].id });
      if (!("error" in details)) {
        const dates = details.nextOpenDates.slice(0, 4).map((d) => `${d.date} (${d.seatsLeft} seats)`).join(", ");
        return `${details.title}${details.prices[0]?.perPerson ? ` from ${formatPeso(details.prices[0].perPerson)} per person` : ""}. ${dates ? `Next open dates: ${dates}.` : "No open dates are listed right now."}`;
      }
    }
    return `Here ${result.tours.length === 1 ? "is a tour" : "are some tours"} you can book. Open one to see its open dates.`;
  }

  // Trip planning
  if (has(t, /\b(plan|itinerary|what to do|places to visit|saan|pasyalan|day trip)\b/) && !matchFaqStrong(t)) {
    planTripLink(ctx, { description: text });
    return "The trip planner can build a day-by-day plan for you. I've passed your request to it.";
  }

  const faq = matchFaq(text);
  if (faq) {
    for (const link of faq.links) ctx.cards.push({ type: "link", ...link });
    return faq.answer;
  }

  return `I can help with: ${FAQS.slice(0, 5).map((f) => f.title.toLowerCase()).join(", ")}, tours and open dates, places and events. Or ask to talk to a person.`;
}

/** A policy question that mentions a tour ("cancel my tour") is still a policy question. */
function matchFaqStrong(t: string): boolean {
  return /\b(cancel|cancellation|refund|kansela|pay|payment|gcash|bayad|ticket|qr|check in|points|rewards)\b/.test(t);
}
