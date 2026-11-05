import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { LineIcon } from "@/components/ui/icons";
import { RouteMap } from "@/components/maps/route-map";
import { GettingThere } from "@/components/planner/plan-panel";
import { gettingThereFrom } from "@/lib/tours/assistant/plan-tool";
import { formatClock } from "@/lib/tours/itinerary/types";
import { formatPeso } from "@/lib/money";
import { ChangeWithAssistant } from "./change-with-assistant";
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

const PACE_LABEL: Record<string, string> = { relaxed: "Relaxed pace", normal: "Balanced pace", packed: "Packed pace" };
const monthDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const longDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const savedOn = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : null);
const outline = "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-500 bg-surface px-[18px] text-sm font-bold text-daet-ink hover:bg-muted disabled:opacity-60";
const shortDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
import { BookSummary } from "@/components/planner/book-each-trip";
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
    .select("id, title, start_date, end_date, summary, share_token, plan_source, preferences, created_at, tours_itinerary_items ( day_number, item_order, item_kind, location_name, tip, latitude, longitude, start_time, end_time, travel_minutes, tours_attractions ( slug, photo_url, entrance_fee ) )")
    .eq("id", id)
    .eq("tourist_id", user.id)
    .maybeSingle();
  if (!itinerary) notFound();

  // Photo and entrance fee per place, for the stop tiles.
  const extras = new Map<string, { photo: string | null; fee: number | null }>();
  const rows = (itinerary.tours_itinerary_items ?? []).map((item: Record<string, unknown>) => {
    const attraction = (Array.isArray(item.tours_attractions) ? item.tours_attractions[0] : item.tours_attractions) as { slug?: string; photo_url?: string | null; entrance_fee?: number | string | null } | null;
    const fee = attraction?.entrance_fee === null || attraction?.entrance_fee === undefined ? null : Number(attraction.entrance_fee);
    extras.set(String(item.location_name), { photo: attraction?.photo_url ?? null, fee: Number.isFinite(fee) ? fee : null });
    return { ...(item as object), attraction_slug: attraction?.slug ?? null } as Parameters<typeof rowsToDays>[0][number];
  });

  const days = rowsToDays(rows, itinerary.start_date);
  const tours = await bookableForDays(supabase, days);
  const group = groupFromPreferences(itinerary.preferences);
  const prefs = (itinerary.preferences ?? {}) as { pace?: string; origin?: string };
  const gettingThere = await gettingThereFrom({ supabase }, prefs.origin);
  // Each tour is shown on one stop: the first one on the trip it passes.
  const tripOrder = days.flatMap((d) => d.items.map((i) => i.name));
  const bookableAt = new Map<string, Array<{ title: string; price: string | null }>>();
  for (const t of tours) {
    const at = tripOrder.find((name) => t.matched.includes(name));
    if (!at) continue;
    bookableAt.set(at, [...(bookableAt.get(at) ?? []), { title: t.title, price: t.price ? `from ${formatPeso(t.price.amount)} ${t.price.perPerson ? "per person" : "per group"}` : null }]);
  }
  const points = days.flatMap((d) => d.items.flatMap((i) => (i.kind === "visit" && i.lat !== null && i.lng !== null ? [{ lat: i.lat, lng: i.lng, label: i.name }] : [])));
  const line = [
    itinerary.start_date ? (itinerary.end_date && itinerary.end_date !== itinerary.start_date ? `${monthDay(itinerary.start_date)} to ${monthDay(itinerary.end_date)}` : monthDay(itinerary.start_date)) : null,
    group ? `${group} traveler${group === 1 ? "" : "s"}` : null,
    prefs.pace ? PACE_LABEL[prefs.pace] : null,
    savedOn(itinerary.created_at) ? `Saved ${savedOn(itinerary.created_at)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
    <PageFrame bleed>
      <div className="mx-auto w-full max-w-[75rem] px-4 pb-10 pt-6 sm:px-8">
        <Link href="/tours/plan" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-blue-700 hover:underline dark:text-blue-300">
          <span aria-hidden="true">←</span> Back to the chat
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-tight text-daet-ink sm:text-[2.75rem] sm:leading-[2.875rem]">{itinerary.title}</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">{line}</p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <ChangeWithAssistant id={itinerary.id} className={outline} />
            <a href="#share" className={outline}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12v7h14v-7M12 15V4M8 8l4-4 4 4" />
              </svg>
              Share
            </a>
          </div>
        </div>
        {itinerary.summary ? <p className="mt-4 rounded-2xl bg-surface p-4 leading-7 text-daet-ink">{itinerary.summary}</p> : null}

        {calledOff.map((b) => (
          <Link key={b.id} href={`/tours/bookings/${b.id}`} className="mt-4 block rounded-2xl bg-yellow-50 p-4 text-daet-ink dark:bg-yellow-950/30">
            <span className="font-bold">{b.title} on {shortDay(b.tour_date)} is called off.</span> {b.called_off_reason} <span className="font-bold text-blue-700 underline dark:text-blue-300">Pick a new date or a full refund</span>
          </Link>
        ))}

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
          <section aria-label="Day by day" className="min-w-0 flex-1 space-y-3">
            {days.length === 0 ? <p className="rounded-2xl bg-surface p-4 text-slate-600 dark:text-slate-400">This plan has no stops.</p> : null}
            {days.map((day) => {
              const visits = day.items.filter((i) => i.kind === "visit");
              const about = visits.length > 2 ? `${visits[0].name}, ${visits[1].name} and ${visits.length - 2} more` : visits.map((v) => v.name).join(" and ");
              return (
                <article key={day.dayNumber} className="space-y-3 rounded-2xl bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h2 className="font-bold text-daet-ink">
                      Day {day.dayNumber}
                      {day.date ? ` · ${longDay(day.date)}` : ""}
                    </h2>
                    {about ? <span className="text-sm text-slate-600 dark:text-slate-400">{about}</span> : null}
                  </div>
                  {day.dayNumber === 1 && gettingThere ? (
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40">
                      <GettingThere value={gettingThere} />
                    </div>
                  ) : null}
                  <ol className="grid gap-3 sm:grid-cols-2">
                    {day.items.map((item, i) => {
                      const extra = extras.get(item.name);
                      const bookable = bookableAt.get(item.name);
                      const cost = item.kind === "lunch" ? "Lunch" : extra?.fee ? `${formatPeso(extra.fee)} entrance` : "Free, on your own";
                      return (
                        <li key={i} className="flex min-w-0 items-center gap-3">
                          {extra?.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element -- listing photos come from storage of any size
                            <img src={extra.photo} alt="" className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover" />
                          ) : (
                            <span aria-hidden="true" className="inline-flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                              <LineIcon name={item.kind === "lunch" ? "plate" : "pin"} className="h-7 w-7" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-daet-ink">
                              {item.slug ? (
                                <Link href={`/tours/attractions/${item.slug}`} className="hover:underline">
                                  {item.name}
                                </Link>
                              ) : (
                                item.name
                              )}
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">{[item.start !== null ? formatClock(item.start) : null, cost].filter(Boolean).join(" · ")}</p>
                            {bookable?.map((t) => (
                              <span key={t.title} className="mt-1 block text-sm text-daet-ink">
                                <span className="mr-1.5 inline-flex min-h-6 items-center gap-1 rounded-full bg-green-500 px-2.5 font-bold text-slate-900">
                                  <LineIcon name="check" className="h-3.5 w-3.5" /> Bookable
                                </span>
                                {t.title}
                                {t.price ? ` · ${t.price}` : ""}
                              </span>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              );
            })}
            <p className="text-sm text-slate-600 dark:text-slate-400">Opening hours can change; check each place before you go.</p>

          </section>

          <aside aria-label="Trip summary" className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:w-[24rem]">
            {points.length ? (
              <div className="overflow-hidden rounded-2xl">
                <RouteMap points={points} connect title="Map of the whole trip" />
              </div>
            ) : null}
            <BookSummary packages={tours} group={group} />
            <section id="share" aria-labelledby="share-title" className="scroll-mt-24 rounded-2xl bg-surface p-5">
              <h2 id="share-title" className="mb-3 text-lg font-bold text-daet-ink">Share</h2>
              <ShareControls id={itinerary.id} title={itinerary.title} initialToken={itinerary.share_token} baseUrl={appBaseUrl()} />
            </section>
          </aside>
        </div>

        <div className="mt-6 space-y-6 lg:max-w-[calc(100%-25.5rem)]">
          <SaveTripOffline ticketPaths={tickets.map((t) => `/tours/bookings/${t.id}/ticket`)} />

          {tickets.length ? (
            <section aria-labelledby="trip-tickets" className="rounded-2xl bg-surface p-4">
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

          <form action={deleteItinerary}>
            <input type="hidden" name="id" value={itinerary.id} />
            <ConfirmSubmitButton message="Delete this plan? This cannot be undone." className="inline-flex min-h-11 items-center rounded-full bg-surface px-5 font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40">
              Delete plan
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>
    </PageFrame>
  );
}
