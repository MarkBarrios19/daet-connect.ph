import { formatPeso } from "@/lib/money";
import { formatDistance, type LatLng } from "@/lib/maps/geo";
import { estimateTripCost, type CostStyle } from "@/lib/tours/guide/costs";
import { FARE_COLUMNS, FARE_MODES, faresBetween, fareLabel, minutesLabel, toFare, type Fare, type FareRoute } from "@/lib/tours/guide/fares";
import { mapsDirectionsUrl, mapsPlaceUrl, type MapsMode } from "@/lib/tours/guide/maps";
import { meetingPointOf, meetingTimeLabel } from "@/lib/tours/guide/meeting";
import { distanceToSegmentM, GUIDE_PLACE_COLUMNS, GUIDE_PLACE_KINDS, placeOpenStatus, placePoint, priceLabel, sortByDistance, toGuidePlace, type GuidePlace, type GuidePlaceKind } from "@/lib/tours/guide/places";
import { addCard, resolvePlace, type ToolContext } from "@/lib/tours/assistant/tools";

/**
 * The local-guide tools: where to eat and stay, how to get somewhere and
 * what it costs, what a trip will cost, and where a tour meets. They read
 * the Tourism Office directory (tours_guide_places, tours_fares) and never
 * make up a place, a fare or a price: unknown amounts say "ask locally".
 */

export type PlaceCard = {
  type: "place";
  name: string;
  kind: string;
  area: string | null;
  price: string | null;
  status: string | null;
  distance: string | null;
  verified: boolean;
  note: string | null;
  directionsHref: string;
  mapHref: string;
};
export type CostCard = {
  type: "cost";
  title: string;
  lines: Array<{ label: string; amount: string; note: string }>;
  total: string;
  perPerson: string;
  unknown: string[];
};
export type TransportCard = {
  type: "transport";
  title: string;
  options: Array<{
    time: string | null;
    legs: Array<{ mode: string; from: string; to: string; fare: string | null; time: string | null; note: string | null; verified: boolean; boardHref: string }>;
  }>;
};

const NEAR_ME = /^(me|my location|here|near me|current location|dito)$/i;
const range = (min: number | null, max: number | null) => (min === null ? "Ask locally" : min === max ? formatPeso(min) : `${formatPeso(min)}–${formatPeso(max ?? min)}`);

async function loadPlaces(ctx: ToolContext, kinds: GuidePlaceKind[]): Promise<GuidePlace[]> {
  const { data, error } = await ctx.supabase.from("tours_guide_places").select(GUIDE_PLACE_COLUMNS).eq("is_active", true).in("kind", kinds).limit(200);
  if (error) throw new Error("places");
  return (data ?? []).map((row) => toGuidePlace(row as Record<string, unknown>));
}

async function loadFares(ctx: ToolContext): Promise<Fare[]> {
  const { data, error } = await ctx.supabase.from("tours_fares").select(FARE_COLUMNS).eq("is_active", true).limit(300);
  if (error) throw new Error("fares");
  return (data ?? []).map((row) => toFare(row as Record<string, unknown>));
}

/** Where "near X" is: the traveller's shared location, a guide place, a listed attraction or a town. */
async function resolveNear(ctx: ToolContext, near: string | null | undefined, places: GuidePlace[]): Promise<{ name: string; point: LatLng } | null> {
  const text = (near ?? "").trim();
  if (!text) return null;
  if (NEAR_ME.test(text)) return ctx.here ? { name: "your location", point: ctx.here } : null;
  const lower = text.toLowerCase();
  const listed = places.find((p) => p.name.toLowerCase().includes(lower) && placePoint(p));
  if (listed) return { name: text, point: placePoint(listed)! };
  return resolvePlace(ctx, text);
}

export function placeCard(place: GuidePlace & { distanceM?: number | null }, mode: MapsMode = "driving"): PlaceCard {
  const target = { name: place.name, point: placePoint(place), area: place.municipality };
  const status = placeOpenStatus(place);
  const extras = [place.specialties.length ? `Known for ${place.specialties.join(", ")}` : null, place.description].filter(Boolean);
  return {
    type: "place",
    name: place.name,
    kind: GUIDE_PLACE_KINDS[place.kind],
    area: place.address ?? place.municipality,
    price: priceLabel(place, formatPeso),
    status: status.state === "unknown" ? null : status.label,
    distance: place.distanceM != null ? formatDistance(place.distanceM) : null,
    verified: place.verified,
    note: extras.length ? extras.join(". ").slice(0, 200) : null,
    directionsHref: mapsDirectionsUrl(target, mode),
    mapHref: mapsPlaceUrl(target),
  };
}

