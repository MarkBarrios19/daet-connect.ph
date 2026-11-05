import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isLlmEnabled } from "@/lib/tours/itinerary/llm";
import { addDays } from "@/lib/tours/itinerary/types";
import { PlannerApp } from "./planner-app";
import { PlannerV2 } from "./planner-v2";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plan your trip", description: "Build a day-by-day Daet itinerary that fits opening hours and your budget." };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ describe?: string }> }) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to plan trips.</Notice>
      </PageFrame>
    );
  }
  // The travel assistant links here with the tourist's own description of the trip.
  const { describe } = await searchParams;
  const initialDescription = typeof describe === "string" ? describe.slice(0, 500) : "";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The merged chat + plan planner. TRIP_PLANNER_V2=off brings back the old form.
  if (process.env.TRIP_PLANNER_V2 !== "off") {
    return (
      <PageFrame bleed>
        <div className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
          <h1 className="display-2 text-daet-ink">Plan your Daet trip</h1>
          <p className="mt-2 max-w-2xl text-lg text-daet-ink">Tell the assistant your trip in your own words. It drafts a day-by-day plan from places and tours listed on CONNECT-Daet.</p>
          {user ? (
            <Link href="/tours/my-itineraries" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-blue-50 px-4 text-sm font-bold text-blue-800 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300">
              My saved trips
            </Link>
          ) : null}
          <div className="mt-6">
            <PlannerV2 signedIn={Boolean(user)} initialDescription={initialDescription} />
          </div>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <div className="mx-auto max-w-6xl">
        <h1 className="display-2 text-daet-ink">Plan your Daet trip</h1>
        <p className="mt-2 max-w-2xl text-lg text-daet-ink">
          Tell us about your days. We build a schedule that fits opening hours, travel time and your budget.
        </p>
        <div className="mt-8">
          <PlannerApp defaultDate={addDays(toManilaDateKey(new Date()), 1)} aiAvailable={isLlmEnabled()} signedIn={Boolean(user)} initialDescription={initialDescription} />
        </div>
      </div>
    </PageFrame>
  );
}
