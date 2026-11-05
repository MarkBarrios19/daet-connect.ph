import Image from "next/image";
import { CategoryIcon, LineIcon } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PHOTOS, type PhotoKey } from "@/lib/photo-credits";
import { matchPlacePhoto } from "@/lib/tours/trip-board";
import type { Metadata } from "next";
import Link from "next/link";
import { RouteMap } from "@/components/maps/route-map";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { SearchBox, searchTerm } from "@/components/ui/search-box";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ATTRACTION_CATEGORIES, ATTRACTION_COLUMNS, isAttractionCategory, toAttraction } from "@/lib/tours/attractions";
import { openStatus } from "@/lib/tours/opening-hours";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Attractions in Daet",
  description: "Beaches, heritage sites, islands and more around Daet, Camarines Norte.",
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_TONE = { open: "success", closed: "neutral", unknown: "neutral" } as const;

function filterHref(category: string | null, openNow: boolean, q = "") {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (openNow) params.set("open", "now");
  const query = params.toString();
  return `/tours/attractions${query ? `?${query}` : ""}`;
}

export default async function AttractionsPage({ searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to browse attractions.</Notice>
      </PageFrame>
    );
  }

  const params = await searchParams;
  const category = typeof params.category === "string" && isAttractionCategory(params.category) ? params.category : null;
  const openNow = params.open === "now";
  const q = searchTerm(params.q);

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("is_active", true).order("name");
  if (category) query = query.eq("category", category);
  if (q) query = query.or(`name.ilike.%${q}%,municipality.ilike.%${q}%,description.ilike.%${q}%`);
  const { data, error } = await query;

  const now = new Date();
  const attractions = (data ?? [])
    .map((row) => toAttraction(row as Record<string, unknown>))
    .map((attraction) => ({ ...attraction, status: openStatus(attraction.opening_hours, now) }))
    .filter((attraction) => !openNow || attraction.status.state === "open");
  const pins = attractions
    .filter((a) => a.latitude !== null && a.longitude !== null)
    .map((a) => {
      const key = a.photo_url ? null : matchPlacePhoto(a.name);
      return { lat: a.latitude!, lng: a.longitude!, label: a.name, href: `/tours/attractions/${a.slug}`, photo: a.photo_url ?? (key ? PHOTOS[key].src : undefined) };
    });

  const credits = [...new Set(attractions.filter((a) => !a.photo_url).map((a) => matchPlacePhoto(a.name)).filter((key): key is PhotoKey => key !== null))];

  return (
    <PageFrame credits={credits}>
      <h1 className="display-2 text-daet-ink">Places to visit</h1>
      <p className="mt-2 max-w-2xl text-lg text-daet-ink">
        Beaches, heritage sites and islands around Daet, with opening hours and entrance fees. Check hours before you go.
      </p>

      <SearchBox
        action="/tours/attractions"
        label="Search places"
        placeholder="Search places, e.g. Bagasbas"
        value={q}
        keep={{ category: category ?? undefined, open: openNow ? "now" : undefined }}
        className="mt-6"
      />

      <nav className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Filter places">
        <Link href={filterHref(null, openNow, q)} aria-current={!category ? "page" : undefined} className={chip(!category)}>
          All
        </Link>
        {Object.entries(ATTRACTION_CATEGORIES).map(([value, label]) => (
          <Link key={value} href={filterHref(value, openNow, q)} aria-current={category === value ? "page" : undefined} className={chip(category === value)}>
            <CategoryIcon category={value} className="h-5 w-5" />
            {label}
          </Link>
        ))}
        <Link href={filterHref(category, !openNow, q)} aria-current={openNow ? "true" : undefined} className={chip(openNow)}>
          <LineIcon name="clock" className="h-5 w-5" />
          Open now
        </Link>
      </nav>

      {error ? <Notice variant="error" className="mt-6">Places could not be loaded. Refresh to try again.</Notice> : null}

      {attractions.length === 0 && !error ? (
        <EmptyState
          className="mt-8"
          icon={<LineIcon name="pin" />}
          title={q ? `No places match "${q}"` : openNow ? "Nothing listed is open right now" : "No places listed here yet"}
          description={q ? "Check the spelling or try a shorter word." : openNow ? "Try again later or clear the filter." : "Try another kind of place."}
          action={<ButtonLink href="/tours/attractions">Show all places</ButtonLink>}
        />
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {attractions.map((attraction) => {
            const photoKey = attraction.photo_url ? null : matchPlacePhoto(attraction.name);
            return (
              <li key={attraction.id} data-reveal>
                <Link href={`/tours/attractions/${attraction.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl card-edge bg-surface transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-[0.99]">
                  <div className="relative aspect-[16/10] overflow-hidden bg-blue-50 dark:bg-blue-950/40">
                    {attraction.photo_url ? (
                      <img src={attraction.photo_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : photoKey ? (
                      <Image src={PHOTOS[photoKey].src} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-blue-600 dark:text-blue-300" aria-hidden="true">
                        <CategoryIcon category={attraction.category} className="h-14 w-14" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                    <h2 className="font-sans text-xl font-bold leading-snug tracking-normal text-daet-ink group-hover:text-blue-700 dark:group-hover:text-blue-300">{attraction.name}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-daet-ink/80">
                      <span className="inline-flex items-center gap-1">
                        <CategoryIcon category={attraction.category} className="h-4 w-4" /> {ATTRACTION_CATEGORIES[attraction.category]}
                      </span>
                      <span>{attraction.municipality}</span>
                    </p>
                    {attraction.description ? <p className="mt-2 line-clamp-3 text-daet-ink">{attraction.description}</p> : null}
                    <p className="mt-auto pt-4">
                      <Badge tone={STATUS_TONE[attraction.status.state]}>{attraction.status.label}</Badge>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pins.length > 0 ? (
        <section aria-labelledby="places-map" className="mt-16">
          <h2 id="places-map" className="text-2xl font-semibold text-daet-ink sm:text-3xl">Where they are</h2>
          <div className="mt-4 overflow-hidden rounded-2xl card-edge bg-surface">
            <RouteMap points={pins} title="Map of the listed places" />
          </div>
        </section>
      ) : null}
    </PageFrame>
  );
}

function chip(active: boolean) {
  return `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${
    active ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"
  }`;
}
