import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPeso, MERCH_CATEGORIES, MERCH_REVIEW_LABELS, MERCH_SUBMISSION_COLUMNS, type MerchSubmission } from "@/lib/tours/promo-validation";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { deleteMyMerch } from "./actions";

export const metadata = { title: "My merchandise" };

const TONE: Record<MerchSubmission["review_status"], BadgeTone> = { pending: "warning", approved: "success", rejected: "danger" };

export default async function OperatorMerchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/merch")}`);
  const supabase = await createSupabaseServerClient();
  const { data: operator } = session.role === "operator"
    ? await supabase.from("tours_operators").select("id, business_name, accreditation_status").eq("profile_id", session.user.id).maybeSingle()
    : { data: null };
  if (!operator || operator.accreditation_status !== "approved") {
    return (
      <PageFrame>
        <Notice variant="error" title="Operator access required">Only accredited tour operators can submit merchandise.</Notice>
      </PageFrame>
    );
  }

  const params = await searchParams;
  const { data } = await supabase
    .from("tours_merchandise")
    .select(MERCH_SUBMISSION_COLUMNS)
    .eq("submitted_by_operator_id", operator.id)
    .order("created_at", { ascending: false });
  const items = (data ?? []) as unknown as MerchSubmission[];

  return (
    <PageFrame>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/tours/operator/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest dark:text-blue-300 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="display-2 text-daet-ink">My merchandise</h1>
          <p className="mt-1 max-w-xl text-sm text-daet-ink/65">Sell shirts, souvenirs or pasalubong on the CONNECT-Daet merch showcase. The Tourism Office approves each product first.</p>
        </div>
        <ButtonLink href="/tours/operator/merch/new">+ Submit a product</ButtonLink>
      </div>

      {params.saved ? <Notice variant="success" className="mb-4">Sent to the Tourism Office for approval.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Product removed.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}

      {items.length === 0 ? (
        <EmptyState icon={<LineIcon name="bag" />} title="No products yet" description="Submit your first product and we'll let you know when it's approved." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 rounded-2xl card-edge bg-surface p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-daet-sand text-2xl">
                  {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true"><LineIcon name="bag" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /></span>}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[item.review_status]}>{MERCH_REVIEW_LABELS[item.review_status]}</Badge>
                    <span className="text-sm text-slate-600 dark:text-slate-400">{MERCH_CATEGORIES[item.category]}</span>
                    {item.review_status === "approved" && !item.is_active ? <span className="text-sm text-slate-600 dark:text-slate-400">· hidden by you</span> : null}
                  </div>
                  <p className="mt-1 truncate font-bold text-daet-ink">{item.name}</p>
                  <p className="text-sm text-daet-ink/70">{formatPeso(item.price) ?? "Ask seller"} · {item.seller_name}</p>
                  {item.review_status === "rejected" && item.review_notes ? (
                    <p className="mt-1 text-sm font-bold text-red-700 dark:text-red-300">Tourism Office: {item.review_notes}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                <ButtonLink href={`/tours/operator/merch/${item.id}/edit`} variant="secondary" className="flex-1 sm:flex-none">
                  Edit
                </ButtonLink>
                <form action={deleteMyMerch} className="flex-1 sm:flex-none">
                  <input type="hidden" name="id" value={item.id} />
                  <ConfirmSubmitButton
                    message={`Remove "${item.name}"? This cannot be undone.`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 text-sm font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    Remove
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
