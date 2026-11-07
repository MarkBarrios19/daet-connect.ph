import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MERCH_SUBMISSION_COLUMNS, type MerchSubmission } from "@/lib/tours/promo-validation";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { MerchForm } from "../../../../admin/merch/merch-form";
import { saveMyMerch } from "../../actions";

export const metadata = { title: "Edit product" };

export default async function EditOperatorMerchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent(`/tours/operator/merch/${id}/edit`)}`);
  const supabase = await createSupabaseServerClient();
  // RLS returns only this operator's own submissions.
  const { data } = await supabase.from("tours_merchandise").select(MERCH_SUBMISSION_COLUMNS).eq("id", id).not("submitted_by_operator_id", "is", null).maybeSingle();
  if (!data) notFound();
  const item = data as unknown as MerchSubmission;

  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <h1 className="display-2 mb-4 text-daet-ink">Edit product</h1>
        {item.review_status === "rejected" && item.review_notes ? (
          <Notice variant="warning" title="Tourism Office feedback" className="mb-4">
            {item.review_notes}
          </Notice>
        ) : null}
        <Card>
          <MerchForm item={item} mode="operator" action={saveMyMerch} />
        </Card>
      </div>
    </PageFrame>
  );
}
