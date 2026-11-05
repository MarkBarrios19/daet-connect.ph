import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { SavedItinerary } from "@/components/tours/saved-itinerary";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowsToDays } from "@/lib/tours/itinerary/form";
import { isUuid } from "@/lib/tours/operator-access";
import { appBaseUrl } from "@/lib/tours/qr-issue";
import { deleteItinerary } from "../actions";
import { ShareControls } from "./share-controls";
import { SaveTripOffline } from "@/components/tours/save-trip-offline";
import { callOffState } from "@/lib/tours/call-off";
import { hasTicket } from "@/lib/tours/ticket";

const shortDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
import { BookEachTrip } from "@/components/planner/book-each-trip";
import { bookableForDays } from "@/lib/tours/itinerary/bookable";

/** Who the saved trip is for: the planner's travellers, else the form's group size. */
function groupFromPreferences(value: unknown): number | null {
  const prefs = (value ?? {}) as { travelers?: { adults?: unknown; children?: unknown }; groupSize?: unknown };
  const adults = Number(prefs.travelers?.adults);
  if (Number.isInteger(adults) && adults > 0) return adults + (Array.isArray(prefs.travelers?.children) ? prefs.travelers.children.length : 0);
  const size = Number(prefs.groupSize);
  return Number.isInteger(size) && size > 0 ? size : null;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Itinerary" };

export default async function ItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured() || !isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/my-itineraries/${id}`)}`);

  const { data: itinerary } = await supabase
    .from("tours_itineraries")
    .select("id, title, start_date, end_date, summary, share_token, plan_source, preferences, tours_itinerary_items ( day_number, item_order, item_kind, location_name, tip, latitude, longitude, start_time, end_time, travel_minutes, tours_attractions ( slug ) )")
    .eq("id", id)
    .eq("tourist_id", user.id)
    .maybeSingle();
  if (!itinerary) notFound();

  const rows = (itinerary.tours_itinerary_items ?? []).map((item: Record<string, unknown>) => {
    const attraction = Array.isArray(item.tours_attractions) ? item.tours_attractions[0] : item.tours_attractions;
    return { ...(item as object), attraction_slug: (attraction as { slug?: string } | null)?.slug ?? null } as Parameters<typeof rowsToDays>[0][number];
  });

  const days = rowsToDays(rows, itinerary.start_date);
  const tours = await bookableForDays(supabase, days);
  const group = groupFromPreferences(itinerary.preferences);
  // The traveller's own bookings on the trip days: their tickets, and any trip the operator called off.
  const { data: tripBookings } = itinerary.start_date
    ? await supabase
        .from("tours_bookings")
        .select("*, tours_packages ( title )")
        .eq("user_id", user.id)
        .gte("tour_date", itinerary.start_date)
        .lte("tour_date", itinerary.end_date ?? itinerary.start_date)
        .in("status", ["confirmed", "completed"])
        .order("tour_date")
    : { data: [] };
  const bookings = (tripBookings ?? []).map((b) => ({ ...b, title: (Array.isArray(b.tours_packages) ? b.tours_packages[0] : b.tours_packages)?.title ?? "Tour" }));
  const tickets = bookings.filter((b) => hasTicket(b));
  const calledOff = bookings.filter((b) => callOffState(b) === "awaiting");

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <Link href="/tours/my-itineraries" className="inline-flex min-h-11 items-center font-bold text-blue-700 dark:text-blue-300 hover:underline">
          ← My itineraries
        </Link>
        <h1 className="display-2 mt-1 text-daet-ink">{itinerary.title}</h1>
        {itinerary.summary ? <p className="mt-3 rounded-2xl card-edge bg-surface p-4 text-base leading-7 text-daet-ink">{itinerary.summary}</p> : null}
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Opening hours can change; check each place before you go.</p>

        <SaveTripOffline ticketPaths={tickets.map((t) => `/tours/bookings/${t.id}/ticket`)} />

        {calledOff.map((b) => (
          <Link key={b.id} href={`/tours/bookings/${b.id}`} className="mt-4 block rounded-2xl bg-yellow-50 p-4 text-daet-ink dark:bg-yellow-950/30">
            <span className="font-bold">{b.title} on {shortDay(b.tour_date)} is called off.</span> {b.called_off_reason} <span className="font-bold text-blue-700 underline dark:text-blue-300">Pick a new date or a full refund</span>
          </Link>
        ))}

        {tickets.length ? (
          <section aria-labelledby="trip-tickets" className="mt-6 rounded-2xl card-edge bg-surface p-4">
            <h2 id="trip-tickets" className="text-lg font-bold text-daet-ink">Your tickets for this trip</h2>
            <ul className="mt-2 space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/tours/bookings/${t.id}/ticket`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2 font-semibold text-daet-ink hover:bg-muted">
                    <span>
                      {shortDay(t.tour_date)} · {t.title}
                    </span>
                    <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Show QR</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-6">
          <SavedItinerary days={days} />
        </div>

        {tours.length ? (
          <div className="mt-6">
            <BookEachTrip packages={tours} group={group} />
          </div>
        ) : null}

        <Card className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-daet-ink">Share</h2>
          <ShareControls id={itinerary.id} title={itinerary.title} initialToken={itinerary.share_token} baseUrl={appBaseUrl()} />
        </Card>

        <form action={deleteItinerary} className="mt-6">
          <input type="hidden" name="id" value={itinerary.id} />
          <ConfirmSubmitButton message="Delete this plan? This cannot be undone." className="inline-flex min-h-11 items-center rounded-full bg-surface px-5 font-bold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40">
            Delete plan
          </ConfirmSubmitButton>
        </form>
      </div>
    </PageFrame>
  );
}
