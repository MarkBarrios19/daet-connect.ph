"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AssistantChat,
  HANDOFF_KEY,
} from "@/components/assistant/assistant-chat";
import { PlanPanel, type PanelActions } from "@/components/planner/plan-panel";
import { PlanStart } from "@/components/planner/plan-start";
import { loadTrip, saveTrip, type TripAnswers } from "@/components/assistant/trip-storage";
import { PlanChoices } from "@/components/planner/plan-choices";
import { Button } from "@/components/ui/button";
import type { ItineraryResult } from "@/lib/tours/assistant/plan-tool";
import {
  changePlan,
  changePace,
  regeneratePlan,
  addPlanStop,
  planStopChoices,
  removePlanStop,
  reorderPlan,
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
  reorder: (it, orders) => reorderPlan(it.input, it.plan, orders),
  add: (it, day, id) => addPlanStop(it.input, it.plan, day, id),
  choices: (it, day) => planStopChoices(it.input, it.plan, day),
};

/**
 * The merged planner: a start view (Main board) until the first message, then
 * the chat pinned on the left at full height (a third of the width) and the
 * plan on the right (Desktop-Results). On phones the plan opens as a sheet.
 */
export function PlannerV2({ signedIn, canBook, initialDescription = "" }: { signedIn: boolean; canBook: boolean; initialDescription?: string }) {
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  // The first message, from the start view; null until they send one.
  const [first, setFirst] = useState<string | null>(null);
  const [paceBusy, startPace] = useTransition();
  const [paceStatus, setPaceStatus] = useState<string | null>(null);
  const sendRef = useRef<((text: string, answers?: TripAnswers) => void) | null>(null);
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
        // They came to see this plan, so on phones it opens straight away.
        setSheetOpen(true);
        setRestored(true);
        setFirst("");
        // The chat's trip line follows the plan it came with.
        const days = handed.plan.days;
        saveTrip({
          ...loadTrip(),
          dates: { start: days[0].date, end: days[days.length - 1].date },
          travelers: handed.travelers,
          ...(handed.gettingThere?.from ? { origin: { city: handed.gettingThere.from } } : {}),
        });
        window.scrollTo(0, 0);
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

  const changeTo = (pace: string) =>
    startPace(async () => {
      if (!itinerary) return;
      setPaceStatus("Drafting the plan again at that pace…");
      const result = await changePace(itinerary.input, pace);
      if (!result.ok) {
        setPaceStatus(result.message);
        return;
      }
      setItinerary({ ...itinerary, plan: result.plan, stops: result.stops, packages: result.packages, input: result.input ?? itinerary.input, generatedAt: new Date().toISOString() });
      setPaceStatus("Your plan has the new pace.");
    });

  const choices = itinerary ? (
    <PlanChoices
      pace={itinerary.input.pace}
      transport={itinerary.transport}
      busy={paceBusy}
      status={paceStatus}
      onPace={changeTo}
      onTransport={(transport) => {
        setItinerary({ ...itinerary, transport });
        setPaceStatus(transport ? "Travel between stops is labelled for that." : "Decide later. Travel shows as by road.");
      }}
    />
  ) : null;

  if (first === null) {
    return <PlanStart signedIn={signedIn} initialText={initialDescription} onSend={(text) => setFirst(text)} />;
  }

  const panel = itinerary ? (
    <PlanPanel
      itinerary={itinerary}
      canBook={canBook}
      onChange={setItinerary}
      onAsk={ask}
      actions={actions}
      request={request}
      onPickDates={() => {
        // Clear the stand-in dates; the chat then asks for real ones and drafts a dated plan.
        const days = itinerary.plan.days.length;
        const { dates: _standIn, sample: _sample, ...rest } = loadTrip();
        setSheetOpen(false);
        sendRef.current?.(`Plan my ${days}-day trip`, rest);
      }}
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
    <div className="grid lg:grid-cols-[minmax(22rem,1fr)_minmax(0,2fr)]">
      <h1 className="sr-only">Plan your Daet trip</h1>
      {/* Pinned on the left, the full height of the screen under the header, while the plan scrolls. */}
      <div className="flex h-[calc(100dvh-var(--header-h)-var(--tab-bar-h))] min-h-[28rem] flex-col overflow-hidden bg-surface lg:sticky lg:top-[var(--header-h)] lg:self-start">
        {/* Phones: the plan opens as a sheet; this brings it back without covering the message box. */}
        {itinerary && !sheetOpen ? (
          <div className="shrink-0 px-3 pt-3 lg:hidden">
            <Button className="w-full" onClick={() => setSheetOpen(true)}>
              View your {itinerary.plan.days.length}-day plan
            </Button>
          </div>
        ) : null}
        <AssistantChat
          signedIn={signedIn}
          startWith={first}
          afterPlan={choices}
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
        className={`${itinerary && sheetOpen ? "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-[var(--shadow-float)]" : "hidden"} min-w-0 lg:static lg:z-auto lg:block lg:max-h-none lg:overflow-visible lg:rounded-none lg:bg-transparent lg:px-8 lg:py-6 lg:shadow-none`}
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
            <p>Your plan will show up here.</p>
          </div>
        )}
      </section>

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