const forModel = (p: GuidePlace & { distanceM?: number | null }) => ({
  name: p.name,
  kind: GUIDE_PLACE_KINDS[p.kind],
  area: p.address ?? p.municipality,
  price: priceLabel(p, formatPeso),
  knownFor: p.specialties,
  tags: p.tags,
  hours: placeOpenStatus(p).label,
  distance: p.distanceM != null ? formatDistance(p.distanceM) : null,
  verified: p.verified,
});

// ------------------------------------------------------------------ places

export async function findPlaces(
  ctx: ToolContext,
  input: { kind: GuidePlaceKind; near?: string | null; query?: string | null; maxPrice?: number | null; openNow?: boolean | null; limit?: number | null },
) {
  const all = await loadPlaces(ctx, [input.kind]);
  const term = (input.query ?? "").trim().toLowerCase();
  let rows = all.filter((p) => !term || [p.name, p.description ?? "", ...p.specialties, ...p.tags].some((s) => s.toLowerCase().includes(term)));
  if (typeof input.maxPrice === "number") rows = rows.filter((p) => p.price_min === null || p.price_min <= input.maxPrice!);
  if (input.openNow) rows = rows.filter((p) => placeOpenStatus(p).state !== "closed");
  const near = await resolveNear(ctx, input.near, all);
  if (input.near && NEAR_ME.test(input.near.trim()) && !ctx.here) {
    addCard(ctx, { type: "link", href: "#share-location", label: "Use my location" });
  }
  const sorted = sortByDistance(rows, near?.point ?? null).slice(0, Math.min(Math.max(input.limit ?? 5, 1), 8));
  for (const place of sorted) addCard(ctx, placeCard(place));
  return {
    kind: GUIDE_PLACE_KINDS[input.kind],
    near: near?.name ?? null,
    places: sorted.map(forModel),
    note: sorted.length === 0 ? "Nothing listed matches. Say so, and suggest asking the Tourism Office." : sorted.some((p) => !p.verified) ? "Some details are not yet verified by the Tourism Office: tell them to verify locally." : undefined,
  };
}

/** Eateries within about 2 km of the straight line between two places. */
export async function foodStops(ctx: ToolContext, input: { from: string; to: string }) {
  const eateries = await loadPlaces(ctx, ["eatery", "pasalubong"]);
  const [a, b] = await Promise.all([resolveNear(ctx, input.from, eateries), resolveNear(ctx, input.to, eateries)]);
  if (!a || !b) return { error: `I don't know where ${!a ? input.from : input.to} is.` };
  const stops = eateries
    .map((p) => ({ ...p, distanceM: placePoint(p) ? distanceToSegmentM(placePoint(p)!, a.point, b.point) : null }))
    .filter((p) => p.distanceM !== null && p.distanceM <= 2000)
    .sort((x, y) => (x.distanceM ?? 0) - (y.distanceM ?? 0))
    .slice(0, 5);
  for (const place of stops) addCard(ctx, placeCard(place));
  return {
    from: a.name,
    to: b.name,
    stops: stops.map(forModel),
    note: stops.length === 0 ? "No listed eateries along this route have a map pin yet; suggest find_places near either end." : undefined,
  };
}

// ------------------------------------------------------------------ getting there

function transportCard(title: string, routes: FareRoute[]): TransportCard {
  return {
    type: "transport",
    title,
    options: routes.slice(0, 4).map((route) => ({
      time: atLeast(minutesLabel(route.minutesMin, route.minutesMax), route.timeComplete),
      legs: route.legs.map((leg) => ({
        mode: FARE_MODES[leg.mode],
        from: leg.from_name,
        to: leg.to_name,
        fare: fareLabel(leg, formatPeso),
        time: minutesLabel(leg.minutes_min, leg.minutes_max),
        note: leg.schedule_note,
        verified: leg.verified,
        boardHref: mapsDirectionsUrl({ name: leg.from_name }, leg.mode === "boat" ? "driving" : "transit"),
      })),
    })),
  };
}

