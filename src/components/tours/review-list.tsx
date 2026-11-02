import { Stars } from "@/components/tours/star-rating";
import type { Review } from "@/lib/tours/reviews";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/** Public review cards with the operator's reply. Reviewer names are not shown. */
export function ReviewList({ reviews, operatorName, emptyText = "No reviews yet." }: { reviews: Review[]; operatorName: string; emptyText?: string }) {
  if (reviews.length === 0) return <p className="rounded-2xl card-edge bg-surface p-5 text-daet-ink/80">{emptyText}</p>;
  return (
    <ul className="space-y-4">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-2xl card-edge bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Stars value={review.rating} />
            <span className="text-sm text-daet-ink/75">Verified traveller · {date(review.created_at)}</span>
          </div>
          {review.comment ? <p className="mt-2 whitespace-pre-line leading-relaxed text-daet-ink">{review.comment}</p> : null}
          {review.operator_reply ? (
            <div className="mt-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 p-3 text-sm">
              <p className="font-bold text-daet-ink">Reply from {operatorName}</p>
              <p className="mt-1 whitespace-pre-line text-daet-ink/80">{review.operator_reply}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
