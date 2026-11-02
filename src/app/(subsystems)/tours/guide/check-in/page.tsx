import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { QrScanner } from "./qr-scanner";

export const dynamic = "force-dynamic";

export default async function GuideCheckInPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to check guests in.</Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/guide/check-in")}`);

  const { data: guide } = await supabase.from("tours_guides").select("id, accreditation_status").eq("profile_id", user.id).maybeSingle();
  if (!guide) redirect("/tours/guide/register");
  if (guide.accreditation_status !== "approved") redirect("/tours/guide/pending");

  const today = toManilaDateKey(new Date());
  const { data: tours } = await supabase
    .from("tours_bookings")
    .select("id, booking_reference, contact_name, number_of_pax, tours_packages ( title ), tours_checkins ( participant_id )")
    .eq("assigned_guide_id", guide.id)
    .eq("tour_date", today)
    .eq("status", "confirmed")
    .order("created_at");

  return (
    <PageFrame>
      <div className="mx-auto max-w-xl">
        <Link href="/tours/guide/my-tours" className="text-sm font-bold text-daet-ink/70 hover:text-daet-ink">
          ← My tours
        </Link>
        <h1 className="display-2 mt-4 text-daet-ink">Check-in</h1>
        <p className="mt-1 text-sm text-daet-ink/65">Scan each group&apos;s ticket when they arrive.</p>

        <div className="mt-6">
          <QrScanner />
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-daet-ink">Today&apos;s groups</h2>
          {tours && tours.length > 0 ? (
            <ul className="divide-y divide-daet-ink/10 rounded-2xl card-edge bg-surface">
              {tours.map((tour) => {
                const pkg = Array.isArray(tour.tours_packages) ? tour.tours_packages[0] : tour.tours_packages;
                const arrived = (tour.tours_checkins ?? []).some((row: { participant_id: string | null }) => row.participant_id === null);
                return (
                  <li key={tour.id}>
                    <Link href={`/tours/guide/tours/${tour.id}/roster`} className="flex min-h-11 items-center justify-between gap-3 p-4 hover:bg-daet-sand/40">
                      <span>
                        <span className="block font-bold text-daet-ink">{tour.contact_name}</span>
                        <span className="block text-sm text-slate-600 dark:text-slate-400">
                          {pkg?.title ?? "Tour"} · {tour.number_of_pax} guest{tour.number_of_pax === 1 ? "" : "s"} · {tour.booking_reference}
                        </span>
                      </span>
                      {arrived ? <Badge tone="success">Checked in</Badge> : <Badge tone="warning">Waiting</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl bg-daet-sand/40 p-4 text-sm text-daet-ink/70">No confirmed groups are assigned to you today.</p>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
