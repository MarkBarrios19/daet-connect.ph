import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { EventForm } from "../event-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New event" };

export default async function NewEventPage() {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/events/new" />;

  const { data: attractions } = await admin.supabase.from("tours_attractions").select("id, name").eq("is_active", true).order("name");

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="New event" backHref="/tours/admin/events" backLabel="All events" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <EventForm attractions={attractions ?? []} />
        </div>
      </div>
    </PageFrame>
  );
}
