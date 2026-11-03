import Image from "next/image";
import { PHOTOS } from "@/lib/photo-credits";
import { matchPlacePhoto } from "@/lib/tours/trip-board";
import { CategoryIcon, LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RouteMap } from "@/components/maps/route-map";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { placeMapsUrl } from "@/lib/tours/guide/maps";
import { ATTRACTION_CATEGORIES, ATTRACTION_COLUMNS, toAttraction } from "@/lib/tours/attractions";
import { describeHours, openStatus } from "@/lib/tours/opening-hours";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("slug", slug).eq("is_active", true).maybeSingle();
  return data ? toAttraction(data as Record<string, unknown>) : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const attraction = await load((await params).slug);
  return attraction ? { title: attraction.name, description: attraction.description ?? undefined } : { title: "Attraction" };
}

export default async function AttractionPage({ params }: PageProps) {
  const attraction = await load((await params).slug);
  if (!attraction) notFound();

  const status = openStatus(attraction.opening_hours);
  const hours = describeHours(attraction.opening_hours);
  const pin = attraction.latitude !== null && attraction.longitude !== null ? { lat: attraction.latitude, lng: attraction.longitude } : null;
  // The page says the pin is approximate; the button must not then march the
  // visitor to it. Confirmed pins go to Google as coordinates, the rest by name
  // in the place's own town (owner's note, image-93).
  const directions = placeMapsUrl({
    name: attraction.name,
    municipality: attraction.municipality,
    point: pin,
    pinConfirmed: attraction.location_verified,
  });

  const photoKey = attraction.photo_url ? null : matchPlacePhoto(attraction.name);

  return (
    <PageFrame credits={photoKey ? [photoKey] : []}>
      <div className="mx-auto max-w-4xl">
        <Link href="/tours/attractions" className="inline-flex min-h-11 items-center gap-1 font-semibold text-blue-700 dark:text-blue-300 hover:underline">
          <LineIcon name="arrowRight" className="h-4 w-4 rotate-180" /> All places
        </Link>

        {attraction.photo_url || photoKey ? (
          <figure className="relative -mx-4 mt-2 aspect-[4/3] overflow-hidden bg-blue-50 dark:bg-blue-950/40 sm:mx-0 sm:aspect-[16/9] sm:rounded-2xl">
            {attraction.photo_url ? (
              <img src={attraction.photo_url} alt={attraction.name} className="h-full w-full object-cover" />
            ) : photoKey ? (
              <Image src={PHOTOS[photoKey].src} alt={PHOTOS[photoKey].alt} fill priority sizes="(min-width: 896px) 896px, 100vw" className="object-cover" />
            ) : null}
          </figure>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge tone="info">
            <CategoryIcon category={attraction.category} className="h-4 w-4" /> {ATTRACTION_CATEGORIES[attraction.category]}
          </Badge>
          <Badge tone={status.state === "open" ? "success" : "neutral"}>{status.label}</Badge>
        </div>
        <h1 className="display-2 mt-3 text-daet-ink">{attraction.name}</h1>
        <p className="mt-2 text-lg text-daet-ink/80">
          {attraction.address ?? attraction.municipality}
          {attraction.address && !attraction.address.includes(attraction.municipality) ? ` · ${attraction.municipality}` : ""}
        </p>

        {attraction.description ? <p className="mt-4 text-lg leading-relaxed text-daet-ink">{attraction.description}</p> : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <Fact label="Entrance fee" value={attraction.entrance_fee === null ? "Not listed" : attraction.entrance_fee === 0 ? "Free" : `${formatPeso(attraction.entrance_fee)}`} />
          <Fact label="Typical visit" value={attraction.dwell_minutes ? formatMinutes(attraction.dwell_minutes) : "Not listed"} />
          <Fact label="Municipality" value={attraction.municipality} />
        </dl>

        <section className="mt-10 rounded-2xl card-edge bg-surface p-5 sm:p-6">
          <h2 className="text-2xl font-semibold text-daet-ink">Opening hours</h2>
          {hours.length ? (
            <table className="mt-3 w-full">
              <tbody>
                {hours.map((line) => (
                  <tr key={line.day} className="even:bg-canvas">
                    <th scope="row" className="rounded-l-xl px-3 py-2 text-left font-bold text-daet-ink">{line.day}</th>
                    <td className="rounded-r-xl px-3 py-2 text-daet-ink">{line.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-daet-ink/80">Hours are not listed yet.</p>
          )}
          {attraction.hours_note ? <p className="mt-3 text-daet-ink">{attraction.hours_note}</p> : null}
          <p className="mt-1 text-sm text-daet-ink/75">Times are Philippine time.</p>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-2xl font-semibold text-daet-ink">Location</h2>
          {pin ? (
            <>
              <RouteMap points={[{ ...pin, label: attraction.name }]} title={`Map showing ${attraction.name}`} />
              {!attraction.location_verified ? (
                <p className="mt-2 text-sm text-daet-ink/75">Approximate pin from public sources, not yet confirmed by the Tourism Office.</p>
              ) : null}
              <a href={directions} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-6 font-bold text-white hover:bg-blue-700">
                Open in Google Maps
              </a>
            </>
          ) : (
            <Notice variant="info">The exact location is still being confirmed by the Tourism Office.</Notice>
          )}
        </section>

        <p className="mt-10 text-sm leading-6 text-daet-ink/75">
          <span className="font-bold">Source:</span> {attraction.source}
        </p>
      </div>
    </PageFrame>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl card-edge bg-surface p-4">
      <dt className="text-sm font-semibold text-daet-ink/75">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-daet-ink">{value}</dd>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
