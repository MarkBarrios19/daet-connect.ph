import { notFound } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { MERCH_COLUMNS, type MerchItem } from "@/lib/tours/promo-validation";
import { MerchForm } from "../../merch-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit product" };

export default async function EditMerchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next={`/tours/admin/merch/${id}/edit`} />;

  const { data } = await admin.supabase.from("tours_merchandise").select(MERCH_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const item = data as MerchItem;

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="Edit product" backHref="/tours/admin/merch" backLabel="All products" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <MerchForm item={item} />
        </div>
      </div>
    </PageFrame>
  );
}