const atLeast = (label: string | null, complete: boolean) => (label && !complete ? `at least ${label}` : label);

/** Every listed way between two places, with the transport card and a Google Maps button added for the visitor. */
export async function tripRoutes(ctx: ToolContext, input: { from?: string | null; to: string }): Promise<FareRoute[]> {
  const to = (input.to ?? "").trim();
  const from = (input.from ?? "").trim() || null;
  const routes = faresBetween(await loadFares(ctx), from, to);
  if (routes.length) {
    addCard(ctx, transportCard(from ? `${from} to ${to}` : `Ways to ${to}`, routes));
    addCard(ctx, { type: "link", href: mapsDirectionsUrl({ name: to }, "transit"), label: `Google Maps directions to ${to}`, external: true });
  }
  return routes;
}

const pesoTotal = (lo: number | null, hi: number | null, fromOnly: boolean) =>
  lo === null ? null : fromOnly ? `from ${formatPeso(lo)}` : hi !== null && hi !== lo ? `${formatPeso(lo)}–${formatPeso(hi)}` : formatPeso(lo);

export async function howToGetThere(ctx: ToolContext, input: { from?: string | null; to: string }) {
  const to = (input.to ?? "").trim();
  if (!to) return { error: "Say where you want to go." };
  const from = (input.from ?? "").trim() || null;
  const routes = await tripRoutes(ctx, { from, to });
  if (!routes.length) {
    addCard(ctx, { type: "link", href: mapsDirectionsUrl({ name: to }, "transit"), label: `Google Maps directions to ${to}`, external: true });
  }
  const checked = routes.flatMap((r) => r.legs.map((l) => l.checked_on)).sort()[0] ?? null;
  return {
    routes: routes.slice(0, 4).map((r) => ({
      totalTime: atLeast(minutesLabel(r.minutesMin, r.minutesMax), r.timeComplete),
      totalPerPerson: pesoTotal(r.perPersonMin, r.perPersonMax, r.perPersonFromOnly),
      sharedCosts: r.sharedLegs.map((l) => `${FARE_MODES[l.mode]} ${l.from_name} to ${l.to_name}: ${fareLabel(l, formatPeso) ?? "ask locally"}`),
      legs: r.legs.map((l) => ({ how: FARE_MODES[l.mode], from: l.from_name, to: l.to_name, fare: fareLabel(l, formatPeso) ?? "ask locally", time: minutesLabel(l.minutes_min, l.minutes_max), tip: l.schedule_note, source: l.source, verified: l.verified })),
    })),
    faresCheckedOn: checked,
    note:
      routes.length === 0
        ? "No fares listed for this route. Say so plainly, suggest getting to Manila or Naga first (then bus or van to Daet), use travel_time for a drive, and suggest the Tourism Office."
        : "These are estimates from public listings, not quotes, and none is verified unless verified is true. Always say so and tell them to confirm with the operator before travelling; agree on tricycle fares before riding.",
  };
}

// ------------------------------------------------------------------ cost

