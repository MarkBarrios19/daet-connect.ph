import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { formatEventRange } from "@/lib/tours/events-calendar";
import { EVENT_CATEGORIES, EVENT_COLUMNS, type TourEvent } from "@/lib/tours/promo-validation";
import { deleteEvent } from "./actions";

export const metadata = { title: "Manage events" };

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/events" />;

  const params = await searchParams;
  const { data, error } = await admin.supabase
    .from("tours_events")
    .select(EVENT_COLUMNS)
    .order("starts_at", { ascending: false })
    .limit(200);
  const events = (data ?? []) as TourEvent[];
  const now = Date.now();

  return (
    <PageFrame adminNav>
      <AdminPageHeading
        title="Events calendar"
        backHref="/tours/admin"
        backLabel="Admin dashboard"
        action={{ href: "/tours/admin/events/new", label: "+ New event" }}
      />

      {params.saved ? <Notice variant="success" className="mb-4">Event saved.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Event deleted.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}
      {error ? <Notice variant="error" className="mb-4">Events could not be loaded. Has the events migration been applied?</Notice> : null}

      {events.length === 0 && !error ? (
        <div className="rounded-2xl border-dashed bg-surface p-8 text-center">
          <LineIcon name="calendar" className="mx-auto h-10 w-10 text-blue-600 dark:text-blue-300" />
          <p className="mt-2 font-bold text-daet-ink">No events yet</p>
          <p className="text-sm text-daet-ink/70">Add festivals, cultural shows and markets for tourists to discover.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => {
            const isPast = Date.parse(event.ends_at) < now;
            return (
              <li key={event.id} className="flex flex-col gap-3 rounded-2xl card-edge bg-surface p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-daet-sand px-2 py-0.5 text-xs font-bold text-daet-forest dark:text-blue-300">{EVENT_CATEGORIES[event.category]}</span>
                    {event.is_published ? (
                      <span className="rounded-full bg-green-50 dark:bg-green-950/40 px-2 py-0.5 text-xs font-bold text-green-700 dark:text-green-300">Published</span>
                    ) : (
                      <span className="rounded-full bg-yellow-50 dark:bg-yellow-950/40 px-2 py-0.5 text-xs font-bold text-yellow-800 dark:text-yellow-200">Draft</span>
                    )}
                    {isPast ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-slate-600 dark:text-slate-400">Past</span> : null}
                  </div>
                  <p className="mt-1 truncate font-bold text-daet-ink">{event.title}</p>
                  <p className="text-sm text-daet-ink/70">{formatEventRange(event.starts_at, event.ends_at)} · {event.venue}</p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/tours/admin/events/${event.id}/edit`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-daet-forest/30 px-5 text-sm font-bold text-daet-leaf dark:text-blue-300 hover:bg-daet-forest/5 sm:flex-none">
                    Edit
                  </Link>
                  <form action={deleteEvent} className="flex-1 sm:flex-none">
                    <input type="hidden" name="id" value={event.id} />
                    <ConfirmSubmitButton
                      message={`Delete "${event.title}"? This cannot be undone.`}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 text-sm font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageFrame>
  );
}
