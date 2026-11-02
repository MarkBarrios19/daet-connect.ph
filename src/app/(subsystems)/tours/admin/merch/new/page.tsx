import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { MerchForm } from "../merch-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add product" };

export default async function NewMerchPage() {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/merch/new" />;

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="Add product" backHref="/tours/admin/merch" backLabel="All products" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <MerchForm />
        </div>
      </div>
    </PageFrame>
  );
}
