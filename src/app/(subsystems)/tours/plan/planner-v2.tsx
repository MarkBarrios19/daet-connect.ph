"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AssistantChat, HANDOFF_KEY } from "@/components/assistant/assistant-chat";
import { PlanPanel, type PanelActions } from "@/components/planner/plan-panel";
import { Button } from "@/components/ui/button";
import type { ItineraryResult } from "@/lib/tours/assistant/plan-tool";
import { OVERLAY_EVENT } from "@/lib/ui-overlay";
import { changePlan, regeneratePlan, removePlanStop, swapPlanStop } from "./panel-actions";
import { saveItinerary } from "./actions";

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
export function PlannerV2({ signedIn }: { signedIn: boolean }) {
  const [itinerary, setItinerary] = useState<ItineraryResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sendRef = useRef<((text: string) => void) | null>(null);
  const [request, setRequest] = useState<{ text: string; id: number } | null>(null);

  // This page is the assistant: on phones the floating button would sit on the Send button.
  useEffect(() => {
    // After this commit, so the widget's listener (mounted in the same pass) hears it.
    const timer = window.setTimeout(() => window.dispatchEvent(new CustomEvent(OVERLAY_EVENT, { detail: { id: "planner-v2", open: true } })), 0);
    return () => {
      window.clearTimeout(timer);
      window.dispatchEvent(new CustomEvent(OVERLAY_EVENT, { detail: { id: "planner-v2", open: false } }));
    };
  }, []);

  // A plan drafted in the floating assistant comes along when "Open in planner" is tapped.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(HANDOFF_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(HANDOFF_KEY);
      const handed = JSON.parse(raw) as ItineraryResult;
      if (handed?.plan?.days?.length) setItinerary(handed);
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
    <PlanPanel itinerary={itinerary} onChange={setItinerary} onAsk={ask} actions={actions} request={request} footer={<SaveBar itinerary={itinerary} signedIn={signedIn} />} />
  ) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(22rem,28rem)_1fr]">
      <div className="flex h-[70dvh] min-h-[28rem] flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-float)] lg:h-[calc(100dvh-12rem)]">
        <AssistantChat
          signedIn={signedIn}
          onItinerary={show}
          sendRef={sendRef}
          onChoice={(text) => {
            setRequest({ text, id: Date.now() });
            setSheetOpen(true);
          }}
        />
      </div>

      <div className="hidden min-w-0 lg:block">
        {panel ?? (
          <div className="flex h-full min-h-[20rem] items-center justify-center rounded-2xl bg-canvas p-6 text-center text-slate-600 dark:text-slate-400">
            <p>
              Your plan will show up here.
              <br />
              Try &ldquo;Plan 2 days of beaches and food for us&rdquo;.
            </p>
          </div>
        )}
      </div>

      {itinerary ? (
        <div className="lg:hidden">
          {sheetOpen ? (
            <div role="dialog" aria-modal="true" aria-label="Your plan" className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-[var(--shadow-float)]">
              <div className="mb-2 flex justify-end">
                <button type="button" onClick={() => setSheetOpen(false)} className="min-h-11 rounded-full px-4 font-bold text-blue-700 dark:text-blue-300">
                  Back to chat
                </button>
              </div>
              {panel}
            </div>
          ) : (
            <Button className="fixed inset-x-4 bottom-4 z-40" onClick={() => setSheetOpen(true)}>
              View your {itinerary.plan.days.length}-day plan
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SaveBar({ itinerary, signedIn }: { itinerary: ItineraryResult; signedIn: boolean }) {
  const [state, setState] = useState<{ ok: boolean; text: string; id?: string } | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn) {
    return (
      <p className="text-sm text-daet-ink">
        <Link href="/login?next=/tours/plan" className="font-bold text-blue-700 underline dark:text-blue-300">
          Sign in
        </Link>{" "}
        to save this plan to your account.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button
        loading={pending}
        loadingText="Saving…"
        onClick={() =>
          start(async () => {
            const first = itinerary.plan.days[0]?.date ?? "";
            const response = await saveItinerary({ title: `Daet trip, ${first}`, preferences: itinerary.input, plan: itinerary.plan, tips: {}, summary: null, source: "rules" });
            setState(response.ok ? { ok: true, text: "Saved to My itineraries.", id: response.id } : { ok: false, text: response.message });
          })
        }
      >
        Save to my trips
      </Button>
      {state ? (
        <p role="status" className={`text-sm font-semibold ${state.ok ? "text-green-800 dark:text-green-300" : "text-red-600 dark:text-red-300"}`}>
          {state.text}{" "}
          {state.id ? (
            <Link href={`/tours/my-itineraries/${state.id}`} className="underline">
              Open it
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
