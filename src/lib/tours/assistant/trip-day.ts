import { formatDistance, haversineMeters, type LatLng } from "@/lib/maps/geo";
import { ATTRACTION_CATEGORIES, ATTRACTION_COLUMNS, toAttraction } from "@/lib/tours/attractions";
import { emergencyAnswer, loadEmergencyContacts, NATIONAL_HOTLINE, pickContacts } from "@/lib/tours/emergency/contacts";
import { GUIDE_PLACE_COLUMNS, GUIDE_PLACE_KINDS, toGuidePlace } from "@/lib/tours/guide/places";
import { openStatus } from "@/lib/tours/opening-hours";
import { addDays } from "@/lib/tours/itinerary/types";
import { addCard, type ToolContext } from "@/lib/tours/assistant/tools";

/**
 * Trip-day answers (part 3 of the build plan, docs/TRIP_PLANNER.md):
 * emergency numbers (decisions 22, 32), "is my tour on today?" (12, 30) and
 * what's open near me now (21, 31).
 */

/** Police, rescue, hospital, coast guard: 911 first, then the Tourism Office's list. */
export async function emergencyNumbers(ctx: ToolContext, question = "") {
  // The numbers for what they need and where they are come first (a drowning → Coast Guard, "Mercedes" → Mercedes).
  const contacts = pickContacts(await loadEmergencyContacts(ctx.supabase), question);
  addCard(ctx, { type: "link", href: `tel:${NATIONAL_HOTLINE}`, label: `Call ${NATIONAL_HOTLINE}` });
  for (const c of contacts.slice(0, 4)) addCard(ctx, { type: "link", href: `tel:${c.phone.replace(/[^0-9+]/g, "")}`, label: `Call ${c.label}` });
  return {
    answer: emergencyAnswer(contacts),
    hotline: NATIONAL_HOTLINE,
    contacts: contacts.map((c) => ({ name: c.label, phone: c.phone, area: c.area, checkedOn: c.checked_on })),
  };
}

type BookingRow = {
  booking_reference: string;
  tour_date: string;
  status: string;
  called_off_at: string | null;
  called_off_reason: string | null;
  call_off_resolution: string | null;
  tours_packages: { title: string | null } | Array<{ title: string | null }> | null;
};

const titleOf = (row: BookingRow) => (Array.isArray(row.tours_packages) ? row.tours_packages[0]?.title : row.tours_packages?.title) ?? "your tour";

/** The signed-in tourist's tours today and tomorrow, with any call-off. */
export async function tourToday(ctx: ToolContext) {
  if (!ctx.userId) return { signedIn: false as const, answer: "Sign in to see whether your tour is on. Your bookings are in your account." };
  const tomorrow = addDays(ctx.today, 1);
  const { data, error } = await ctx.supabase
    .from("tours_bookings")
    .select("booking_reference, tour_date, status, called_off_at, called_off_reason, call_off_resolution, tours_packages(title)")
    .eq("user_id", ctx.userId)
    .gte("tour_date", ctx.today)
    .lte("tour_date", tomorrow)
    .order("tour_date");
  if (error) return { signedIn: true as const, answer: "Your bookings could not be loaded right now. Please try again, or call your operator." };
  const rows = (data ?? []) as BookingRow[];
  if (!rows.length) {
    addCard(ctx, { type: "link", href: "/tours/my-bookings", label: "My bookings" });
    return { signedIn: true as const, answer: "You have no tour booked for today or tomorrow. Your other bookings are in My bookings." };
  }
  const lines = rows.map((row) => {
    const when = row.tour_date === ctx.today ? "today" : "tomorrow";
    const ref = row.booking_reference.toUpperCase();
    if (row.called_off_at) {
      const next = row.call_off_resolution === "rescheduled" ? "You moved it to a new date." : row.call_off_resolution === "refund_requested" ? "Your full refund is requested." : "Pick a new date or a full refund in My bookings.";
      return `${titleOf(row)} ${when} (${ref}) was called off by the operator${row.called_off_reason ? `: ${row.called_off_reason}` : ""}. ${next}`;
    }
    if (row.status === "cancelled") return `${titleOf(row)} ${when} (${ref}) is cancelled.`;
    if (row.status === "confirmed" || row.status === "completed") return `${titleOf(row)} ${when} (${ref}) is on. The operator has not called it off. If the weather turns, they will tell you here.`;
    return `${titleOf(row)} ${when} (${ref}) is not confirmed yet; the operator still has to accept it.`;
  });
  addCard(ctx, { type: "link", href: "/tours/my-bookings", label: "My bookings" });
  return { signedIn: true as const, answer: lines.join(" ") };
}

