import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { FareForm } from "../fare-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New fare" };

export default async function NewFarePage() {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/fares/new" />;

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="New fare" backHref="/tours/admin/fares" backLabel="All fares" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <FareForm />
        </div>
      </div>
    </PageFrame>
  );
}
