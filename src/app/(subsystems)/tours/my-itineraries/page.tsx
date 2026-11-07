import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "My itineraries" };

const shortDate = (date: string | null) =>
  date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

export default async function MyItinerariesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to see saved plans.</Notice>
      </PageFrame>
    );
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/my-itineraries")}`);

  const params = await searchParams;
  const { data, error } = await supabase
    .from("tours_itineraries")
    .select("id, title, start_date, end_date, plan_source, share_token, created_at, tours_itinerary_items ( id )")
    .eq("tourist_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display-2 text-daet-ink">My itineraries</h1>
          </div>
          <Link href="/tours/plan" className="inline-flex min-h-11 items-center rounded-full bg-blue-600 px-6 font-bold text-white transition hover:bg-blue-700 active:scale-[0.98]">
            + Plan a trip
          </Link>
        </div>
        {params.deleted ? <Notice variant="success" className="mt-4">Plan deleted.</Notice> : null}
        {params.error || error ? <Notice variant="error" className="mt-4">Something went wrong. Please try again.</Notice> : null}

        {(data ?? []).length === 0 ? (
          <EmptyState className="mt-6" icon={<LineIcon name="calendar" />} title="No saved plans yet" description="Plan a day in Daet and save it here to share or book from." />
        ) : (
          <ul className="mt-6 space-y-2">
            {(data ?? []).map((row) => (
              <li key={row.id}>
                <Link href={`/tours/my-itineraries/${row.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-2xl card-edge bg-surface p-4 transition hover:bg-blue-50 dark:hover:bg-blue-950/40">
                  <span>
                    <span className="block font-bold text-daet-ink">{row.title}</span>
                    <span className="block text-sm text-slate-600 dark:text-slate-400">
                      {shortDate(row.start_date)} – {shortDate(row.end_date)} · {(row.tours_itinerary_items ?? []).length} items
                    </span>
                  </span>
                  <span className="flex gap-2">
                    {row.plan_source === "llm" ? <Badge tone="info">AI-polished</Badge> : null}
                    {row.share_token ? <Badge tone="success">Shared</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageFrame>
  );
}
