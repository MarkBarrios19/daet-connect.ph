import Image from "next/image";
import Link from "next/link";
import { RatingBadge } from "@/components/tours/star-rating";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import { PHOTOS } from "@/lib/photo-credits";
import type { RatingSummary } from "@/lib/tours/reviews";
import { durationLabel, fromPrice, placePhoto } from "@/lib/tours/trip-board";
import { ApproxPrice } from "@/components/ui/approx-price";

interface PackageCardProps {
  package: {
    id: string;
    title: string;
    location_name: string;
    duration_value: number;
    duration_type: string;
    cover_image_url: string | null;
    tours_package_price_variants?: Array<{
      price_per_pax: number | null;
      flat_price: number | null;
      is_default: boolean;
    }>;
  };
  rating?: RatingSummary | null;
  /**
   * The page's own heading nesting: an h2 under a page h1 (browse), an h3 under
   * a section h2 (the home page's band).
   */
  headingLevel?: 2 | 3;
}

/**
 * A trip, photo first. Tours without their own cover show a credited photo
 * of the place they visit, so there is never an empty block.
 */
export function PackageCard({ package: pkg, rating = null, headingLevel = 2 }: PackageCardProps) {
  const price = fromPrice(pkg.tours_package_price_variants);
  const fallback = PHOTOS[placePhoto(pkg.title, pkg.location_name)];
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className="hover-lift group h-full overflow-hidden rounded-2xl card-edge bg-surface active:scale-[0.99]">
      <Link href={`/tours/packages/${pkg.id}`} className="flex h-full flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-blue-100 dark:bg-blue-900/40">
          {pkg.cover_image_url ? (
            <img
              src={pkg.cover_image_url}
              alt={pkg.title}
              loading="lazy"
              decoding="async"
              className="hover-zoom h-full w-full object-cover"
            />
          ) : (
            <Image
              src={fallback.src}
              alt={`${pkg.location_name}: ${fallback.alt}`}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="hover-zoom object-cover"
            />
          )}
        </div>
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <Heading className="font-sans text-xl font-bold leading-snug tracking-normal text-daet-ink group-hover:text-blue-700 dark:group-hover:text-blue-300">{pkg.title}</Heading>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-daet-ink/80">
            <span className="inline-flex items-center gap-1">
              <LineIcon name="pin" className="h-4 w-4" /> {pkg.location_name}
            </span>
            <span className="inline-flex items-center gap-1">
              <LineIcon name="clock" className="h-4 w-4" /> {durationLabel(pkg.duration_value, pkg.duration_type)}
            </span>
          </p>
          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            {rating ? <RatingBadge summary={rating} compact /> : <span className="text-sm text-daet-ink/75">New, no reviews yet</span>}
            {price ? (
              <p className="text-right">
                <span className="block text-sm text-daet-ink/75">From</span>
                <span className="text-xl font-bold text-daet-ink">{formatPeso(price.amount)}</span>
                <span className="text-sm text-daet-ink/75"> {price.perPerson ? "/ person" : "/ group"}</span>
                <ApproxPrice pesos={price.amount} />
              </p>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
