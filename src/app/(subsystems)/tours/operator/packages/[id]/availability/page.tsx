import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AvailabilityRow } from "@/lib/tours/availability";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";
import { AvailabilityList, OpenDatesForm } from "./availability-manager";
import { getAuthUser } from "@/lib/tours/server-auth";


type PageProps = { params: Promise<{ id: string }> };

export default async function PackageAvailabilityPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to manage dates.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/operator/packages/${id}/availability`)}`);

  const { data: operator } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!operator) redirect("/tours/operator/register");
  if (operator.accreditation_status !== "approved") redirect("/tours/operator/pending");

  const { data: pkg } = await supabase
    .from("tours_packages")
    .select("id, title, status")
    .eq("id", id)
    .eq("operator_id", operator.id)
    .maybeSingle();
  if (!pkg) notFound();

  const today = toManilaDateKey(new Date());
  const { data: rows, error } = await supabase
    .from("tours_package_availability")
    .select("id, available_date, capacity_total, capacity_booked")
    .eq("package_id", pkg.id)
    .gte("available_date", today)
    .order("available_date", { ascending: true });
  if (error) console.error("Availability fetch error:", error);

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        <nav className="mb-6 text-sm text-daet-ink/70">
          <Link href="/tours/operator/packages" className="hover:text-daet-forest dark:hover:text-blue-300">
            My packages
          </Link>
          <span className="mx-2">→</span>
          <Link href={`/tours/operator/packages/${pkg.id}`} className="hover:text-daet-forest dark:hover:text-blue-300">
            {pkg.title}
          </Link>
          <span className="mx-2">→</span>
          <span className="text-daet-ink">Dates &amp; seats</span>
        </nav>

        <h1 className="display-2 text-daet-ink">Dates &amp; seats</h1>
        <p className="mt-2 text-sm leading-6 text-daet-ink/70">
          Open the dates you run this tour and how many guests you can take. Tourists can then book only those dates, and a date
          closes automatically when its seats are taken. Cancelled and declined bookings give their seats back.
        </p>
        {pkg.status !== "published" ? (
          <Notice variant="info" className="mt-4">
            This package is not published yet. You can prepare dates now; tourists see them once it is published.
          </Notice>
        ) : null}

        <Card className="mt-6">
          <h2 className="mb-4 text-lg font-bold text-daet-ink">Open dates</h2>
          <OpenDatesForm packageId={pkg.id} today={today} />
        </Card>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-daet-ink">Upcoming dates</h2>
          {error ? (
            <Notice variant="error">Dates could not be loaded. Refresh to try again.</Notice>
          ) : (
            <AvailabilityList packageId={pkg.id} rows={(rows ?? []) as AvailabilityRow[]} />
          )}
        </section>
      </div>
    </PageFrame>
  );
}
