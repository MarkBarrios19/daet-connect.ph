"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AssistantChat,
  HANDOFF_KEY,
} from "@/components/assistant/assistant-chat";
import { PlanPanel, type PanelActions } from "@/components/planner/plan-panel";
import { Button } from "@/components/ui/button";
import type { ItineraryResult } from "@/lib/tours/assistant/plan-tool";
import {
  changePlan,
  regeneratePlan,
  removePlanStop,
  swapPlanStop,
} from "./panel-actions";
import { saveItinerary } from "./actions";
import { defaultTitle } from "./plan-format";
import { ShareLink } from "@/components/planner/share-link";
import { setItinerarySharing } from "../my-itineraries/actions";

const actions: PanelActions = {
  regenerate: (it) => regeneratePlan(it.input, it.plan),
  swap: (it, day, id) => swapPlanStop(it.input, it.plan, day, id),
  remove: (it, day, id) => removePlanStop(it.input, it.plan, day, id),
  change: (it, text) => changePlan(it.input, it.plan, text),
};

/**
 * The merged planner (TRIP_PLANNER_V2=on): chat on the left, the plan on the
 * right. On phones the plan opens as a sheet over the chat once there is one.
 */
export function PlannerV2({ signedIn, initialDescription = "" }: { signedIn: boolean; initialDescription?: string }) {
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const sendRef = useRef<((text: string) => void) | null>(null);
  const [request, setRequest] = useState<{ text: string; id: number } | null>(
    null,
  );

  // A plan drafted in the floating assistant comes along when "Open in planner" is tapped.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(HANDOFF_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(HANDOFF_KEY);
      const handed = JSON.parse(raw) as ItineraryResult;
      if (handed?.plan?.days?.length) {
        setItinerary(handed);
        setRestored(true);
      }
    } catch {
      // Nothing to restore.
    }
  }, []);

  const show = (next: ItineraryResult) => {
    setItinerary(next);
    setSheetOpen(true);
  };
  const ask = (text: string) => {
    setSheetOpen(false);
    sendRef.current?.(text);
  };

  const panel = itinerary ? (
    <PlanPanel
      itinerary={itinerary}
      onChange={setItinerary}
      onAsk={ask}
      actions={actions}
      request={request}
      footer={
        <SaveBar
          key={itinerary.generatedAt}
          itinerary={itinerary}
          signedIn={signedIn}
          restored={restored}
        />
      }
    />
  ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)]">
      <div className="flex h-[70dvh] min-h-[28rem] flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-float)] lg:h-[calc(100dvh-12rem)]">
        <AssistantChat
          signedIn={signedIn}
          initialText={initialDescription}
          autoFocus={Boolean(initialDescription)}
          onItinerary={show}
          sendRef={sendRef}
          onChoice={(text) => {
            setRequest({ text, id: Date.now() });
            setSheetOpen(true);
          }}
        />
      </div>

      {/* One panel: a sheet over the chat on phones, the right-hand column from lg up. */}
      <section
        aria-label="Your plan"
        className={`${itinerary && sheetOpen ? "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-[var(--shadow-float)]" : "hidden"} min-w-0 lg:static lg:z-auto lg:block lg:max-h-none lg:overflow-visible lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none`}
      >
        {itinerary ? (
          <div className="mb-2 flex justify-end lg:hidden">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="min-h-11 rounded-full px-4 font-bold text-blue-700 dark:text-blue-300"
            >
              Back to chat
            </button>
          </div>
        ) : null}
        {panel ?? (
          <div className="flex h-full min-h-[20rem] items-center justify-center rounded-2xl bg-canvas p-6 text-center text-slate-600 dark:text-slate-400">
            <p>
              Your plan will show up here.
              <br />
              Try &ldquo;Plan 2 days of beaches and food for us&rdquo;.
            </p>
          </div>
        )}
      </section>

      {itinerary && !sheetOpen ? (
        <Button
          className="fixed inset-x-4 bottom-4 z-40 lg:hidden"
          onClick={() => setSheetOpen(true)}
        >
          View your {itinerary.plan.days.length}-day plan
        </Button>
      ) : null}
    </div>
  );
}

function SaveBar({
  itinerary,
  signedIn,
  restored,
}: {
  itinerary: ItineraryResult;
  signedIn: boolean;
  restored: boolean;
}) {
  const [title, setTitle] = useState(() => defaultTitle(itinerary.plan.days));
  const [state, setState] = useState<{
    ok: boolean;
    text: string;
    id?: string;
  } | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn) {
    return (
      <div className="space-y-1">
        <Button
          onClick={() => {
            // Keep the plan through sign-in; this page restores it when they come back.
            try {
              window.sessionStorage.setItem(
                HANDOFF_KEY,
                JSON.stringify(itinerary),
              );
            } catch {
              // Without storage they plan again after signing in.
            }
            window.location.assign("/login?next=/tours/plan");
          }}
        >
          Sign in to save
        </Button>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Your plan stays here while you sign in.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {restored && !state ? (
        <p className="text-sm font-semibold text-daet-ink">
          Welcome back. Your plan is still here; save it now.
        </p>
      ) : null}
      {state?.ok ? null : (
        <>
          <label className="block text-sm font-bold text-daet-ink">
            Trip name
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-xl bg-muted px-3 text-base font-normal focus:outline-none focus:ring-2 focus:ring-blue-600/40"
            />
          </label>
          <Button
            loading={pending}
            loadingText="Saving…"
            onClick={() =>
              start(async () => {
                const response = await saveItinerary({
                  title: title.trim() || defaultTitle(itinerary.plan.days),
                  preferences: itinerary.input,
                  plan: itinerary.plan,
                  tips: {},
                  summary: null,
                  source: "rules",
                  trip: {
                    travelers: itinerary.travelers,
                    origin: itinerary.gettingThere
                      ? { city: itinerary.gettingThere.from }
                      : null,
                  },
                });
                setState(
                  response.ok
                    ? {
                        ok: true,
                        text: "Saved to My saved trips.",
                        id: response.id,
                      }
                    : { ok: false, text: response.message },
                );
              })
            }
          >
            Save to my trips
          </Button>
        </>
      )}
      {state ? (
        <p
          role="status"
          className={`text-sm font-semibold ${state.ok ? "text-green-800 dark:text-green-300" : "text-red-600 dark:text-red-300"}`}
        >
          {state.text}{" "}
          {state.id ? (
            <Link
              href={`/tours/my-itineraries/${state.id}`}
              className="underline"
            >
              Open it
            </Link>
          ) : null}
        </p>
      ) : null}
      {state?.ok && state.id ? (
        <ShareLink
          id={state.id}
          title={title.trim() || defaultTitle(itinerary.plan.days)}
          initialToken={null}
          setSharing={setItinerarySharing}
        />
      ) : null}
    </div>
  );
}
