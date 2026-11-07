import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { SavedItinerary } from "@/components/tours/saved-itinerary";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowsToDays, type SavedItem } from "@/lib/tours/itinerary/form";
import { isUuid } from "@/lib/tours/operator-access";
import { BookEachTrip } from "@/components/planner/book-each-trip";
import { bookableForDays } from "@/lib/tours/itinerary/bookable";

export const metadata: Metadata = { title: "Shared itinerary", robots: { index: false } };

type Shared = { title: string; start_date: string | null; summary: string | null; items: SavedItem[] };

export default async function SharedItineraryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSupabaseConfigured() || !isUuid(token)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("tours_shared_itinerary", { p_token: token });
  const shared = data as Shared | null;
  if (!shared) notFound();

  const days = rowsToDays(shared.items ?? [], shared.start_date);
  const tours = await bookableForDays(supabase, days);

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Shared trip plan · view only</p>
        <h1 className="display-2 mt-1 text-daet-ink">{shared.title}</h1>
        {shared.summary ? <p className="mt-3 rounded-2xl card-edge bg-surface p-4 text-base leading-7 text-daet-ink">{shared.summary}</p> : null}
        <div className="mt-6">
          <SavedItinerary days={days} />
        </div>
        {tours.length ? (
          <div className="mt-6 space-y-2">
            <BookEachTrip packages={tours} group={null} title="Book these tours yourself" />
            <p className="text-sm text-slate-600 dark:text-slate-400">Each tour is booked and paid separately, by each person or group.</p>
          </div>
        ) : null}
        <Link href="/tours/plan" className="mt-8 inline-flex min-h-11 items-center rounded-full bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700">
          Plan your own trip
        </Link>
      </div>
    </PageFrame>
  );
}