export async function estimateCost(
  ctx: ToolContext,
  input: { to?: string | null; from?: string | null; packageId?: string | null; people: number; nights: number; style?: CostStyle | null },
) {
  const [fares, places] = await Promise.all([loadFares(ctx), loadPlaces(ctx, ["eatery", "lodging"])]);
  const to = (input.to ?? "").trim();
  const from = (input.from ?? "").trim() || null;
  const route = to ? faresBetween(fares, from, to)[0] : undefined;

  let tour: { title: string; price: number; perPerson: boolean } | null = null;
  if (input.packageId && /^[0-9a-f-]{36}$/i.test(input.packageId)) {
    const { data } = await ctx.supabase
      .from("tours_packages")
      .select("title, tours_package_price_variants(price_per_pax, flat_price, is_default)")
      .eq("id", input.packageId)
      .eq("status", "published")
      .maybeSingle();
    const variants = ((data?.tours_package_price_variants ?? []) as Array<{ price_per_pax: number | string | null; flat_price: number | string | null; is_default: boolean | null }>);
    const pick = variants.find((v) => v.is_default) ?? variants[0];
    if (data && pick) {
      const perPax = pick.price_per_pax !== null ? Number(pick.price_per_pax) : null;
      tour = { title: data.title as string, price: perPax ?? Number(pick.flat_price), perPerson: perPax !== null };
    }
  }

  const estimate = estimateTripCost({
    people: input.people,
    nights: input.nights,
    style: input.style ?? "mid",
    legs: tour ? [] : route?.legs ?? [],
    tour,
    eateries: places.filter((p) => p.kind === "eatery"),
    lodgings: places.filter((p) => p.kind === "lodging"),
    format: formatPeso,
  });
  const title = `${estimate.people} ${estimate.people === 1 ? "person" : "people"}, ${estimate.nights ? `${estimate.nights} ${estimate.nights === 1 ? "night" : "nights"}` : "day trip"}${to ? `, ${to}` : ""}`;
  addCard(ctx, {
    type: "cost",
    title,
    lines: estimate.lines.map((l) => ({ label: l.label, amount: range(l.min, l.max), note: l.note })),
    total: range(estimate.totalMin, estimate.totalMax),
    perPerson: range(estimate.perPersonMin, estimate.perPersonMax),
    unknown: estimate.unknown,
  });
  return {
    estimate: { lines: estimate.lines.map((l) => ({ item: l.label, amount: range(l.min, l.max), how: l.note })), total: range(estimate.totalMin, estimate.totalMax), perPerson: range(estimate.perPersonMin, estimate.perPersonMax) },
    unknown: estimate.unknown,
    note: [
      "This is an estimate from listed prices, not a quote.",
      estimate.unknown.length ? `No prices on record for: ${estimate.unknown.join(", ")}; the total leaves them out, so say to ask locally.` : null,
      !route && to && !tour ? "No fares listed to that place; transport is not included." : null,
    ].filter(Boolean).join(" "),
  };
}

// ------------------------------------------------------------------ meeting point

export async function meetingPoint(ctx: ToolContext, input: { packageId?: string | null; bookingReference?: string | null }) {
  let packageId = input.packageId && /^[0-9a-f-]{36}$/i.test(input.packageId) ? input.packageId : null;
  let tourDate: string | null = null;
  const ref = (input.bookingReference ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!packageId) {
    if (!ctx.userId) return { signedIn: false, note: "Ask them to sign in, or name the tour, to find its meeting point." };
    let query = ctx.supabase.from("tours_bookings").select("package_id, tour_date, booking_reference").eq("user_id", ctx.userId).in("status", ["pending", "confirmed"]).gte("tour_date", ctx.today).order("tour_date").limit(1);
    if (ref) query = query.eq("booking_reference", ref);
    const { data } = await query;
    const booking = data?.[0] as { package_id: string; tour_date: string } | undefined;
    if (!booking) return { note: ref ? "No upcoming booking of theirs has that reference." : "They have no upcoming bookings." };
    packageId = booking.package_id;
    tourDate = booking.tour_date;
  }
  const { data: pkg } = await ctx.supabase
    .from("tours_packages")
    .select("title, location_name, meeting_point_name, meeting_lat, meeting_lng, meeting_time, tours_package_stops(location_name, stop_order, latitude, longitude)")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg) return { error: "That tour could not be found." };
  const stops = ((pkg.tours_package_stops ?? []) as Array<{ location_name: string; stop_order: number; latitude: number | string | null; longitude: number | string | null }>).map((s) => ({
    location_name: s.location_name,
    stop_order: s.stop_order,
    lat: s.latitude === null ? null : Number(s.latitude),
    lng: s.longitude === null ? null : Number(s.longitude),
  }));
  const meeting = meetingPointOf(pkg as Parameters<typeof meetingPointOf>[0], stops);
  const time = meetingTimeLabel(meeting.time);
  const target = { name: meeting.name, point: meeting.point, area: pkg.location_name as string };
  addCard(ctx, {
    type: "place",
    name: meeting.name,
    kind: "Meeting point",
    area: pkg.title as string,
    price: null,
    status: time ? `Meet at ${time}${tourDate ? ` on ${tourDate}` : ""}` : tourDate ? `Tour day: ${tourDate}` : null,
    distance: null,
    verified: !meeting.fromStop,
    note: meeting.fromStop ? "The operator hasn't set a separate meeting point; this is the tour's first stop. Confirm with the operator." : null,
    directionsHref: mapsDirectionsUrl(target),
    mapHref: mapsPlaceUrl(target),
  });
  return { tour: pkg.title, meetingPoint: meeting.name, time, date: tourDate, fromFirstStop: meeting.fromStop };
}
