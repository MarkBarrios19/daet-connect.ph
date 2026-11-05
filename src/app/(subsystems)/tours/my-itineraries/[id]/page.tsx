import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageFrame } from "@/components/ui/page-frame";
import { ConfirmSubmitButton } from "@/components/tours/confirm-submit-button";
import { SavedItinerary } from "@/components/tours/saved-itinerary";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowsToDays } from "@/lib/tours/itinerary/form";
import { isUuid } from "@/lib/tours/operator-access";
import { appBaseUrl } from "@/lib/tours/qr-issue";
import { deleteItinerary } from "../actions";
import { ShareControls } from "./share-controls";
import { BookEachTrip } from "@/components/planner/book-each-trip";
import { bookableForDays } from "@/lib/tours/itinerary/bookable";

/** Who the saved trip is for: the planner's travellers, else the form's group size. */
function groupFromPreferences(value: unknown): number | null {
  const prefs = (value ?? {}) as { travelers?: { adults?: unknown; children?: unknown }; groupSize?: unknown };
  const adults = Number(prefs.travelers?.adults);
  if (Number.isInteger(adults) && adults > 0) return adults + (Array.isArray(prefs.travelers?.children) ? prefs.travelers.children.length : 0);
  const size = Number(prefs.groupSize);
  return Number.isInteger(size) && size > 0 ? size : null;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Itinerary" };

export default async function ItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured() || !isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/my-itineraries/${id}`)}`);

  const { data: itinerary } = await supabase
    .from("tours_itineraries")
    .select("id, title, start_date, summary, share_token, plan_source, preferences, tours_itinerary_items ( day_number, item_order, item_kind, location_name, tip, latitude, longitude, start_time, end_time, travel_minutes, tours_attractions ( slug ) )")
    .eq("id", id)
    .eq("tourist_id", user.id)
    .maybeSingle();
  if (!itinerary) notFound();

  const rows = (itinerary.tours_itinerary_items ?? []).map((item: Record<string, unknown>) => {
    const attraction = Array.isArray(item.tours_attractions) ? item.tours_attractions[0] : item.tours_attractions;
    return { ...(item as object), attraction_slug: (attraction as { slug?: string } | null)?.slug ?? null } as Parameters<typeof rowsToDays>[0][number];
  });

  const days = rowsToDays(rows, itinerary.start_date);
  const tours = await bookableForDays(supabase, days);
  const group = groupFromPreferences(itinerary.preferences);

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <Link href="/tours/my-itineraries" className="inline-flex min-h-11 items-center font-bold text-blue-700 dark:text-blue-300 hover:underline">
          ← My itineraries
        </Link>
        <h1 className="display-2 mt-1 text-daet-ink">{itinerary.title}</h1>
        {itinerary.summary ? <p className="mt-3 rounded-2xl card-edge bg-surface p-4 text-base leading-7 text-daet-ink">{itinerary.summary}</p> : null}
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Opening hours can change; check each place before you go.</p>

        <div className="mt-6">
          <SavedItinerary days={days} />
        </div>

        {tours.length ? (
          <div className="mt-6">
            <BookEachTrip packages={tours} group={group} />
          </div>
        ) : null}

        <Card className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-daet-ink">Share</h2>
          <ShareControls id={itinerary.id} title={itinerary.title} initialToken={itinerary.share_token} baseUrl={appBaseUrl()} />
        </Card>

        <form action={deleteItinerary} className="mt-6">
          <input type="hidden" name="id" value={itinerary.id} />
          <ConfirmSubmitButton message="Delete this plan? This cannot be undone." className="inline-flex min-h-11 items-center rounded-full bg-surface px-5 font-bold text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40">
            Delete plan
          </ConfirmSubmitButton>
        </form>
      </div>
    </PageFrame>
  );
}
