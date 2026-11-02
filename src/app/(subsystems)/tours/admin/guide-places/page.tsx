import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { CsvImportForm } from "@/components/tours/csv-import-form";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { formatPeso } from "@/lib/money";
import { PLACE_CSV_COLUMNS } from "@/lib/tours/guide/csv";
import { GUIDE_PLACE_COLUMNS, GUIDE_PLACE_KINDS, isGuidePlaceKind, priceLabel, toGuidePlace } from "@/lib/tours/guide/places";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { deleteGuidePlace, importGuidePlacesCsv } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Local guide places" };

const TEMPLATE = `${PLACE_CSV_COLUMNS.join(",")}\neatery,Example Carinderia,Daet,Vinzons Ave,,,80,150,meal,"Bicol express, laing",family,Daily 07:00-20:00,,"Home-style Bicolano food",Daet MTO 2026,,\n`;

export default async function AdminGuidePlacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/guide-places" />;

  const params = await searchParams;
  const kind = isGuidePlaceKind(params.kind) ? params.kind : null;
  let query = admin.supabase.from("tours_guide_places").select(GUIDE_PLACE_COLUMNS).order("kind").order("name").limit(500);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  const places = (data ?? []).map((row) => toGuidePlace(row as Record<string, unknown>));
  const unverified = places.filter((p) => !p.verified).length;
  const noPrice = places.filter((p) => (p.kind === "eatery" || p.kind === "lodging") && p.price_min === null && p.price_max === null).length;

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-bold transition ${active ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`;

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Local guide places" backHref="/tours/admin" backLabel="Admin dashboard" action={{ href: "/tours/admin/guide-places/new", label: "+ New place" }} />
      <p className="-mt-3 mb-6 max-w-2xl text-lg text-daet-ink">
        Where to eat, stay, catch a ride and get help. The Daet AI assistant recommends only what is listed here. Fares are on the{" "}
        <Link href="/tours/admin/fares" className="font-bold text-blue-700 dark:text-blue-300 underline">
          fares page
        </Link>
        .
      </p>

      {params.saved ? <Notice variant="success" className="mb-4">Place saved.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Place deleted.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}
      {error ? <Notice variant="error" className="mb-4">Places could not be loaded.</Notice> : null}

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Listed" value={places.length} />
        <Stat label="Not yet verified" value={unverified} />
        <Stat label="Food or stay without a price" value={noPrice} />
      </div>

      <nav aria-label="Filter by kind" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          <li>
            <Link href="/tours/admin/guide-places" aria-current={kind === null ? "page" : undefined} className={chip(kind === null)}>
              All
            </Link>
          </li>
          {Object.entries(GUIDE_PLACE_KINDS).map(([value, label]) => (
            <li key={value}>
              <Link href={`/tours/admin/guide-places?kind=${value}`} aria-current={kind === value ? "page" : undefined} className={chip(kind === value)}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {places.length === 0 ? (
        <p className="rounded-2xl card-edge bg-surface p-8 text-center text-daet-ink">No places yet. Add one or import a spreadsheet.</p>
      ) : (
        <ul className="space-y-2">
          {places.map((place) => (
            <li key={place.id} className="flex flex-col gap-3 rounded-2xl card-edge bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-bold text-daet-ink">{place.name}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {[place.municipality, priceLabel(place, formatPeso)].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="brand">{GUIDE_PLACE_KINDS[place.kind]}</Badge>
                  {place.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Verify locally</Badge>}
                  {place.latitude === null ? <Badge tone="neutral">No pin</Badge> : null}
                  {!place.is_active ? <Badge tone="neutral">Hidden</Badge> : null}
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <Link href={`/tours/admin/guide-places/${place.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-5 font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                  Edit
                </Link>
                <form action={deleteGuidePlace}>
                  <input type="hidden" name="id" value={place.id} />
                  <ConfirmSubmitButton message={`Delete "${place.name}"? This cannot be undone.`} className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 font-bold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40">
                    Delete
                  </ConfirmSubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-8">
        <h2 className="mb-3 text-xl font-bold text-daet-ink">Import from a spreadsheet</h2>
        <CsvImportForm action={importGuidePlacesCsv} columns={PLACE_CSV_COLUMNS} required="kind, name, source" template={TEMPLATE} templateName="guide-places-template.csv" />
      </Card>
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
