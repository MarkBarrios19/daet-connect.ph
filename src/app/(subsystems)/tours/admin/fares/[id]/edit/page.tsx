import { notFound } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { FARE_COLUMNS, toFare } from "@/lib/tours/guide/fares";
import { isUuid } from "@/lib/tours/operator-access";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { FareForm } from "../../fare-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit fare" };

export default async function EditFarePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next={`/tours/admin/fares/${id}/edit`} />;
  if (!isUuid(id)) notFound();

  const { data } = await admin.supabase.from("tours_fares").select(FARE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="Edit fare" backHref="/tours/admin/fares" backLabel="All fares" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <FareForm fare={toFare(data as Record<string, unknown>)} />
        </div>
      </div>
    </PageFrame>
  );
}
