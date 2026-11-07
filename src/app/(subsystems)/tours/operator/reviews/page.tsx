import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { RatingBadge, Stars } from "@/components/tours/star-rating";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toSummary } from "@/lib/tours/reviews";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { ReplyForm } from "./reply-form";

export const metadata = { title: "Reviews" };

const date = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

export default async function OperatorReviewsPage() {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/reviews")}`);

  const supabase = await createSupabaseServerClient();
  const { data: operator } = session.role === "operator"
    ? await supabase.from("tours_operators").select("id, business_name").eq("profile_id", session.user.id).maybeSingle()
    : { data: null };
  if (!operator) {
    return (
      <PageFrame>
        <Notice variant="error" title="Operator access required">Only tour operators can view their reviews.</Notice>
      </PageFrame>
    );
  }

  const [{ data: reviews, error }, { data: ratingRow }] = await Promise.all([
    supabase
      .from("tours_reviews")
      .select("id, rating, comment, created_at, operator_reply, replied_at, is_hidden, tours_packages(title), tours_bookings(booking_reference, tour_date)")
      .eq("operator_id", operator.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("tours_operator_ratings").select("review_count, average_rating").eq("operator_id", operator.id).maybeSingle(),
  ]);
  const rows = reviews ?? [];
  const awaiting = rows.filter((r) => !r.operator_reply && !r.is_hidden).length;

  return (
    <PageFrame>
      <div className="mb-6">
        <Link href="/tours/operator/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest dark:text-blue-300 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="display-2 text-daet-ink">Reviews</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-daet-ink/65">
          <RatingBadge summary={toSummary(ratingRow)} />
          {awaiting > 0 ? <Badge tone="warning">{awaiting} without a reply</Badge> : null}
        </div>
      </div>

      {error ? <Notice variant="error" className="mb-4">Reviews could not be loaded.</Notice> : null}

      {rows.length === 0 ? (
        <EmptyState icon={<LineIcon name="star" />} title="No reviews yet" description="Travellers can review a tour once you mark their booking as completed." />
      ) : (
        <ul className="space-y-4">
          {rows.map((review) => {
            const pkg = Array.isArray(review.tours_packages) ? review.tours_packages[0] : review.tours_packages;
            const booking = Array.isArray(review.tours_bookings) ? review.tours_bookings[0] : review.tours_bookings;
            return (
              <li key={review.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-daet-ink">{pkg?.title ?? "Tour"}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {booking?.booking_reference} · reviewed {date(review.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {review.is_hidden ? <Badge tone="danger">Hidden by Tourism Office</Badge> : null}
                      <Stars value={review.rating} />
                    </div>
                  </div>
                  {review.comment ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-daet-ink/80">{review.comment}</p> : <p className="mt-3 text-sm italic text-daet-ink/70">No comment, rating only.</p>}
                  {review.operator_reply ? (
                    <div className="mt-3 rounded-2xl bg-daet-sand/50 p-3 text-sm">
                      <p className="text-sm text-slate-600 dark:text-slate-400">Your reply{review.replied_at ? ` · ${date(review.replied_at)}` : ""}</p>
                      <p className="mt-1 whitespace-pre-line text-daet-ink/80">{review.operator_reply}</p>
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <ReplyForm reviewId={review.id} current={review.operator_reply} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PageFrame>
  );
}
