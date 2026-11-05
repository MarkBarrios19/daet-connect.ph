import type { TripContext } from "@/lib/tours/assistant/context";
import { hasTicket } from "@/lib/tours/ticket";
import { formatPeso } from "@/lib/money";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toAttraction, ATTRACTION_COLUMNS } from "@/lib/tours/attractions";
import { bookableDates, type AvailabilityRow } from "@/lib/tours/availability";
import { STATUS_LABELS, isBookingStatus } from "@/lib/tours/booking-lifecycle";
import { faqById, FAQS, type FaqLink } from "@/lib/tours/assistant/knowledge";
import { hoursToText } from "@/lib/tours/opening-hours";
import { directionsUrl, estimateLeg, formatDistance, formatDuration, type LatLng, type Leg } from "@/lib/maps/geo";
import { boatOptionsTo, findBoatLeg, findTransportPlace, TRANSPORT_CHECKED } from "@/lib/tours/assistant/transport";
import type { CostCard, PlaceCard, TransportCard } from "@/lib/tours/assistant/guide-tools";

/**
 * Read-only tools for the travel assistant (F13). They run with the
 * caller's own Supabase client, so row-level security decides what they
 * can see: visitors get published tours, attractions and events; a
 * signed-in tourist also gets their own bookings. Nothing here writes.
 * Each tool returns compact JSON for the model and may add cards (links,
 * tours, bookings, a handoff) that the chat shows as buttons.
 */

export type TourCard = { type: "tour"; id: string; title: string; location: string | null; priceFrom: number | null; duration: string | null; href: string };
export type BookingCard = { type: "booking"; id: string; reference: string; title: string; date: string; status: string; statusLabel: string; amountDue: number; nextStep: string; links: FaqLink[] };
/** `external` links (Google Maps directions) open in a new tab. */
export type LinkCard = { type: "link"; href: string; label: string; external?: boolean };
export type HandoffCard = { type: "handoff"; target: "operator" | "tourism_office"; bookingId: string | null; operatorName: string | null; summary: string; signedIn: boolean };
export type AssistantCard = TourCard | BookingCard | LinkCard | HandoffCard | PlaceCard | CostCard | TransportCard;

