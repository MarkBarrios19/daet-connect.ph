import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { AttractionForm } from "../attraction-form";

export const metadata = { title: "New attraction" };

export default async function NewAttractionPage() {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/attractions/new" />;

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="New attraction" backHref="/tours/admin/attractions" backLabel="All attractions" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <AttractionForm />
        </div>
      </div>
    </PageFrame>
  );
}
