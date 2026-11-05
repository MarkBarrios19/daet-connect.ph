import { formatPeso } from "@/lib/money";
import { notFound } from "next/navigation";
import { StopExplorer } from "@/components/tours/stop-explorer";
import { directionsUrl, formatDistance, formatDuration } from "@/lib/maps/geo";
import { planRoute, type RouteSummary } from "@/lib/maps/routes";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { PHOTOS } from "@/lib/photo-credits";
import { durationLabel, placePhoto } from "@/lib/tours/trip-board";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RatingBadge, Stars } from "@/components/tours/star-rating";
import { ReviewList } from "@/components/tours/review-list";
import { distribution, toSummary, type Review } from "@/lib/tours/reviews";
import { FREE_CANCELLATION_HOURS } from "@/lib/tours/cancellation";
import { CheckIcon, LineIcon, MapPinIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { mapsDirectionsUrl } from "@/lib/tours/guide/maps";
import { meetingPointOf, meetingTimeLabel } from "@/lib/tours/guide/meeting";
import { buildStopDetails, type AttractionRef } from "@/lib/tours/stop-details";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PackageDetailPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view package details.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // Fetch package with all details
  const { data: pkg, error } = await supabase
    .from("tours_packages")
    .select(
      `
      id,
      title,
      description,
      location_name,
      meeting_point_name,
      meeting_lat,
      meeting_lng,
      meeting_time,
      duration_value,
      duration_type,
      cover_image_url,
      status,
      created_at,
      updated_at,
      tours_package_price_variants(
        id,
        variant_name,
        price_per_pax,
        flat_price,
        min_pax,
        max_pax,
        is_default
      ),
      tours_package_inclusions(
        id,
        item_text,
        is_included
      ),
      tours_package_stops(
        id,
        location_name,
        description,
        latitude,
        longitude,
        stop_order
      ),
      tours_package_gallery(
        id,
        image_url,
        caption,
        display_order
      ),
      tours_operators(
        id,
        business_name
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Package detail error:", error);
    return (
      <PageFrame>
        <Notice variant="error" title="Could not load package">
          {error.message}
        </Notice>
      </PageFrame>
    );
  }

  if (!pkg || pkg.status !== "published") {
    notFound();
  }

  const operatorRow = Array.isArray(pkg.tours_operators) ? pkg.tours_operators[0] : pkg.tours_operators;
  const [{ data: packageRating }, { data: operatorRating }, { data: reviewRows }, { data: attractionRows }] = await Promise.all([
    supabase.from("tours_package_ratings").select("review_count, average_rating").eq("package_id", pkg.id).maybeSingle(),
    operatorRow
      ? supabase.from("tours_operator_ratings").select("review_count, average_rating").eq("operator_id", operatorRow.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("tours_reviews")
      .select("id, rating, comment, created_at, operator_reply, replied_at, is_hidden")
      .eq("package_id", pkg.id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(20),
    // Listed places, so a stop that is one gets its photo and a link (a short table).
    (pkg.tours_package_stops?.length ?? 0) > 0
      ? supabase.from("tours_attractions").select("name, slug, description, latitude, longitude, photo_url, category").eq("is_active", true)
      : Promise.resolve({ data: [] }),
  ]);
  const rating = toSummary(packageRating);
  const operatorSummary = toSummary(operatorRating);
  const reviews = (reviewRows ?? []) as Review[];

  // Get default price or first price variant
  const defaultVariant = pkg.tours_package_price_variants?.find((v: any) => v.is_default) ||
    pkg.tours_package_price_variants?.[0];
  
  const displayPrice = defaultVariant?.price_per_pax || defaultVariant?.flat_price || 0;
  const priceLabel = defaultVariant?.price_per_pax ? "per person" : "per group";

  // Sort inclusions
  const included = pkg.tours_package_inclusions?.filter((i: any) => i.is_included) || [];
  const excluded = pkg.tours_package_inclusions?.filter((i: any) => !i.is_included) || [];

  // Sort stops by stop_order (using correct column name)
  const stops = (pkg.tours_package_stops || []).sort((a: any, b: any) => a.stop_order - b.stop_order);

  // Route between stops that have a map pin (Routes API, cached; estimate as fallback).
  const pinnedStops = stops
    .map((stop: any) => ({ ...stop, lat: stop.latitude === null ? null : Number(stop.latitude), lng: stop.longitude === null ? null : Number(stop.longitude) }))
    .filter((stop: any) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && stop.lat !== null && stop.lng !== null);
  let route: RouteSummary | null = null;
  if (pinnedStops.length >= 2) {
    try {
      route = await planRoute(pinnedStops.map((stop: any) => ({ lat: stop.lat, lng: stop.lng })));
    } catch (routeError) {
      console.error("Package route error:", routeError);
    }
  }
  const mapPoints = pinnedStops.map((stop: any) => ({ lat: stop.lat, lng: stop.lng, label: stop.location_name }));
  const stopDetails = buildStopDetails(stops, (attractionRows ?? []) as AttractionRef[]);
  const routeLink = directionsUrl(mapPoints);

  // Sort gallery by display order
  const gallery = (pkg.tours_package_gallery || []).sort((a: any, b: any) => a.display_order - b.display_order);
  const fallbackKey = placePhoto(pkg.title, pkg.location_name);
  const fallback = PHOTOS[fallbackKey];
  const meeting = meetingPointOf(
    pkg,
    stops.map((stop: any) => ({ location_name: stop.location_name, stop_order: stop.stop_order, lat: stop.latitude === null ? null : Number(stop.latitude), lng: stop.longitude === null ? null : Number(stop.longitude) })),
  );
  const meetingTime = meetingTimeLabel(meeting.time);
  const meetingPoint = meetingTime ? `${meeting.name}, ${meetingTime}` : meeting.name;
  const meetingDirections = mapsDirectionsUrl({ name: meeting.name, point: meeting.point, area: pkg.location_name });
  const operatorName = operatorRow?.business_name ?? null;
  const facts: Array<[string, string]> = [
    ["Meets at", meetingPoint],
    ["Takes", durationLabel(pkg.duration_value, pkg.duration_type)],
    ["From", `${formatPeso(displayPrice)} ${priceLabel}`],
  ];

  return (
    <PageFrame credits={pkg.cover_image_url ? [] : [fallbackKey]}>
      <Link href="/tours/browse" className="inline-flex min-h-11 items-center gap-1 font-semibold text-blue-700 dark:text-blue-300 hover:underline">
        <LineIcon name="arrowRight" className="h-4 w-4 rotate-180" /> All trips
      </Link>

      {/* The trip itself, as big as the screen allows. */}
      <figure className="relative -mx-4 mt-2 aspect-[4/3] overflow-hidden bg-blue-100 dark:bg-blue-900/40 sm:mx-0 sm:aspect-[16/9] sm:rounded-2xl lg:aspect-[21/9]">
        {pkg.cover_image_url ? (
          <img src={pkg.cover_image_url} alt={pkg.title} fetchPriority="high" className="h-full w-full object-cover" />
        ) : (
          <Image src={fallback.src} alt={`${pkg.location_name}: ${fallback.alt}`} fill priority sizes="100vw" className="object-cover" />
        )}
      </figure>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
        <div className="min-w-0">
          <h1 className="display-2 text-daet-ink">{pkg.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-lg text-daet-ink">
            <span className="inline-flex items-center gap-1.5">
              <MapPinIcon className="h-5 w-5" /> {pkg.location_name}
            </span>
            <a href="#reviews" className="inline-flex min-h-11 items-center hover:underline">
              <RatingBadge summary={rating} />
            </a>
          </p>

          {/* The departure line: where to be, how long it takes, what it costs. */}
          <dl className="mt-6 grid gap-2 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-2xl card-edge bg-surface p-4">
                <dt className="text-sm font-semibold text-daet-ink/75">{label}</dt>
                <dd className="mt-1 text-lg font-bold leading-snug text-daet-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <a
            href={meetingDirections}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950/40 px-5 font-bold text-blue-700 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-[0.98]"
          >
            <LineIcon name="pin" className="h-5 w-5" /> Directions to the meeting point
            <span className="sr-only"> (opens Google Maps)</span>
          </a>

          <section aria-labelledby="about-trip" className="mt-12">
            <h2 id="about-trip" className="text-2xl font-semibold text-daet-ink sm:text-3xl">About this trip</h2>
            <p className="mt-3 max-w-2xl text-lg leading-relaxed text-daet-ink">{pkg.description || "The operator hasn't added a description yet."}</p>
          </section>

          {included.length > 0 || excluded.length > 0 ? (
            <section aria-labelledby="included" className="mt-12">
              <h2 id="included" className="text-2xl font-semibold text-daet-ink sm:text-3xl">What&apos;s included</h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {included.length > 0 ? (
                  <ul className="space-y-3">
                    {included.map((item: any) => (
                      <li key={item.id} className="flex items-start gap-3 text-lg text-daet-ink">
                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-500 text-slate-950 dark:bg-green-500/20 dark:text-green-300">
                          <CheckIcon className="h-4 w-4" />
                        </span>
                        {item.item_text}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {excluded.length > 0 ? (
                  <div>
                    <h3 className="font-bold text-daet-ink">Not included</h3>
                    <ul className="mt-3 space-y-3">
                      {excluded.map((item: any) => (
                        <li key={item.id} className="flex items-start gap-3 text-daet-ink">
                          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted-strong text-slate-800 dark:text-slate-100">
                            <LineIcon name="cancel" className="h-4 w-4" />
                          </span>
                          {item.item_text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {stops.length > 0 ? (
            <section aria-labelledby="itinerary" className="mt-12">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="itinerary" className="text-2xl font-semibold text-daet-ink sm:text-3xl">The route, stop by stop</h2>
                {route ? (
                  <p className="font-semibold text-daet-ink">
                    {route.estimated ? "About " : ""}
                    {formatDistance(route.distanceM)} · {formatDuration(route.durationS)} of travel
                  </p>
                ) : null}
              </div>
              <div className="mt-4">
                <StopExplorer stops={stopDetails} legs={route?.legs ?? []} meetingPoint={meetingPoint} title={`Route map for ${pkg.title}`} />
              </div>
              {route?.estimated ? <p className="mt-2 text-sm text-daet-ink/75">Some distances are estimated in a straight line; roads and boat crossings may differ.</p> : null}
              {routeLink ? (
                <a href={routeLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950/40 px-5 font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                  Open in Google Maps <LineIcon name="arrowRight" className="h-4 w-4" />
                </a>
              ) : null}
            </section>
          ) : null}

          {gallery.length > 0 ? (
            <section aria-labelledby="gallery" className="mt-12">
              <h2 id="gallery" className="text-2xl font-semibold text-daet-ink sm:text-3xl">Photos</h2>
              {/* On phones the strip scrolls sideways, so it takes keyboard focus to be scrolled with the arrow keys. */}
              <ul
                tabIndex={0}
                aria-label={`Photos of ${pkg.title}`}
                className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0"
              >
                {gallery.map((img: any) => (
                  <li key={img.id} className="w-[80%] shrink-0 snap-start sm:w-auto">
                    <img src={img.image_url} alt={img.caption || `Photo of ${pkg.title}`} loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />
                    {img.caption ? <p className="mt-2 text-sm text-daet-ink/80">{img.caption}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {operatorName ? (
            <section aria-labelledby="operator" className="mt-12 rounded-2xl card-edge bg-surface p-5 sm:p-6">
              <h2 id="operator" className="text-2xl font-semibold text-daet-ink">Run by {operatorName}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-daet-ink/80">
                <ShieldCheckIcon className="h-5 w-5 text-blue-600 dark:text-blue-300" /> Accredited by the Daet Tourism Office
              </p>
              {operatorSummary ? (
                <p className="mt-1 text-daet-ink/80">
                  <RatingBadge summary={operatorSummary} compact /> across all their trips
                </p>
              ) : null}
            </section>
          ) : null}

          {/* The page's own "#reviews" link would otherwise leave the heading
              under the sticky bar — the same 37px the booking card lost. */}
          <section
            id="reviews"
            aria-labelledby="reviews-title"
            className="mt-12 scroll-mt-[calc(var(--header-h)+1.5rem)]"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="reviews-title" className="text-2xl font-semibold text-daet-ink sm:text-3xl">Traveller reviews</h2>
              <p className="text-sm text-daet-ink/75">Only travellers who finished this trip can review it.</p>
            </div>
            {rating ? (
              <div className="mt-4 grid gap-6 rounded-2xl card-edge bg-surface p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
                <div className="sm:pr-4">
                  <p className="font-[family-name:var(--font-display)] text-6xl font-semibold leading-none text-daet-ink">{rating.average.toFixed(1)}</p>
                  <Stars value={rating.average} />
                  <p className="mt-1 text-sm text-daet-ink/80">
                    {rating.count} review{rating.count === 1 ? "" : "s"}
                  </p>
                </div>
                <ul className="space-y-1.5 text-sm text-daet-ink/80" aria-label="Rating breakdown (latest reviews)">
                  {distribution(reviews.map((r) => r.rating)).map((row) => (
                    <li key={row.stars} className="flex items-center gap-3">
                      <span className="w-10">{row.stars} star</span>
                      <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-yellow-500" style={{ width: `${reviews.length ? (row.count / reviews.length) * 100 : 0}%` }} />
                      </span>
                      <span className="w-6 text-right">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4">
              <ReviewList reviews={reviews} operatorName={operatorName ?? "the operator"} emptyText="No reviews yet. Be the first after your trip." />
            </div>
          </section>
        </div>

        {/* Booking panel: beside the content on wide screens, a bar at the bottom on phones. */}
        <aside aria-label="Book this trip" className="hidden lg:block">
          <div className="sticky-below-header rounded-2xl card-edge bg-surface p-6">
            <p className="text-sm font-semibold text-daet-ink/75">From</p>
            <p className="text-4xl font-bold text-daet-ink">{formatPeso(displayPrice)}</p>
            <p className="text-daet-ink/80">{priceLabel}</p>
            {pkg.tours_package_price_variants && pkg.tours_package_price_variants.length > 1 ? (
              <p className="mt-2 text-sm text-daet-ink/80">{pkg.tours_package_price_variants.length} price options</p>
            ) : null}
            <ButtonLink href={`/tours/packages/${pkg.id}/book`} size="lg" fullWidth className="mt-5">
              Book this trip
            </ButtonLink>
            <ul className="mt-6 space-y-3 text-daet-ink">
              {["Confirmed by the local operator", `Free cancellation up to ${FREE_CANCELLATION_HOURS} hours before`, "Led by an accredited local guide"].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-300" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-float)] lg:hidden print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <p className="leading-tight">
            <span className="block text-sm text-daet-ink/75">From</span>
            <span className="text-xl font-bold text-daet-ink">{formatPeso(displayPrice)}</span> <span className="text-sm text-daet-ink/75">{priceLabel}</span>
          </p>
          <ButtonLink href={`/tours/packages/${pkg.id}/book`} size="lg" className="shrink-0">
            Book this trip
          </ButtonLink>
        </div>
      </div>
      <div className="h-20 lg:hidden" aria-hidden="true" />
    </PageFrame>
  );
}
