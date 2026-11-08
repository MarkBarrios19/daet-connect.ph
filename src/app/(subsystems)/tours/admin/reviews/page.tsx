import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { Stars } from "@/components/tours/star-rating";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { ModerateForm } from "./moderate-form";

export const metadata = { title: "Moderate reviews" };

const date = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/reviews" />;

  const params = await searchParams;
  const filter = params.show === "hidden" ? "hidden" : params.show === "low" ? "low" : "all";
  const reviewId = typeof params.review === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.review) ? params.review : null;
  let query = admin.supabase
    .from("tours_reviews")
    .select("id, rating, comment, created_at, operator_reply, is_hidden, hidden_reason, package_id, tours_packages(title), tours_operators(business_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (reviewId) query = query.eq("id", reviewId);
  else if (filter === "hidden") query = query.eq("is_hidden", true);
  else if (filter === "low") query = query.lte("rating", 2);
  const { data, error } = await query;
  const reviews = data ?? [];

  const tabs = [
    { key: "all", label: "All" },
    { key: "low", label: "1–2 stars" },
    { key: "hidden", label: "Hidden" },
  ];

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Reviews" backHref="/tours/admin" backLabel="Admin dashboard" />
      {reviewId ? <p className="-mt-3 mb-4 text-sm text-daet-ink/70">Showing the selected review. <Link href="/tours/admin/reviews" className="font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">Show all reviews</Link></p> : null}

      <p className="mb-4 max-w-2xl text-sm text-daet-ink/65">
        Hidden reviews disappear from the public pages and no longer count toward ratings. The traveller and the operator still see them, with your reason.
      </p>

      <nav aria-label="Filter reviews" className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/tours/admin/reviews" : `/tours/admin/reviews?show=${tab.key}`}
            aria-current={filter === tab.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold ${filter === tab.key ? "bg-daet-forest text-white" : "border border-daet-ink/15 bg-surface text-daet-ink hover:bg-daet-sand"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {error ? <Notice variant="error" className="mb-4">Reviews could not be loaded.</Notice> : null}

      {reviews.length === 0 ? (
        <EmptyState icon={<LineIcon name="star" />} title="No reviews here" />
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => {
            const pkg = Array.isArray(review.tours_packages) ? review.tours_packages[0] : review.tours_packages;
            const operator = Array.isArray(review.tours_operators) ? review.tours_operators[0] : review.tours_operators;
            return (
              <li key={review.id}>
                <Card className={review.is_hidden ? "border-red-200 dark:border-red-700 bg-red-50/40 dark:bg-red-950/40" : ""}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/tours/packages/${review.package_id}#reviews`} className="font-bold text-daet-ink hover:underline">
                        {pkg?.title ?? "Tour"}
                      </Link>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {operator?.business_name} · {date(review.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {review.is_hidden ? <Badge tone="danger">Hidden</Badge> : null}
                      <Stars value={review.rating} />
                    </div>
                  </div>
                  {review.comment ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-daet-ink/80">{review.comment}</p> : <p className="mt-3 text-sm italic text-daet-ink/70">Rating only.</p>}
                  {review.operator_reply ? (
                    <p className="mt-2 rounded-2xl bg-daet-sand/50 p-3 text-sm text-daet-ink/80">
                      <span className="font-bold">Operator reply:</span> {review.operator_reply}
                    </p>
                  ) : null}
                  {review.is_hidden && review.hidden_reason ? <p className="mt-2 text-xs font-bold text-red-700 dark:text-red-300">Reason: {review.hidden_reason}</p> : null}
                  <div className="mt-3">
                    <ModerateForm reviewId={review.id} hidden={review.is_hidden} />
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
