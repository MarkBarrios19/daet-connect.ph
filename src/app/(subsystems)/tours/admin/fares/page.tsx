import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { CsvImportForm } from "@/components/tours/csv-import-form";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { formatPeso } from "@/lib/money";
import { FARE_CSV_COLUMNS } from "@/lib/tours/guide/csv";
import { FARE_COLUMNS, FARE_MODES, fareLabel, minutesLabel, toFare } from "@/lib/tours/guide/fares";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { deleteFare, importFaresCsv } from "./actions";

export const metadata = { title: "Fares and travel times" };

const TEMPLATE = `${FARE_CSV_COLUMNS.join(",")}\ntricycle,Daet town center,Bagasbas,30,30,person,10,15,"Agree on the fare first",Daet MTO 2026,\n`;

export default async function AdminFaresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/fares" />;

  const params = await searchParams;
  const { data, error } = await admin.supabase.from("tours_fares").select(FARE_COLUMNS).order("from_name").order("to_name").limit(500);
  const fares = (data ?? []).map((row) => toFare(row as Record<string, unknown>));

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Fares and travel times" backHref="/tours/admin/guide-places" backLabel="Local guide places" action={{ href: "/tours/admin/fares/new", label: "+ New fare" }} />
      <p className="-mt-3 mb-6 max-w-2xl text-lg text-daet-ink">
        What a ride costs and how long it takes. The Daet AI assistant uses these for directions and trip cost estimates, and joins routes that share a stop (Manila → Daet → Bagasbas).
      </p>

      {params.saved ? <Notice variant="success" className="mb-4">Fare saved.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Fare deleted.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}
      {error ? <Notice variant="error" className="mb-4">Fares could not be loaded.</Notice> : null}

      {fares.length === 0 ? (
        <p className="rounded-2xl card-edge bg-surface p-8 text-center text-daet-ink">No fares yet. Add one or import a spreadsheet.</p>
      ) : (
        <ul className="space-y-2">
          {fares.map((fare) => (
            <li key={fare.id} className="flex flex-col gap-3 rounded-2xl card-edge bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-bold text-daet-ink">
                  {fare.from_name} to {fare.to_name}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {[FARE_MODES[fare.mode], fareLabel(fare, formatPeso) ?? "Fare unknown", minutesLabel(fare.minutes_min, fare.minutes_max)].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {fare.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Verify locally</Badge>}
                  {!fare.is_active ? <Badge tone="neutral">Hidden</Badge> : null}
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <Link href={`/tours/admin/fares/${fare.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-5 font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                  Edit
                </Link>
                <form action={deleteFare}>
                  <input type="hidden" name="id" value={fare.id} />
                  <ConfirmSubmitButton message={`Delete the ${FARE_MODES[fare.mode].toLowerCase()} fare from ${fare.from_name} to ${fare.to_name}?`} className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 font-bold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40">
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
        <CsvImportForm action={importFaresCsv} columns={FARE_CSV_COLUMNS} required="mode, from, to, source" template={TEMPLATE} templateName="fares-template.csv" />
      </Card>
    </PageFrame>
  );
}
