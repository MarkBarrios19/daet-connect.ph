import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/ui/notice";
import { PageBody } from "@/components/ui/signed-in-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { timed } from "@/lib/server-timing";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isLlmEnabled } from "@/lib/tours/itinerary/llm";
import { addDays } from "@/lib/tours/itinerary/types";
import { getAuthUser } from "@/lib/tours/server-auth";
import { PlannerApp } from "@/app/(subsystems)/tours/plan/planner-app";
import { PlannerV2 } from "@/app/(subsystems)/tours/plan/planner-v2";

export const metadata: Metadata = { title: "Plan your trip", description: "Build a day-by-day Daet itinerary that fits opening hours and your budget." };

type PageProps = { searchParams: Promise<{ describe?: string }> };

export default function PlanPage({ searchParams }: PageProps) {
  // Works signed out as well as signed in, so the proxy does not send visitors
  // away from it; the frame around it is the signed-in one either way.
  return (
    <Suspense fallback={<PlannerSkeleton />}>
      <Planner searchParams={searchParams} />
    </Suspense>
  );
}

function PlannerSkeleton() {
  return (
    <PageBody>
      <div aria-busy="true">
        <p role="status" className="sr-only">
          Loading the trip planner
        </p>
        <div aria-hidden="true" className="animate-pulse space-y-6">
          <div className="h-10 w-2/3 max-w-md rounded-2xl bg-daet-ink/10" />
          <div className="h-5 w-1/2 max-w-sm rounded-full bg-daet-ink/10" />
          <div className="h-80 rounded-2xl bg-daet-ink/10" />
        </div>
      </div>
    </PageBody>
  );
}

async function Planner({ searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageBody>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to plan trips.</Notice>
      </PageBody>
    );
  }
  // The travel assistant links here with the tourist's own description of the trip.
  const { describe } = await searchParams;
  const initialDescription = typeof describe === "string" ? describe.slice(0, 500) : "";
  const user = await timed("page:plan", getAuthUser);

  // The merged chat + plan planner. TRIP_PLANNER_V2=off brings back the old form.
  if (process.env.TRIP_PLANNER_V2 !== "off") {
    return (
      <PageBody bleed>
        <PlannerV2 signedIn={Boolean(user)} initialDescription={initialDescription} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <div className="mx-auto max-w-6xl">
        <h1 className="display-2 text-daet-ink">Plan your Daet trip</h1>
        <p className="mt-2 max-w-2xl text-lg text-daet-ink">
          Tell us about your days. We build a schedule that fits opening hours, travel time and your budget.
        </p>
        <div className="mt-8">
          <PlannerApp defaultDate={addDays(toManilaDateKey(new Date()), 1)} aiAvailable={isLlmEnabled()} signedIn={Boolean(user)} initialDescription={initialDescription} />
        </div>
      </div>
    </PageBody>
  );
}
