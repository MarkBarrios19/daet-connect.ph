import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { formatPeso, MERCH_CATEGORIES, MERCH_REVIEW_LABELS, MERCH_SUBMISSION_COLUMNS, type MerchSubmission } from "@/lib/tours/promo-validation";
import { deleteMerch } from "./actions";
import { MerchReviewForm } from "./review-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage merchandise" };

export default async function AdminMerchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/merch" />;

  const params = await searchParams;
  const pendingOnly = params.show === "pending";
  let query = admin.supabase
    .from("tours_merchandise")
    .select(`${MERCH_SUBMISSION_COLUMNS}, tours_operators ( business_name )`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (pendingOnly) query = query.eq("review_status", "pending");
  const [{ data, error }, { count: pendingCount }] = await Promise.all([
    query,
    admin.supabase.from("tours_merchandise").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
  ]);
  const items = (data ?? []) as unknown as Array<MerchSubmission & { tours_operators: { business_name: string } | { business_name: string }[] | null }>;
  const operatorName = (item: (typeof items)[number]) => (Array.isArray(item.tours_operators) ? item.tours_operators[0]?.business_name : item.tours_operators?.business_name);

  return (
    <PageFrame adminNav>
      <AdminPageHeading
        title="Merchandise"
        backHref="/tours/admin"
        backLabel="Admin dashboard"
        action={{ href: "/tours/admin/merch/new", label: "+ Add product" }}
      />

      {params.saved ? <Notice variant="success" className="mb-4">Product saved.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Product deleted.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}
      {error ? <Notice variant="error" className="mb-4">Products could not be loaded. Has the merchandise migration been applied?</Notice> : null}

      <nav aria-label="Filter products" className="mb-4 flex flex-wrap gap-2">
        {[
          { href: "/tours/admin/merch", label: "All", active: !pendingOnly },
          { href: "/tours/admin/merch?show=pending", label: `Waiting for approval (${pendingCount ?? 0})`, active: pendingOnly },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold ${tab.active ? "bg-daet-forest text-white" : "border border-daet-ink/15 bg-surface text-daet-ink hover:bg-daet-sand"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 && !error ? (
        <div className="rounded-2xl border-dashed bg-surface p-8 text-center">
          <LineIcon name="bag" className="mx-auto h-10 w-10 text-blue-600 dark:text-blue-300" />
          <p className="mt-2 font-bold text-daet-ink">No products yet</p>
          <p className="text-sm text-daet-ink/70">Advertise local t-shirts, mugs, souvenirs and pasalubong.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 rounded-2xl card-edge bg-surface p-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-daet-sand text-2xl">
                  {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true"><LineIcon name="bag" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></span>}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-daet-sand px-2 py-0.5 text-xs font-bold text-daet-forest dark:text-blue-300">{MERCH_CATEGORIES[item.category]}</span>
                    {item.is_active ? (
                      <span className="rounded-full bg-green-50 dark:bg-green-950/40 px-2 py-0.5 text-xs font-bold text-green-700 dark:text-green-300">Visible</span>
                    ) : (
                      <span className="rounded-full bg-yellow-50 dark:bg-yellow-950/40 px-2 py-0.5 text-xs font-bold text-yellow-800 dark:text-yellow-200">Hidden</span>
                    )}
                    {item.is_featured ? <span className="rounded-full bg-yellow-100 dark:bg-yellow-900/40 px-2 py-0.5 text-xs font-bold text-yellow-800 dark:text-yellow-200">★ Featured</span> : null}
                    {item.submitted_by_operator_id ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.review_status === "pending" ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-200" : item.review_status === "rejected" ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300" : "bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300"}`}>
                        {MERCH_REVIEW_LABELS[item.review_status]} · {operatorName(item) ?? "Operator"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate font-bold text-daet-ink">{item.name}</p>
                  <p className="text-sm text-daet-ink/70">
                    {formatPeso(item.price) ?? "Ask seller"} · {item.seller_name}
                  </p>
                </div>
              </div>
              {item.submitted_by_operator_id && item.review_status === "pending" ? (
                <div className="sm:max-w-md sm:flex-1">
                  <MerchReviewForm id={item.id} />
                </div>
              ) : null}
              <div className="flex gap-2">
                <Link href={`/tours/admin/merch/${item.id}/edit`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-daet-forest/30 px-5 text-sm font-bold text-daet-leaf dark:text-blue-300 hover:bg-daet-forest/5 sm:flex-none">
                  Edit
                </Link>
                <form action={deleteMerch} className="flex-1 sm:flex-none">
                  <input type="hidden" name="id" value={item.id} />
                  <ConfirmSubmitButton
                    message={`Delete "${item.name}"? This cannot be undone.`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 text-sm font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </ConfirmSubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
