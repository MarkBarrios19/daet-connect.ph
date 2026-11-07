import { notFound } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { GUIDE_PLACE_COLUMNS, toGuidePlace } from "@/lib/tours/guide/places";
import { isUuid } from "@/lib/tours/operator-access";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { GuidePlaceForm } from "../../guide-place-form";

export const metadata = { title: "Edit local guide place" };

export default async function EditGuidePlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next={`/tours/admin/guide-places/${id}/edit`} />;
  if (!isUuid(id)) notFound();

  const { data } = await admin.supabase.from("tours_guide_places").select(GUIDE_PLACE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="Edit place" backHref="/tours/admin/guide-places" backLabel="All places" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <GuidePlaceForm place={toGuidePlace(data as Record<string, unknown>)} />
        </div>
      </div>
    </PageFrame>
  );
}
