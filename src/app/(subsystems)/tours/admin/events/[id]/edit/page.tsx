import { notFound } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { EVENT_COLUMNS, type TourEvent } from "@/lib/tours/promo-validation";
import { EventForm } from "../../event-form";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next={`/tours/admin/events/${id}/edit`} />;

  const { data } = await admin.supabase.from("tours_events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const event = data as TourEvent;
  const { data: attractions } = await admin.supabase.from("tours_attractions").select("id, name").eq("is_active", true).order("name");

  return (
    <PageFrame adminNav>
      <div className="mx-auto max-w-2xl">
        <AdminPageHeading title="Edit event" backHref="/tours/admin/events" backLabel="All events" />
        <div className="rounded-2xl card-edge bg-surface p-5 sm:p-8">
          <EventForm event={event} attractions={attractions ?? []} />
        </div>
      </div>
    </PageFrame>
  );
}
