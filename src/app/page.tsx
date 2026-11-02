import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { PageFrame } from "@/components/ui/page-frame";
import { EventCard } from "@/components/tours/event-card";
import { MerchCard } from "@/components/tours/merch-card";
import { PlacePanels, type PlacePanel } from "@/components/home/place-panels";
import { PlaceFan } from "@/components/home/place-fan";
import { FAN_PLACES } from "@/components/home/fan-places";
import { AskBand } from "@/components/home/ask-band";
import { GettingHere } from "@/components/home/getting-here";
import { HomeFaq } from "@/components/home/home-faq";
import { HomeMap, type MapPlace } from "@/components/home/home-map";
import { PackageCard } from "@/components/tours/package-card";
import { placePhoto } from "@/lib/tours/trip-board";
import { toSummary, type RatingSummary } from "@/lib/tours/reviews";
import { readAccreditationCounts } from "@/lib/tours/accreditation";
import { PHOTOS, type PhotoKey } from "@/lib/photo-credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, MERCH_COLUMNS, type MerchItem, type TourEvent } from "@/lib/tours/promo-validation";

const WRAP = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

// One open at a time; the copy restates what this page and the place pages already say.
const PANELS: PlacePanel[] = (
  [
    {
      photo: "calaguasBeach",
      name: "Calaguas",
      icon: "beach",
      text: "A long white-sand beach on Tinaga Island, with no roads and no hotels. Two to three hours by boat from Paracale or Vinzons.",
      href: "/tours/attractions/tinaga-island-calaguas",
      cta: "See the place",
    },
    {
      photo: "apuao",
      name: "Apuao sandbar",
      icon: "beach",
      text: "Apuao's sandbar rises out of the sea at low tide, about an hour by boat from Mercedes port.",
      href: "/tours/attractions/apuao-grande-island",
      cta: "See the place",
    },
    {
      photo: "mercedesPort",
      name: "Mercedes port",
      icon: "boat",
      text: "Where the outrigger boats leave for Apuao and the other Mercedes islands.",
      href: "/tours/browse?location=Mercedes",
      cta: "Trips from Mercedes",
    },
    {
      photo: "bagasbas",
      name: "Bagasbas Beach",
      icon: "beach",
      text: "Daet's wide, flat surf beach, ten minutes from the plaza by tricycle. Come for the sunrise waves.",
      href: "/tours/attractions/bagasbas-beach",
      cta: "See the place",
    },
    {
      photo: "rizal",
      name: "First Rizal Monument",
      icon: "heritage",
      text: "The first monument to José Rizal, raised in Daet in 1898. Start a walk of the old town here.",
      href: "/tours/attractions/first-rizal-monument",
      cta: "See the place",
    },
    {
      photo: "church",
      name: "St John the Baptist Church",
      icon: "religious",
      text: "Daet's red-roofed parish church. The town fiesta for its patron saint is on June 24.",
      href: "/tours/events",
      cta: "See what's on",
    },
  ] satisfies Array<Omit<PlacePanel, "photo"> & { photo: PhotoKey }>
).map((panel) => ({ ...panel, photo: { src: PHOTOS[panel.photo].src, alt: PHOTOS[panel.photo].alt } }));

const HOME_PHOTOS: PhotoKey[] = [
  "calaguasBeach",
  "apuao",
  "mercedesPort",
  "rizal",
  "bagasbas",
  "church",
  // The fan's own copies of the six, credited while they are placeholders.
  "calaguasHillside",
  "rizalMonumentPark",
  "daetHeritageCenter",
  "cathedralHolyTrinity",
];

