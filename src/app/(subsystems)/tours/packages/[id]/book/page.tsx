import { getAuthUser } from "@/lib/tours/server-auth";
import { durationText } from "@/lib/tours/duration";
import { LineIcon } from "@/components/ui/icons";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bookableDates, type AvailabilityRow } from "@/lib/tours/availability";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { BookingForm } from "./booking-form";


type PageProps = {
  params: Promise<{ id: string }>;
  /** From the trip planner's Book button: the plan day and group size. */
  searchParams: Promise<{ date?: string | string[]; pax?: string | string[] }>;
};

export default async function BookPackagePage({ params, searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to book packages.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  const query = await searchParams;
  const prefill = { date: typeof query.date === "string" ? query.date : undefined, pax: typeof query.pax === "string" ? query.pax : undefined };
  const back = new URLSearchParams(Object.entries(prefill).filter((e): e is [string, string] => typeof e[1] === "string"));
  const supabase = await createSupabaseServerClient();

  // Get current user
  const user = await getAuthUser();
  
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/tours/packages/${id}/book${back.size ? `?${back}` : ""}`)}`);
  }

  // Fetch package details with price variants
  const { data: pkg, error } = await supabase
    .from("tours_packages")
    .select(
      `
      id,
      title,
      description,
      location_name,
      duration_value,
      duration_type,
      cover_image_url,
      status,
      tours_package_price_variants(
        id,
        variant_name,
        price_per_pax,
        flat_price,
        min_pax,
        max_pax,
        is_default
      ),
      tours_operators(
        business_name
      )
    `,
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error || !pkg) {
    console.error("Package fetch error:", error);
    notFound();
  }

  // Get user profile for pre-filling form
  const today = toManilaDateKey(new Date());
  const [{ data: profile }, { data: availabilityRows }, { count: openDateCount }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("tours_package_availability")
      .select("available_date, capacity_total, capacity_booked")
      .eq("package_id", pkg.id)
      .gte("available_date", today)
      .order("available_date", { ascending: true }),
    // Any open date (past ones included) switches the package to "open dates only".
    supabase.from("tours_package_availability").select("id", { count: "exact", head: true }).eq("package_id", pkg.id),
  ]);
  const usesOpenDates = (openDateCount ?? 0) > 0;

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-daet-ink/70">
          <Link href="/tours/browse" className="hover:text-daet-forest dark:hover:text-blue-300">
            Browse packages
          </Link>
          <span className="mx-2">→</span>
          <Link href={`/tours/packages/${pkg.id}`} className="hover:text-daet-forest dark:hover:text-blue-300">
            {pkg.title}
          </Link>
          <span className="mx-2">→</span>
          <span className="text-daet-ink">Book</span>
        </nav>

        {/* Package Header */}
        <div className="mb-8 rounded-2xl card-edge bg-surface p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
            {pkg.cover_image_url && (
              <img
                src={pkg.cover_image_url}
                alt={pkg.title}
                className="h-48 w-full rounded-2xl object-cover sm:h-32 sm:w-48 sm:shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="display-2 break-words text-daet-ink">{pkg.title}</h1>
              <p className="mt-2 text-sm text-daet-ink/70">
                <LineIcon name="pin" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {pkg.location_name} · <LineIcon name="clock" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {durationText(Number(pkg.duration_value), pkg.duration_type) ?? ""}
              </p>
              {Array.isArray(pkg.tours_operators) && pkg.tours_operators[0] && (
                <p className="mt-1 text-sm font-bold text-daet-forest dark:text-blue-300">
                  by {pkg.tours_operators[0].business_name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Booking Form */}
        <BookingForm
          packageId={pkg.id}
          priceVariants={pkg.tours_package_price_variants || []}
          prefill={prefill}
          dateOptions={usesOpenDates ? bookableDates((availabilityRows ?? []) as AvailabilityRow[], today) : null}
          userProfile={{
            fullName: profile?.full_name || "",
            email: user.email ?? "",
          }}
        />
      </div>
    </PageFrame>
  );
}