export const NEAR_RADIUS_M = 3000;
export const NEAR_LIMIT = 5;

type Nearby = { name: string; kind: string; meters: number; state: "open" | "unknown"; href: string | null };

/** Open places within 3 km, closest first; places with no hours come after, marked "Check before you go". */
export async function openNearMe(ctx: ToolContext, at: Date = new Date()) {
  if (!ctx.here) {
    addCard(ctx, { type: "link", href: "#share-location", label: "Use my location" });
    return { needsLocation: true as const, answer: "Tap Use my location so I can see what's open near you, or tell me which town you're in." };
  }
  const here: LatLng = ctx.here;
  const [attractions, places] = await Promise.all([
    ctx.supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("is_active", true).limit(300),
    ctx.supabase.from("tours_guide_places").select(GUIDE_PLACE_COLUMNS).eq("is_active", true).limit(300),
  ]);
  const found: Nearby[] = [];
  for (const row of attractions.data ?? []) {
    const a = toAttraction(row as Record<string, unknown>);
    if (a.latitude === null || a.longitude === null) continue;
    const state = openStatus(a.opening_hours, at).state;
    if (state === "closed") continue;
    found.push({ name: a.name, kind: ATTRACTION_CATEGORIES[a.category] ?? "Place", meters: haversineMeters(here, { lat: a.latitude, lng: a.longitude }), state, href: `/tours/attractions/${a.slug}` });
  }
  for (const row of places.data ?? []) {
    const p = toGuidePlace(row as Record<string, unknown>);
    if (p.latitude === null || p.longitude === null) continue;
    const state = openStatus(p.opening_hours, at).state;
    if (state === "closed") continue;
    found.push({ name: p.name, kind: GUIDE_PLACE_KINDS[p.kind], meters: haversineMeters(here, { lat: p.latitude, lng: p.longitude }), state, href: null });
  }
  const pick = found
    .filter((f) => f.meters <= NEAR_RADIUS_M)
    .sort((a, b) => (a.state === b.state ? a.meters - b.meters : a.state === "open" ? -1 : 1))
    .slice(0, NEAR_LIMIT);
  for (const p of pick) if (p.href) addCard(ctx, { type: "link", href: p.href, label: p.name });
  if (!pick.length) return { needsLocation: false as const, places: [], answer: "Nothing listed within 3 km is open right now. Try a bigger town nearby, or ask me about a place." };
  const line = (p: Nearby) => `${p.name} (${p.kind}, ${formatDistance(p.meters)})${p.state === "unknown" ? ", check before you go" : ""}`;
  const open = pick.filter((p) => p.state === "open");
  const unknown = pick.filter((p) => p.state === "unknown");
  return {
    needsLocation: false as const,
    places: pick.map((p) => ({ name: p.name, kind: p.kind, distance: formatDistance(p.meters), open: p.state === "open" ? "open now" : "hours not listed" })),
    answer: [open.length ? `Open now near you: ${open.map(line).join("; ")}.` : "", unknown.length ? `Hours not listed, so check before you go: ${unknown.map(line).join("; ")}.` : ""].filter(Boolean).join(" "),
  };
}