export type ToolContext = {
  supabase: SupabaseClient;
  userId: string | null;
  today: string;
  cards: AssistantCard[];
  /** Road leg between two points (the cached Routes API on the server); an estimate when missing. */
  route?: (from: LatLng, to: LatLng) => Promise<Leg>;
  /** The traveller's location, rounded, when they chose to share it for this message. Never stored. */
  here?: LatLng | null;
  /** The page it was opened on and the trip answers so far, from the browser. Hints only. */
  trip?: TripContext | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CARDS = 8;
const peso = (n: number) => Math.round(n * 100) / 100;
/** Text safe inside a PostgREST or() filter. */
const cleanTerm = (value: string) => value.replace(/[^\p{L}\p{N} '-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

const cardKey = (c: AssistantCard) =>
  c.type === "handoff" ? "handoff" : "href" in c ? c.href : c.type === "booking" ? c.id : c.type === "place" ? `place:${c.name}` : JSON.stringify(c);

export function addCard(ctx: ToolContext, card: AssistantCard) {
  const key = cardKey(card);
  const exists = ctx.cards.some((c) => cardKey(c) === key);
  if (!exists && ctx.cards.length < MAX_CARDS) ctx.cards.push(card);
}

type VariantRow = { price_per_pax: number | string | null; flat_price: number | string | null; is_default?: boolean | null };
function priceFrom(variants: VariantRow[] | null | undefined): number | null {
  const prices = (variants ?? []).map((v) => Number(v.price_per_pax ?? v.flat_price)).filter((n) => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : null;
}
const durationText = (value: number | null, type: string | null) => (value && type ? `${value} ${type}${value === 1 ? "" : "s"}`.replace(/ss$/, "s") : null);

// ------------------------------------------------------------------ tours

export async function searchTours(ctx: ToolContext, input: { query?: string | null; date?: string | null; maxPrice?: number | null }) {
  const term = cleanTerm(input.query ?? "");
  let query = ctx.supabase
    .from("tours_packages")
    .select("id, title, location_name, duration_value, duration_type, tours_package_price_variants(price_per_pax, flat_price, is_default)")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(40);
  if (term) query = query.or(`title.ilike.%${term}%,location_name.ilike.%${term}%,description.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) return { error: "Tours could not be loaded right now." };

  let rows = (data ?? []) as Array<{ id: string; title: string; location_name: string | null; duration_value: number | null; duration_type: string | null; tours_package_price_variants: VariantRow[] }>;
  if (typeof input.maxPrice === "number") rows = rows.filter((r) => (priceFrom(r.tours_package_price_variants) ?? 0) <= input.maxPrice!);

  let openOn: Set<string> | null = null;
  if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) && rows.length) {
    const { data: availability } = await ctx.supabase
      .from("tours_package_availability")
      .select("package_id, capacity_total, capacity_booked")
      .eq("available_date", input.date)
      .in("package_id", rows.map((r) => r.id));
    openOn = new Set(((availability ?? []) as Array<{ package_id: string; capacity_total: number; capacity_booked: number }>).filter((a) => a.capacity_total - a.capacity_booked > 0).map((a) => a.package_id));
    rows = rows.filter((r) => openOn!.has(r.id));
  }

  const tours = rows.slice(0, 6).map((r) => ({
    id: r.id,
    title: r.title,
    location: r.location_name,
    priceFromPerPerson: priceFrom(r.tours_package_price_variants),
    duration: durationText(r.duration_value, r.duration_type),
    link: `/tours/packages/${r.id}`,
  }));
  for (const t of tours) addCard(ctx, { type: "tour", id: t.id, title: t.title, location: t.location, priceFrom: t.priceFromPerPerson, duration: t.duration, href: t.link });
  return { tours, matched: tours.length, note: tours.length === 0 ? (openOn ? "No tour has free seats on that date." : "No published tour matches.") : undefined };
}

export async function tourDetails(ctx: ToolContext, input: { packageId: string }) {
  if (!UUID.test(input.packageId ?? "")) return { error: "Unknown tour id. Use search_tours first." };
  const { data, error } = await ctx.supabase
    .from("tours_packages")
    .select(
      `id, title, description, location_name, duration_value, duration_type, status,
       tours_package_price_variants(variant_name, price_per_pax, flat_price, min_pax, max_pax, is_default),
       tours_package_inclusions(item_text, is_included),
       tours_package_stops(location_name, stop_order),
       tours_operators(business_name)`,
    )
    .eq("id", input.packageId)
    .maybeSingle();
  if (error || !data || data.status !== "published") return { error: "That tour isn't available." };

  const { data: availability } = await ctx.supabase
    .from("tours_package_availability")
    .select("available_date, capacity_total, capacity_booked")
    .eq("package_id", input.packageId)
    .gte("available_date", ctx.today)
    .order("available_date")
    .limit(60);
  const dates = bookableDates((availability ?? []) as AvailabilityRow[], ctx.today).filter((d) => !d.full).slice(0, 6);

  const inclusions = (data.tours_package_inclusions ?? []) as Array<{ item_text: string; is_included: boolean }>;
  const stops = ((data.tours_package_stops ?? []) as Array<{ location_name: string; stop_order: number }>).sort((a, b) => a.stop_order - b.stop_order);
  addCard(ctx, { type: "tour", id: data.id, title: data.title, location: data.location_name, priceFrom: priceFrom(data.tours_package_price_variants as VariantRow[]), duration: durationText(data.duration_value, data.duration_type), href: `/tours/packages/${data.id}` });
  if (dates.length) addCard(ctx, { type: "link", href: `/tours/packages/${data.id}/book`, label: `Book ${data.title}` });
  return {
    title: data.title,
    operator: one(data.tours_operators as { business_name: string } | { business_name: string }[] | null)?.business_name ?? null,
    location: data.location_name,
    duration: durationText(data.duration_value, data.duration_type),
    description: (data.description ?? "").slice(0, 600),
    prices: ((data.tours_package_price_variants ?? []) as Array<VariantRow & { variant_name: string; min_pax: number | null; max_pax: number | null }>).map((v) => ({
      name: v.variant_name,
      perPerson: v.price_per_pax === null ? null : peso(Number(v.price_per_pax)),
      flat: v.flat_price === null ? null : peso(Number(v.flat_price)),
      minPeople: v.min_pax,
      maxPeople: v.max_pax,
    })),
    included: inclusions.filter((i) => i.is_included).map((i) => i.item_text),
    notIncluded: inclusions.filter((i) => !i.is_included).map((i) => i.item_text),
    stops: stops.map((s) => s.location_name),
    nextOpenDates: dates.map((d) => ({ date: d.date, seatsLeft: d.seatsLeft })),
    link: `/tours/packages/${data.id}`,
    bookingLink: `/tours/packages/${data.id}/book`,
  };
}

// ------------------------------------------------------------------ places and events

export async function attractionInfo(ctx: ToolContext, input: { name: string }) {
  const term = cleanTerm(input.name ?? "");
  if (term.length < 3) return { error: "Give at least part of the place's name." };
  const { data, error } = await ctx.supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("is_active", true).ilike("name", `%${term}%`).limit(3);
  if (error) return { error: "Attractions could not be loaded right now." };
  const places = (data ?? []).map((row) => toAttraction(row as Record<string, unknown>)).map((a) => ({
    name: a.name,
    category: a.category,
    municipality: a.municipality,
    hours: a.opening_hours ? hoursToText(a.opening_hours) : "Hours not listed; check before going.",
    hoursNote: a.hours_note,
    entranceFee: a.entrance_fee,
    description: (a.description ?? "").slice(0, 300),
    link: `/tours/attractions/${a.slug}`,
  }));
  for (const p of places) addCard(ctx, { type: "link", href: p.link, label: p.name });
  return { places, note: places.length === 0 ? "No listed attraction matches that name." : undefined };
}

export async function upcomingEvents(ctx: ToolContext, input: { from?: string | null; to?: string | null }) {
  const from = input.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from) ? input.from : ctx.today;
  let query = ctx.supabase.from("tours_events").select("id, title, venue, starts_at, ends_at, category").eq("is_published", true).gte("ends_at", `${from}T00:00:00+08:00`).order("starts_at").limit(6);
  if (input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to)) query = query.lte("starts_at", `${input.to}T23:59:59+08:00`);
  const { data, error } = await query;
  if (error) return { error: "Events could not be loaded right now." };
  const events = ((data ?? []) as Array<{ id: string; title: string; venue: string; starts_at: string; ends_at: string; category: string }>).map((e) => ({
    title: e.title,
    venue: e.venue,
    starts: e.starts_at,
    ends: e.ends_at,
    link: `/tours/events/${e.id}`,
  }));
  for (const e of events.slice(0, 3)) addCard(ctx, { type: "link", href: e.link, label: e.title });
  return { events, note: events.length === 0 ? "No published events in that range." : undefined };
}

// ------------------------------------------------------------------ policies

export const POLICY_TOPICS = FAQS.map((f) => f.id) as [string, ...string[]];

export function policy(ctx: ToolContext, input: { topic: string }) {
  const faq = faqById(input.topic);
  if (!faq) return { error: `Unknown topic. Use one of: ${POLICY_TOPICS.join(", ")}.` };
  for (const link of faq.links) addCard(ctx, { type: "link", ...link });
  return { topic: faq.title, answer: faq.answer, links: faq.links };
}

// ------------------------------------------------------------------ the tourist's own bookings

type BookingRow = {
  id: string;
  booking_reference: string;
  tour_date: string;
  status: string;
  payment_status: string | null;
  total_amount: number | string;
  total_paid: number | string | null;
  number_of_pax: number;
  tours_packages: { title: string } | { title: string }[] | null;
};

export function bookingCard(row: BookingRow, today: string): BookingCard {
  const due = Math.max(0, peso(Number(row.total_amount) - Number(row.total_paid ?? 0)));
  const title = one(row.tours_packages)?.title ?? "Tour booking";
  const view = { href: `/tours/bookings/${row.id}`, label: "View booking" };
  const links: FaqLink[] = [];
  let nextStep: string;
  if (row.status === "pending") nextStep = "Waiting for the operator to confirm. You'll be notified.";
  else if (row.status === "confirmed" && due > 0 && row.payment_status !== "refunded") {
    nextStep = `Confirmed. ${formatPeso(due)} left to pay; your ticket QR appears once it is paid in full.`;
    links.push({ href: `/tours/bookings/${row.id}#payment`, label: "Pay now" });
  } else if (row.status === "confirmed") nextStep = row.tour_date >= today ? "Confirmed and paid. Show your ticket QR on the tour day." : "Confirmed. The operator will mark it completed.";
  else if (row.status === "completed") nextStep = "Completed. You can leave a review.";
  else nextStep = row.status === "rejected" ? "Declined by the operator; the reason is on the booking." : "Cancelled. Any refund is arranged by the operator.";
  if (hasTicket(row) && row.status === "confirmed") links.push({ href: `/tours/bookings/${row.id}/ticket`, label: "Show ticket QR" });
  links.push(view);
  return {
    type: "booking",
    id: row.id,
    reference: row.booking_reference,
    title,
    date: row.tour_date,
    status: row.status,
    statusLabel: isBookingStatus(row.status) ? STATUS_LABELS[row.status] : row.status,
    amountDue: due,
    nextStep,
    links,
  };
}

export async function myBookings(ctx: ToolContext, input: { reference?: string | null }) {
  if (!ctx.userId) {
    addCard(ctx, { type: "link", href: "/login?next=/tours/my-bookings", label: "Sign in to see your bookings" });
    return { signedIn: false, note: "The tourist is not signed in. Ask them to sign in to see their bookings." };
  }
  let query = ctx.supabase
    .from("tours_bookings")
    .select("id, booking_reference, tour_date, status, payment_status, total_amount, total_paid, number_of_pax, tours_packages(title)")
    .eq("user_id", ctx.userId)
    .order("tour_date", { ascending: false })
    .limit(10);
  const ref = (input.reference ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (ref) query = query.eq("booking_reference", ref);
  const { data, error } = await query;
  if (error) return { error: "Bookings could not be loaded right now." };
  const rows = (data ?? []) as BookingRow[];
  // Upcoming first, then recent past.
  const ordered = [...rows.filter((r) => r.tour_date >= ctx.today).reverse(), ...rows.filter((r) => r.tour_date < ctx.today)];
  const cards = ordered.map((r) => bookingCard(r, ctx.today));
  for (const card of cards.slice(0, 4)) addCard(ctx, card);
  return {
    signedIn: true,
    bookings: cards.map((c) => ({ reference: c.reference, tour: c.title, date: c.date, status: c.statusLabel, amountDue: c.amountDue, nextStep: c.nextStep })),
    note: cards.length === 0 ? (ref ? "No booking of theirs has that reference." : "They have no bookings yet.") : undefined,
  };
}

// ------------------------------------------------------------------ planner and handoff

export function planTripLink(ctx: ToolContext, input: { description: string }) {
  const description = (input.description ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const href = description ? `/tours/plan?describe=${encodeURIComponent(description)}` : "/tours/plan";
  addCard(ctx, { type: "link", href, label: "Open the trip planner" });
  return { link: href };
}

export async function handoff(ctx: ToolContext, input: { summary: string; bookingReference?: string | null }) {
  const summary = (input.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 600) || "I need help with my trip.";
  let bookingId: string | null = null;
  let operatorName: string | null = null;
  const ref = (input.bookingReference ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (ctx.userId && ref) {
    const { data } = await ctx.supabase
      .from("tours_bookings")
      .select("id, tours_packages(tours_operators(business_name))")
      .eq("user_id", ctx.userId)
      .eq("booking_reference", ref)
      .maybeSingle();
    if (data) {
      bookingId = data.id as string;
      const pkg = one(data.tours_packages as unknown as { tours_operators: { business_name: string } | { business_name: string }[] | null } | null);
      operatorName = one(pkg?.tours_operators)?.business_name ?? null;
    }
  }
  const card: HandoffCard = { type: "handoff", target: bookingId ? "operator" : "tourism_office", bookingId, operatorName, summary, signedIn: Boolean(ctx.userId) };
  ctx.cards.splice(0, ctx.cards.length, ...ctx.cards.filter((c) => c.type !== "handoff"));
  addCard(ctx, card);
  return { target: card.target === "operator" ? `the operator ${operatorName ?? ""}`.trim() : "the Daet Tourism Office", signedIn: card.signedIn, note: card.signedIn ? "A button to send this summary is shown below your reply." : "They must sign in before they can send a message." };
}

/** A listed attraction or a known town/port, with coordinates. */
export async function resolvePlace(ctx: ToolContext, name: string): Promise<{ name: string; point: LatLng } | null> {
  const term = cleanTerm(name ?? "");
  if (term.length < 3) return null;
  // A bare town or port name ("Daet", "Mercedes") means the town, not a place named after it.
  const town = findTransportPlace(term);
  if (town && town.aliases.includes(term.toLowerCase())) return { name: town.name, point: town.point };
  const { data } = await ctx.supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("is_active", true).ilike("name", `%${term}%`).limit(1);
  const attraction = data?.[0] ? toAttraction(data[0] as Record<string, unknown>) : null;
  if (attraction && attraction.latitude !== null && attraction.longitude !== null) return { name: attraction.name, point: { lat: attraction.latitude, lng: attraction.longitude } };
  const place = findTransportPlace(name);
  return place ? { name: place.name, point: place.point } : null;
}

const minutesText = ([low, high]: [number, number]) => `about ${formatDuration(low * 60)}–${formatDuration(high * 60)}`;

/** R5: how long and how far between two places in or near Daet. */
export async function travelTime(ctx: ToolContext, input: { from?: string | null; to: string; mode?: "drive" | "walk" | null }) {
  const to = (input.to ?? "").trim();
  if (!to) return { error: "Say where you want to go." };
  const from = (input.from ?? "").trim() || "Daet town center";

  // Islands have no road: use the curated boat times.
  const boat = findBoatLeg(from, to);
  if (boat) return { kind: "boat", from: boat.from, to: boat.to, duration: minutesText(boat.minutes), note: "By boat; trips are weather-dependent and usually leave early in the morning.", checked: TRANSPORT_CHECKED };
  const options = boatOptionsTo(to);
  if (options.length) {
    return {
      kind: "boat",
      to: options[0].to,
      options: options.map((leg) => ({ from: leg.from, duration: minutesText(leg.minutes) })),
      note: "Reaching the port from Daet by road takes extra time. Boats are weather-dependent.",
      checked: TRANSPORT_CHECKED,
    };
  }

  const [origin, dest] = await Promise.all([resolvePlace(ctx, from), resolvePlace(ctx, to)]);
  if (!origin || !dest) return { error: `I don't know where ${!origin ? from : to} is. Try a listed place, a town (Daet, Mercedes, Vinzons, Paracale) or a port.` };
  const mode = input.mode === "walk" ? "walk" : "drive";
  let leg: Leg;
  try {
    leg = ctx.route && mode === "drive" ? await ctx.route(origin.point, dest.point) : estimateLeg(origin.point, dest.point);
  } catch {
    leg = estimateLeg(origin.point, dest.point);
  }
  // Walking is about 5 km/h on the estimated road distance.
  const durationS = mode === "walk" ? Math.round((leg.distanceM / 5000) * 3600) : leg.durationS;
  const directions = directionsUrl([origin.point, dest.point]);
  if (directions) addCard(ctx, { type: "link", href: directions, label: `Directions: ${origin.name} → ${dest.name}`, external: true });
  return {
    kind: mode,
    from: origin.name,
    to: dest.name,
    distance: formatDistance(leg.distanceM),
    duration: formatDuration(durationS),
    estimated: leg.estimated || mode === "walk",
    note: leg.estimated || mode === "walk" ? "Estimated from the map distance; traffic and stops add time." : "From the road route; traffic can add time.",
  };
}