/** Exactly the columns PackageCard reads. */
type PackageRow = {
  id: string;
  title: string;
  location_name: string;
  duration_value: number;
  duration_type: string;
  cover_image_url: string | null;
  tours_package_price_variants?: Array<{ price_per_pax: number | null; flat_price: number | null; is_default: boolean }>;
};

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data: { user } },
    eventsResult,
    merchResult,
    tripsResult,
    placesResult,
    countsResult,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("tours_events").select(EVENT_COLUMNS).eq("is_published", true).gte("ends_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(4),
    supabase.from("tours_merchandise").select(MERCH_COLUMNS).eq("is_active", true).eq("is_featured", true).order("created_at", { ascending: false }).limit(4),
    // Trips on the home page: the newest published ones, with the same columns
    // the browse cards use, so the two read as one list.
    supabase
      .from("tours_packages")
      .select(
        "id, title, location_name, duration_value, duration_type, cover_image_url, tours_package_price_variants(price_per_pax, flat_price, is_default)",
      )
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(3),
    // Only the places that actually have coordinates can be pinned.
    supabase
      .from("tours_attractions")
      .select("slug, name, latitude, longitude")
      .eq("is_active", true)
      .not("latitude", "is", null)
      .not("longitude", "is", null),
    // One function, two integers: anonymous readers cannot select the tables.
    supabase.rpc("tours_accreditation_counts"),
  ]);
  const upcomingEvents = (eventsResult.data ?? []) as TourEvent[];
  const featuredMerch = (merchResult.data ?? []) as MerchItem[];
  const trips = (tripsResult.data ?? []) as unknown as PackageRow[];

  // Ratings come from a view, so hidden reviews never count — the same source the
  // browse cards read.
  const ratingsById = new Map<string, RatingSummary>();
  if (trips.length > 0) {
    const { data: ratingRows } = await supabase
      .from("tours_package_ratings")
      .select("package_id, review_count, average_rating")
      .in("package_id", trips.map((trip) => trip.id));
    for (const row of ratingRows ?? []) {
      const summary = toSummary(row);
      if (row.package_id && summary) ratingsById.set(row.package_id, summary);
    }
  }

  // A trip with no cover of its own shows a credited photo of the place it goes
  // to, so the home page has to credit those too.
  const credits = [
    ...new Set<PhotoKey>([
      ...HOME_PHOTOS,
      ...trips.filter((trip) => !trip.cover_image_url).map((trip) => placePhoto(trip.title, trip.location_name)),
    ]),
  ];

  // Attractions carry their own slugs; a pin only makes sense for a place the
  // fan knows, because tapping it opens that wedge.
  const fanSlugs = new Set(FAN_PLACES.map((place) => place.slug));
  const mapPlaces: MapPlace[] = ((placesResult.data ?? []) as Array<{ slug: string; name: string; latitude: number | null; longitude: number | null }>)
    .filter((row) => fanSlugs.has(row.slug) && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))
    .map((row) => ({ slug: row.slug, name: row.name, lat: Number(row.latitude), lng: Number(row.longitude) }));

  // Null until the count function is deployed (or if it fails): the band then
  // shows a visible placeholder rather than a made-up number.
  const counts = countsResult.error ? null : readAccreditationCounts(countsResult.data);

  return (
    <PageFrame bleed credits={credits}>
      {/* First screen: six photos of Daet fanned out, the headline in the dark
          under the point they radiate from. */}
      <PlaceFan places={FAN_PLACES} mapPlaces={mapPlaces} signedIn={!!user} />

      {/* Places: one panel open at a time, the rest narrow and grey. */}
      <section aria-labelledby="home-places" className={`${WRAP} pt-16 sm:pt-24`}>
        <h2 id="home-places" data-reveal className="display-2 text-daet-ink">
          Places to start
        </h2>
        <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="mb-6 mt-3 max-w-2xl text-lg text-daet-ink sm:mb-8">
          Islands out by boat, the surf beach, and the old town where Rizal got his first monument.
        </p>
        <PlacePanels panels={PANELS} />
      </section>

      {/* Trips you can book: the newest published packages, drawn with the same
          photo-first card the browse page uses. */}
      <section aria-labelledby="home-trips" className={`${WRAP} pt-20 sm:pt-32`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="home-trips" data-reveal className="display-2 text-daet-ink">
            Trips you can book
          </h2>
          <Link href="/tours/browse" className="inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 dark:text-blue-300 hover:underline">
            All trips <LineIcon name="arrowRight" className="h-5 w-5" />
          </Link>
        </div>
        <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="mb-6 mt-3 max-w-2xl text-lg text-daet-ink">
          Every operator is verified by the Daet Tourism Office.
        </p>
        {trips.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {trips.map((trip) => (
              <li key={trip.id} data-reveal className="flex">
                <PackageCard package={trip} rating={ratingsById.get(trip.id) ?? null} headingLevel={3} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl card-edge bg-surface p-6 text-lg text-daet-ink">
            [placeholder: no trips are published yet] — <Link href="/tours/browse" className="font-bold text-blue-700 dark:text-blue-300 underline">browse the trips that are</Link>.
          </p>
        )}
      </section>

      {/* What's on: dated rows. */}
      <section aria-labelledby="home-events" className={`${WRAP} pt-20 sm:pt-32`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="home-events" data-reveal className="display-2 text-daet-ink">
            What&apos;s on in Daet
          </h2>
          <Link href="/tours/events" className="inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 dark:text-blue-300 hover:underline">
            Full calendar <LineIcon name="arrowRight" className="h-5 w-5" />
          </Link>
        </div>
        {upcomingEvents.length > 0 ? (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {upcomingEvents.map((event) => (
              <li key={event.id} data-reveal>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-2xl card-edge bg-surface p-6 text-lg text-daet-ink">
            No events are posted yet. The <Link href="/tours/events" className="font-bold text-blue-700 dark:text-blue-300 underline">calendar</Link> lists the
            festivals and seasons through the year.
          </p>
        )}
      </section>

      {/* How booking works: the page's one full-colour band. */}
      <section aria-labelledby="home-how" className="mt-20 bg-blue-600 py-16 text-white sm:mt-32 sm:py-24">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[1fr_1.4fr]`}>
          <h2 id="home-how" data-reveal className="display-2">
            Booking, in three moves
          </h2>
          <ol className="space-y-8">
            {[
              ["Pick a trip and a date.", "The meeting point, start time and cancellation terms are on the trip's page before you book."],
              ["Send your request.", "The operator confirms, then you pay by GCash, Maya or card, or upload a bank receipt."],
              ["Show your ticket QR.", "Your guide scans it at the meeting point, and the boat goes."],
            ].map(([title, text], index) => (
              <li key={title} data-reveal style={{ "--reveal-index": index } as React.CSSProperties} className="grid grid-cols-[auto_1fr] gap-4">
                <LineIcon name={(["calendar", "check", "ticket"] as const)[index]} className="mt-1 h-7 w-7" />
                <div>
                  <p className="text-2xl font-bold">{title}</p>
                  <p className="mt-1 text-lg text-blue-50">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* All on one map: only the places that have coordinates are pinned, and
          a pin opens that place in the fan at the top of the page. */}
      <section aria-labelledby="home-map" className={`${WRAP} pt-20 sm:pt-32`}>
        {/* The hero's "Open on the map" jumps here; scroll-margin keeps the
            heading clear of the sticky header when it lands. */}
        <h2 id="home-map" data-reveal className="display-2 scroll-mt-[calc(var(--header-h)+1.5rem)] text-daet-ink">
          All on one map
        </h2>
        <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="mb-6 mt-3 max-w-2xl text-lg text-daet-ink">
          {mapPlaces.length > 1
            ? "Tap a pin to see that place at the top of the page."
            : "The map grows as the Tourism Office pins each place."}
        </p>
        {mapPlaces.length > 0 ? (
          <HomeMap places={mapPlaces} />
        ) : (
          <p className="rounded-2xl card-edge bg-surface p-6 text-lg text-daet-ink">[placeholder: no place has coordinates yet]</p>
        )}
      </section>

      {/* The questions that block a booking, in the owner's two-column layout.
          Six answered ones here; the full list is on /tours/faq. */}
      <HomeFaq />

      {/* The one place the page says "just ask". */}
      <AskBand />

      {/* Who runs the tours: an ink band with the Tourism Office's own counts.
          It butts straight against the blue band above it, so the two read as
          one block instead of a strip of page showing between them. */}
      <section aria-labelledby="home-people" className="bg-slate-950 py-14 text-white sm:py-16">
        <div className={`${WRAP} flex flex-col gap-6 md:flex-row md:items-center md:justify-between`}>
          <div>
            <h2 id="home-people" data-reveal className="display-2">
              Travel with people from here
            </h2>
            <p className="mt-2 max-w-xl text-lg text-white/85">
              Operators and guides in Daet are checked by the Tourism Office before their trips go live.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-8">
            {counts ? (
              <>
                <p>
                  <span className="block text-4xl font-bold leading-none">{counts.operators}</span>
                  <span className="text-sm text-white/80">
                    {counts.operators === 1 ? "approved operator" : "approved operators"}
                  </span>
                </p>
                <p>
                  <span className="block text-4xl font-bold leading-none">{counts.guides}</span>
                  <span className="text-sm text-white/80">
                    {counts.guides === 1 ? "approved guide" : "approved guides"}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-white/70">[placeholder: approved operator and guide counts]</p>
            )}
            {/* The handoff asks for "Find a guide"; the site has no public guide
                directory yet, so this points at the trips those guides run. */}
            <ButtonLink href="/tours/browse" variant="onBlue" size="lg">
              See the trips
            </ButtonLink>
          </div>
        </div>
      </section>

      <GettingHere />

      {featuredMerch.length > 0 ? (
        <section aria-labelledby="home-merch" className={`${WRAP} pt-20 sm:pt-32`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="home-merch" data-reveal className="display-2 text-daet-ink">
              Take Daet home
            </h2>
            <Link href="/tours/merch" className="inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 dark:text-blue-300 hover:underline">
              All souvenirs <LineIcon name="arrowRight" className="h-5 w-5" />
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {featuredMerch.map((item) => (
              <li key={item.id} data-reveal className="flex">
                <MerchCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* For operators and guides: a picture of their working world, and two ways in. */}
      <section aria-labelledby="home-ops" className={`${WRAP} pt-20 sm:pt-32`}>
        <div className="grid items-center gap-8 overflow-hidden rounded-2xl card-edge bg-surface lg:grid-cols-2">
          <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[420px]">
            <Image src={PHOTOS.mercedesPort.src} alt={PHOTOS.mercedesPort.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
          <div className="px-5 pb-8 sm:px-8 lg:py-12 lg:pr-12">
            <h2 id="home-ops" data-reveal className="display-2 text-daet-ink">
              Run tours in Daet?
            </h2>
            <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="mt-4 text-lg leading-relaxed text-daet-ink">
              Apply as an operator or a local guide. The Tourism Office checks your permits and ID, then your trips go live and bookings come
              to your phone.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/tours/operator/register" size="lg">
                Apply as an operator
              </ButtonLink>
              <ButtonLink href="/tours/guide/register" size="lg" variant="secondary">
                Apply as a guide
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
