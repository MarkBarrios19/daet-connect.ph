import Link from "next/link";
import { pageNumbers } from "@/lib/tours/booking-board";

/**
 * "Showing page 2 of 6" and the page links. Numbers, not a spinner, because
 * the operator often wants the last page (the newest bookings are one tap
 * away from the first one's neighbour).
 */
export function BoardPagination({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const numbers = pageNumbers(page, pageCount);
  const link = "inline-flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-bold";

  return (
    <nav aria-label="Bookings pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl card-edge bg-surface px-4 py-3">
      <p className="text-sm text-daet-ink/80">
        Showing page <span className="font-bold text-daet-ink">{page}</span> of {pageCount}
      </p>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className={`${link} bg-canvas text-daet-ink hover:bg-muted`}>
              Previous
            </Link>
          ) : (
            <span className={`${link} text-daet-ink/40`} aria-disabled="true">
              Previous
            </span>
          )}
        </li>
        {numbers.map((value, index) =>
          value === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-daet-ink/50">
              …
            </li>
          ) : (
            <li key={value}>
              <Link
                href={href(value)}
                aria-current={value === page ? "page" : undefined}
                aria-label={`Page ${value}`}
                className={`${link} ${value === page ? "bg-blue-600 text-white" : "bg-canvas text-daet-ink hover:bg-muted"}`}
              >
                {value}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link href={href(page + 1)} rel="next" className={`${link} bg-canvas text-daet-ink hover:bg-muted`}>
              Next
            </Link>
          ) : (
            <span className={`${link} text-daet-ink/40`} aria-disabled="true">
              Next
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
