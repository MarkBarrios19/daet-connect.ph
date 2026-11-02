import { LineIcon } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PackageCard } from "@/components/tours/package-card";
import { toSummary, type RatingSummary } from "@/lib/tours/reviews";
import { PackageFilters } from "./package-filters";
import { placePhoto } from "@/lib/tours/trip-board";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  duration?: string;
  sort?: string;
}>;

export default async function BrowsePackagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to browse tour packages.
        </Notice>
      </PageFrame>
    );
  }

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  // Build query - get packages with their price variants (using nested query for better performance)
  let query = supabase
    .from("tours_packages")
    .select(
      `
      id,
      title,
      location_name,
      duration_value,
      duration_type,
      cover_image_url,
      created_at,
      status,
      tours_package_price_variants(price_per_pax, flat_price, is_default)
    `,
    )
    .eq("status", "published");

  // Apply filters
  if (params.location) {
    query = query.ilike("location_name", `%${params.location}%`);
  }

  if (params.duration) {
    const [value, type] = params.duration.split("-");
    query = query.eq("duration_value", parseInt(value)).eq("duration_type", type);
  }

  // Apply sorting
  // Price lives on the price variants, so price sorting and price ranges are
  // applied after the fetch. Fetch a wider window then, so the page is not
  // limited to the 50 newest packages before the price rules run.
  const sortBy = params.sort || "created_at";
  const needsPriceWork = sortBy === "price" || Boolean(params.minPrice || params.maxPrice);
  query = query.order(sortBy === "price" ? "created_at" : sortBy, { ascending: sortBy === "title" });

  const { data: packages, error } = await query.limit(needsPriceWork ? 200 : 50);

  if (error) {
    console.error("Browse packages error:", error.message);
    return (
      <PageFrame>
        <div className="mx-auto max-w-7xl">
          <Notice variant="error" title="Could not load packages">
            Please try again in a moment.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const packagesWithPricing = packages || [];

  // Ratings come from a view so hidden reviews never count.
  const ratingsById = new Map<string, RatingSummary>();
  if (packagesWithPricing.length > 0) {
    const { data: ratingRows } = await supabase
      .from("tours_package_ratings")
      .select("package_id, review_count, average_rating")
      .in("package_id", packagesWithPricing.map((pkg) => pkg.id));
    for (const row of ratingRows ?? []) {
      const summary = toSummary(row);
      if (row.package_id && summary) ratingsById.set(row.package_id, summary);
    }
  }

  // Check if user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Filter by price range
  let filteredPackages = packagesWithPricing;
  if (params.minPrice || params.maxPrice) {
    const minPrice = params.minPrice ? parseFloat(params.minPrice) : 0;
    const maxPrice = params.maxPrice ? parseFloat(params.maxPrice) : Infinity;

    filteredPackages = packagesWithPricing.filter((pkg: any) => {
      const defaultVariant = pkg.tours_package_price_variants?.find((v: any) => v.is_default);
      if (!defaultVariant) return true; // Include packages without pricing
      const price = defaultVariant.price_per_pax || defaultVariant.flat_price || 0;
      return price >= minPrice && price <= maxPrice;
    });
  }

  if (sortBy === "price") {
    const priceOf = (pkg: any) => {
      const variant = pkg.tours_package_price_variants?.find((v: any) => v.is_default);
      return variant ? variant.price_per_pax || variant.flat_price || 0 : Number.POSITIVE_INFINITY;
    };
    filteredPackages = [...filteredPackages].sort((a: any, b: any) => priceOf(a) - priceOf(b));
  }
  filteredPackages = filteredPackages.slice(0, 50);

  const place = params.location?.trim();
  // Trips without their own cover show a credited place photo; credit each one used.
  const credits = [...new Set(filteredPackages.filter((pkg: any) => !pkg.cover_image_url).map((pkg: any) => placePhoto(pkg.title, pkg.location_name)))];
  return (
    <PageFrame credits={credits}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-2 text-daet-ink">{place ? `Trips in ${place}` : "Find a trip"}</h1>
          <p className="mt-2 max-w-2xl text-lg text-daet-ink">
            Small trips run by local operators, each confirmed by them and led by an accredited guide.
          </p>
        </div>
        {user ? (
          <ButtonLink href="/tours/my-bookings" variant="secondary">
            My bookings
          </ButtonLink>
        ) : null}
      </div>

      <div className="mt-6">
        <PackageFilters currentParams={params} />
      </div>

      {filteredPackages.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<LineIcon name="search" />}
          title={place ? `No trips in ${place} yet` : "No trips match these filters"}
          description="Try another place or clear the filters. New trips are added as operators are approved."
          action={<ButtonLink href="/tours/browse">Show all trips</ButtonLink>}
        />
      ) : (
        <>
          <p className="mt-6 font-semibold text-daet-ink/80" aria-live="polite">
            {filteredPackages.length} trip{filteredPackages.length !== 1 ? "s" : ""}
          </p>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {filteredPackages.map((pkg: any) => (
              <li key={pkg.id} data-reveal>
                <PackageCard package={pkg} rating={ratingsById.get(pkg.id) ?? null} />
              </li>
            ))}
          </ul>
        </>
      )}
    </PageFrame>
  );
}
