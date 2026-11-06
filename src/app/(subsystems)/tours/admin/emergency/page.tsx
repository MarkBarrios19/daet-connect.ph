import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { EMERGENCY_COLUMNS, EMERGENCY_KINDS, NATIONAL_HOTLINE, type EmergencyContact } from "@/lib/tours/emergency/contacts";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { deleteEmergencyContact, markEmergencyChecked } from "./actions";
import { EmergencyForm } from "./emergency-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emergency numbers" };

const STALE_DAYS = 90;
const daysSince = (date: string, today: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function AdminEmergencyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/emergency" />;
  const params = await searchParams;
  const { data, error } = await admin.supabase.from("tours_emergency_contacts").select(EMERGENCY_COLUMNS).order("sort_order").order("label");
  const contacts = (data ?? []) as EmergencyContact[];
  const today = toManilaDateKey(new Date());

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Emergency numbers" backHref="/tours/admin" backLabel="Admin" />
      <p className="-mt-3 mb-6 max-w-2xl text-lg text-daet-ink">
        The Daet AI assistant gives these when a visitor asks for help in an emergency, with the date you last checked them. It always gives the national {NATIONAL_HOTLINE} hotline first. Call each number now and then, and tap Checked today.
      </p>

      {params.saved ? <Notice variant="success" className="mb-4">Number added.</Notice> : null}
      {params.checked ? <Notice variant="success" className="mb-4">Marked as checked today.</Notice> : null}
      {params.deleted ? <Notice variant="success" className="mb-4">Number deleted.</Notice> : null}
      {params.error ? <Notice variant="error" className="mb-4">That action could not be completed.</Notice> : null}
      {error ? <Notice variant="error" className="mb-4">Numbers could not be loaded.</Notice> : null}

      {contacts.length === 0 ? (
        <p className="rounded-2xl card-edge bg-surface p-8 text-center text-daet-ink">No numbers yet. Until you add some, the assistant gives only {NATIONAL_HOTLINE}.</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => {
            const age = daysSince(c.checked_on, today);
            return (
              <li key={c.id} className="flex flex-col gap-3 rounded-2xl card-edge bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-bold text-daet-ink">
                    {c.label} · <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="text-blue-700 underline dark:text-blue-300">{c.phone}</a>
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {[EMERGENCY_KINDS[c.kind], c.area, `Checked ${longDate(c.checked_on)}`].filter(Boolean).join(" · ")}
                  </p>
                  {age > STALE_DAYS ? <Badge tone="warning">Not checked for {age} days</Badge> : null}
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                  <form action={markEmergencyChecked}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-blue-50 px-5 font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40">
                      Checked today
                    </button>
                  </form>
                  <form action={deleteEmergencyContact}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmSubmitButton message={`Delete ${c.label} (${c.phone})?`} className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40">
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Card className="mt-8">
        <h2 className="mb-3 text-xl font-bold text-daet-ink">Add a number</h2>
        <EmergencyForm />
      </Card>
    </PageFrame>
  );
}
