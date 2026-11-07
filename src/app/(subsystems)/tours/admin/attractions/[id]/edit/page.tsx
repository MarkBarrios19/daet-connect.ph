import { notFound } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { ATTRACTION_COLUMNS, toAttraction } from "@/lib/tours/attractions";
import { isUuid } from "@/lib/tours/operator-access";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { AttractionForm } from "../../attraction-form";

export const metadata = { title: "Edit attraction" };

export default async function EditAttractionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next={`/tours/admin/attractions/${id}/edit`} />;
  if (!isUuid(id)) notFound();

  const { data } = await admin.supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="Edit attraction" backHref="/tours/admin/attractions" backLabel="All attractions" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <AttractionForm attraction={toAttraction(data as Record<string, unknown>)} />
        </div>
      </div>
    </PageFrame>
  );
}
