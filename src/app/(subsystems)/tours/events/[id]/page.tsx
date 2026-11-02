import { CategoryIcon } from "@/components/ui/icons";
import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { EVENT_CATEGORY_STYLES } from "@/components/tours/event-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatEventRange, toManilaDateKey } from "@/lib/tours/events-calendar";
import { EVENT_CATEGORIES, EVENT_COLUMNS, type TourEvent } from "@/lib/tours/promo-validation";
import { ATTRACTION_CATEGORIES, isAttractionCategory } from "@/lib/tours/attractions";
import { eventDayRange, toursDuringEvent, type AvailabilityWithPackage, type EventTour } from "@/lib/tours/event-tours";

export const dynamic = "force-dynamic";

async function loadEvent(id: string): Promise<TourEvent | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tours_events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  return (data as TourEvent | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const event = await loadEvent((await params).id);
  return event ? { title: event.title, description: event.description ?? undefined } : { title: "Event not found" };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) notFound();

  const dayKey = toManilaDateKey(event.starts_at);
  const isPast = Date.parse(event.ends_at) < Date.now();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue}, Daet, Camarines Norte`)}`;

  const supabase = await createSupabaseServerClient();
  const today = toManilaDateKey(new Date());
  const range = eventDayRange(event);
  const [{ data: attraction }, { data: availability }] = await Promise.all([
    event.attraction_id
      ? supabase.from("tours_attractions").select("name, slug, category, latitude, longitude").eq("id", event.attraction_id).eq("is_active", true).maybeSingle()
      : Promise.resolve({ data: null }),
    isPast
      ? Promise.resolve({ data: [] })
      : supabase
          .from("tours_package_availability")
          .select("available_date, capacity_total, capacity_booked, tours_packages!inner ( id, title, location_name, cover_image_url, status, tours_package_stops ( latitude, longitude ) )")
          .eq("tours_packages.status", "published")
          .gte("available_date", range.from > today ? range.from : today)
          .lte("available_date", range.to)
          .limit(500),
  ]);
  const near =
    attraction && attraction.latitude !== null && attraction.longitude !== null ? { lat: Number(attraction.latitude), lng: Number(attraction.longitude) } : null;
  const tours = toursDuringEvent((availability ?? []) as unknown as AvailabilityWithPackage[], range, today, near);

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <Link href={`/tours/events?month=${dayKey.slice(0, 7)}&day=${dayKey}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-blue-700 dark:text-blue-300 hover:underline">
          <LineIcon name="arrowRight" className="h-4 w-4 rotate-180" /> Back to the calendar
        </Link>

        <article className="overflow-hidden rounded-2xl card-edge bg-surface">
          {event.image_url ? (
            <div className="aspect-video bg-blue-50 dark:bg-blue-950/40">
              <img src={event.image_url} alt={event.title} className="h-full w-full object-cover" />
            </div>
          ) : (
            // No picture: the date itself, set large on the brand blue.
            <div className="flex items-end gap-4 bg-blue-600 px-5 pb-6 pt-10 text-white sm:px-8" aria-hidden="true">
              <span className="font-[family-name:var(--font-display)] text-8xl font-semibold leading-none">
                {new Date(event.starts_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", day: "numeric" })}
              </span>
              <span className="pb-2 text-2xl font-semibold">
                {new Date(event.starts_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", year: "numeric" })}
              </span>
            </div>
          )}
          <div className="p-5 sm:p-8">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${EVENT_CATEGORY_STYLES[event.category].chip}`}>
                {EVENT_CATEGORIES[event.category]}
              </span>
              {isPast ? <span className="rounded-full bg-muted-strong px-3 py-1 text-xs font-bold text-slate-900 dark:text-slate-100">This event has ended</span> : null}
            </div>
            <h1 className="display-2 mt-3 text-daet-ink">{event.title}</h1>

            <dl className="mt-5 space-y-3 text-lg">
              <div className="flex gap-3">
                <dt className="w-6 shrink-0" aria-label="When"><LineIcon name="calendar" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></dt>
                <dd className="font-semibold text-daet-ink">{formatEventRange(event.starts_at, event.ends_at)}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-6 shrink-0" aria-label="Where"><LineIcon name="pin" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></dt>
                <dd className="font-semibold text-daet-ink">{event.venue}</dd>
              </div>
              {event.organizer ? (
                <div className="flex gap-3">
                  <dt className="w-6 shrink-0" aria-label="Organizer"><LineIcon name="building" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></dt>
                  <dd className="text-daet-ink">{event.organizer}</dd>
                </div>
              ) : null}
            </dl>

            {event.description ? (
              <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-daet-ink">{event.description}</p>
            ) : null}

            {attraction ? (
              <Link href={`/tours/attractions/${attraction.slug}`} className="mt-6 flex min-h-11 items-center gap-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 p-4 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                <span className="text-blue-600 dark:text-blue-300" aria-hidden="true">
                  <CategoryIcon category={attraction.category} className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-daet-ink/75">
                    {isAttractionCategory(attraction.category) ? ATTRACTION_CATEGORIES[attraction.category] : "Attraction"}
                  </span>
                  <span className="block text-lg font-bold text-daet-ink">{attraction.name}</span>
                </span>
              </Link>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {!isPast ? (
                <a href={`/tours/events/${event.id}/calendar.ics`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-6 font-bold text-white hover:bg-blue-700">
                  Add to my calendar
                </a>
              ) : null}
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-6 font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                Open in Google Maps
              </a>
              <Link href="/tours/browse" className="inline-flex min-h-11 items-center justify-center rounded-full px-6 font-bold text-daet-ink hover:bg-muted">
                Find a trip nearby
              </Link>
            </div>
          </div>
        </article>

        {!isPast ? <EventTours tours={tours} attractionName={attraction?.name ?? null} /> : null}
      </div>
    </PageFrame>
  );
}

const shortDate = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

function EventTours({ tours, attractionName }: { tours: EventTour[]; attractionName: string | null }) {
  return (
    <section aria-labelledby="event-tours" className="mt-8">
      <h2 id="event-tours" className="text-xl font-bold text-daet-ink">
        Tours happening during this event
      </h2>
      {tours.length === 0 ? (
        <p className="mt-2 text-sm text-daet-ink/70">
          No tours have open dates during this event yet.{" "}
          <Link href="/tours/browse" className="inline-flex min-h-11 items-center font-bold text-daet-forest dark:text-blue-300 underline">
            Browse all tours
          </Link>
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {tours.map((tour) => (
            <li key={tour.id}>
              <Link href={`/tours/packages/${tour.id}`} className="flex h-full gap-3 rounded-2xl card-edge bg-surface p-3">
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-daet-forest to-daet-leaf">
                  {tour.cover_image_url ? <img src={tour.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-daet-ink">{tour.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    Open {tour.dates.slice(0, 3).map(shortDate).join(", ")}
                    {tour.dates.length > 3 ? ` +${tour.dates.length - 3} more` : ""}
                  </p>
                  {tour.nearestMeters !== null && tour.nearestMeters <= 5000 && attractionName ? (
                    <p className="mt-1 text-xs font-bold text-daet-forest dark:text-blue-300">
                      Stops {tour.nearestMeters < 1000 ? `${Math.max(50, Math.round(tour.nearestMeters / 50) * 50)} m` : `${(tour.nearestMeters / 1000).toFixed(1)} km`} from {attractionName}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
