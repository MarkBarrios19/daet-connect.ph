import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { ATTRACTION_CATEGORIES, ATTRACTION_COLUMNS, toAttraction } from "@/lib/tours/attractions";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { deleteAttraction } from "./actions";
import { ImportAttractionsForm } from "./import-form";

export const metadata = { title: "Manage attractions" };

export default async function AdminAttractionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/attractions" />;

  const params = await searchParams;
  const { data, error } = await admin.supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).order("name").limit(500);
  const attractions = (data ?? []).map((row) => toAttraction(row as Record<string, unknown>));
  const missingPins = attractions.filter((a) => a.latitude === null).length;
  const unverified = attractions.filter((a) => a.latitude !== null && !a.location_verified).length;

  return (
    <PageFrame adminNav>
      <AdminPageHeading
        title="Attractions"
        backHref="/tours/admin"
        backLabel="Admin dashboard"
        action={{ href: "/tours/admin/attractions/new", label: "+ New attraction" }}
      />

      <p className="-mt-3 mb-6 text-lg text-daet-ink">
        Places to eat, stay and catch a ride are on the{" "}
        <Link href="/tours/admin/guide-places" className="font-bold text-blue-700 dark:text-blue-300 underline">
          local guide
        </Link>{" "}
        page.
      </p>

      {params.saved ? <Notice variant="success" className="mb-4">Attraction saved.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Attraction deleted.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}
      {error ? <Notice variant="error" className="mb-4">Attractions could not be loaded.</Notice> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Listed" value={attractions.length} />
        <Stat label="Without a map pin" value={missingPins} />
        <Stat label="Pins not yet confirmed" value={unverified} />
      </div>

      <Card className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-daet-ink">Import from a spreadsheet</h2>
        <ImportAttractionsForm />
      </Card>

      {attractions.length === 0 ? (
        <p className="rounded-2xl card-edge bg-surface p-8 text-center text-sm text-daet-ink/70">No attractions yet. Add one or import the Tourism Office list.</p>
      ) : (
        <ul className="divide-y divide-daet-ink/10 overflow-hidden rounded-2xl card-edge bg-surface">
          {attractions.map((attraction) => (
            <li key={attraction.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-bold text-daet-ink">{attraction.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="brand">{ATTRACTION_CATEGORIES[attraction.category]}</Badge>
                  <span className="text-daet-ink/70">{attraction.municipality}</span>
                  {!attraction.is_active ? <Badge tone="neutral">Hidden</Badge> : null}
                  {attraction.latitude === null ? <Badge tone="warning">No pin</Badge> : attraction.location_verified ? <Badge tone="success">Pin confirmed</Badge> : <Badge tone="info">Pin unconfirmed</Badge>}
                  {!attraction.opening_hours ? <Badge tone="neutral">No hours</Badge> : null}
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <Link href={`/tours/admin/attractions/${attraction.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 px-5 text-sm font-bold text-daet-leaf dark:text-blue-300 hover:bg-daet-forest/5">
                  Edit
                </Link>
                <form action={deleteAttraction}>
                  <input type="hidden" name="id" value={attraction.id} />
                  <ConfirmSubmitButton
                    message={`Delete "${attraction.name}"? This cannot be undone.`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 text-sm font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </ConfirmSubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl card-edge bg-surface p-4">
      <p className="text-3xl font-bold text-daet-ink">{value}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}
