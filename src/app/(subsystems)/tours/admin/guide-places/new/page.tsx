import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { GuidePlaceForm } from "../guide-place-form";

export const metadata = { title: "New local guide place" };

export default async function NewGuidePlacePage() {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/guide-places/new" />;

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="New place" backHref="/tours/admin/guide-places" backLabel="All places" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <GuidePlaceForm />
        </div>
      </div>
    </PageFrame>
  );
}
