"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { RouteMap } from "@/components/maps/route-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ArrowDownIcon, CategoryIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { dayStats, percentOf } from "@/lib/tours/itinerary/day-stats";
import { visitIds, type PlannerInput } from "@/lib/tours/itinerary/form";
import { scheduleOrder, withTotals } from "@/lib/tours/itinerary/schedule";
import type { PackageMatch } from "@/lib/tours/itinerary/suggest";
import { formatClock, type Plan, type Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";
import { requestPlanChange, saveItinerary, suggestPackages, type GenerateResult } from "./actions";
import { AskAssistant } from "./ask-assistant";
import { longDate, move, peso, shortDate } from "./plan-format";

type Generated = Extract<GenerateResult, { ok: true }>;

export function PlanEditor({
  result,
  plan,
  setPlan,
  input,
  setInput,
  onBack,
  signedIn,
}: {
  result: Generated;
  plan: Plan;
  setPlan: (plan: Plan) => void;
  input: PlannerInput;
  setInput: (input: PlannerInput) => void;
  onBack: () => void;
  signedIn: boolean;
}) {
  const byId = useMemo(() => new Map(result.attractions.map((a) => [a.id, a])), [result.attractions]);
  // The assistant can change pace and times, so preferences and tips live here.
  const [prefs, setPrefs] = useState<Preferences>(result.prefs);
  const [tips, setTips] = useState<Record<string, string>>(result.tips);
  const [usedAi, setUsedAi] = useState(result.source === "llm");
  const validation = useMemo(() => validatePlan(plan, byId, prefs), [plan, byId, prefs]);
  const used = new Set(plan.days.flatMap((d) => visitIds(d.blocks)));
  const unused = result.attractions.filter((a) => !used.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
  const [title, setTitle] = useState(`Daet trip · ${longDate(prefs.startDate)}`);
  const [saveState, setSaveState] = useState<{ tone: "success" | "error"; text: string; id?: string } | null>(null);
  const [matches, setMatches] = useState<PackageMatch[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function editDay(dayIndex: number, ids: string[]) {
    const days = plan.days.map((day, i) => (i === dayIndex ? scheduleOrder(day.date, ids, byId, prefs) : day));
    setPlan(withTotals(days));
    setSaveState(null);
  }

  function save() {
    startTransition(async () => {
      const response = await saveItinerary({ title, preferences: input, plan, tips, summary: result.summary, source: usedAi ? "llm" : "rules" });
      if (!response.ok) {
        setSaveState({ tone: "error", text: response.message });
        return;
      }
      setSaveState({ tone: "success", text: "Saved to My itineraries.", id: response.id });
      const places = plan.days.flatMap((d) => visitIds(d.blocks)).map((id) => byId.get(id)!).map((a) => ({ name: a.name, lat: a.lat, lng: a.lng }));
      setMatches(await suggestPackages(places));
    });
  }

  const dayCount = plan.days.length;
  return (
    <div className="pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="-ml-4">
          <ChevronLeftIcon className="h-4 w-4" /> Change trip details
        </Button>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone="brand">{plan.totals.visits} stops</Badge>
          <Badge tone="neutral">{plan.totals.travelMinutes} min travel</Badge>
          <Badge tone="neutral">{peso(plan.totals.cost)} entrance fees</Badge>
          {usedAi ? <Badge tone="info">AI-assisted</Badge> : null}
        </div>
      </div>
      <h2 className="mt-4 font-display text-3xl font-semibold text-daet-ink sm:text-4xl">
        Your {dayCount}-day Daet trip
      </h2>
      <p className="mt-1 text-sm text-daet-ink/70">
        {shortDate(prefs.startDate)}
        {dayCount > 1 ? ` to ${shortDate(plan.days[dayCount - 1].date)}` : ""} · {prefs.groupSize} {prefs.groupSize === 1 ? "person" : "people"}
      </p>
      {result.summary ? <p className="mt-4 rounded-2xl card-edge bg-surface p-4 text-sm leading-6 text-daet-ink">{result.summary}</p> : null}

      {validation.ok ? null : (
        <Notice variant="warning" title="This plan needs a fix before you can save it" className="mt-4">
          <ul className="list-disc pl-5">
            {validation.issues.map((issue, i) => (
              <li key={i}>
                Day {issue.day + 1}: {issue.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-10">
          {plan.days.map((day, dayIndex) => {
            const ids = visitIds(day.blocks);
            const points = ids.map((id) => byId.get(id)!).map((a) => ({ lat: a.lat, lng: a.lng, label: a.name }));
            return (
              <section key={day.date} aria-labelledby={`day-${dayIndex}`}>
                <h3 id={`day-${dayIndex}`} className="font-display text-2xl font-semibold text-daet-ink">
                  Day {dayIndex + 1} · {longDate(day.date)}
                </h3>
                {day.blocks.length === 0 ? (
                  <p className="mt-2 text-sm text-daet-ink/70">Free day: nothing else fits your interests, hours and budget. Add a stop below.</p>
                ) : (
                  <ol className="mt-4">
                    {day.blocks.map((block, i) => {
                      const visitIndex = block.kind === "visit" ? ids.indexOf(block.attractionId) : -1;
                      const key = block.kind === "visit" ? `${dayIndex}-${block.attractionId}` : `${dayIndex}-lunch`;
                      const open = editing === key;
                      return (
                        <li key={`${block.kind}-${block.kind === "visit" ? block.attractionId : i}`}>
                          {block.travelMinutes > 0 ? (
                            <p className="flex items-center gap-1.5 py-2 pl-[6.5rem] text-sm text-daet-ink/70">
                              <ArrowDownIcon className="h-4 w-4" /> about {block.travelMinutes} min travel
                            </p>
                          ) : null}
                          <div className="flex gap-4">
                            <div className="w-[5.5rem] shrink-0 whitespace-nowrap pt-4">
                              <p className="text-lg font-bold leading-6 text-daet-ink">{formatClock(block.start)}</p>
                              <p className="text-sm text-daet-ink/70">to {formatClock(block.end)}</p>
                            </div>
                            <div className={`min-w-0 flex-1 rounded-2xl p-4 ${block.kind === "lunch" ? "bg-daet-sand" : "card-edge bg-surface"}`}>
                              <div className="flex items-start gap-3">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-daet-sand text-daet-leaf dark:text-blue-300">
                                  <CategoryIcon category={block.kind === "lunch" ? "lunch" : (byId.get(block.attractionId)?.category ?? "park")} className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-lg font-bold leading-6 text-daet-ink">{block.name}</p>
                                  {block.kind === "visit" ? (
                                    <p className="text-sm text-daet-ink/70">
                                      {block.cost > 0 ? `${peso(block.cost)} for the group` : "No listed entrance fee"}
                                      {!block.hoursConfirmed ? " · hours not listed, check before going" : ""}
                                    </p>
                                  ) : (
                                    <p className="text-sm text-daet-ink/70">Food is not included in your budget.</p>
                                  )}
                                </div>
                                {block.kind === "visit" ? (
                                  <Button variant="secondary" aria-expanded={open} aria-label={`${open ? "Done editing" : "Edit"} ${block.name}`} onClick={() => setEditing(open ? null : key)}>
                                    {open ? "Done" : "Edit"}
                                  </Button>
                                ) : null}
                              </div>
                              {block.kind === "visit" && tips[block.attractionId] ? <p className="mt-3 text-sm text-daet-ink">Tip: {tips[block.attractionId]}</p> : null}
                              {block.kind === "visit" && open ? (
                                <div className="mt-3 flex flex-wrap gap-2 border-t border-daet-ink/10 pt-3">
                                  <Button variant="secondary" disabled={visitIndex === 0} onClick={() => editDay(dayIndex, move(ids, visitIndex, -1))} aria-label={`Move ${block.name} earlier`}>
                                    Earlier
                                  </Button>
                                  <Button variant="secondary" disabled={visitIndex === ids.length - 1} onClick={() => editDay(dayIndex, move(ids, visitIndex, 1))} aria-label={`Move ${block.name} later`}>
                                    Later
                                  </Button>
                                  {unused.length ? (
                                    <Select
                                      aria-label={`Swap ${block.name} for another place`}
                                      value=""
                                      onChange={(e) => e.target.value && editDay(dayIndex, ids.map((id) => (id === block.attractionId ? e.target.value : id)))}
                                      className="mt-0 w-auto min-w-[9rem]"
                                    >
                                      <option value="">Swap for…</option>
                                      {unused.map((a) => (
                                        <option key={a.id} value={a.id}>
                                          {a.name}
                                        </option>
                                      ))}
                                    </Select>
                                  ) : null}
                                  <Button
                                    variant="danger"
                                    aria-label={`Remove ${block.name}`}
                                    onClick={() => {
                                      setEditing(null);
                                      editDay(dayIndex, ids.filter((id) => id !== block.attractionId));
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {unused.length ? (
                  <div className="mt-4">
                    <Select aria-label={`Add a stop to day ${dayIndex + 1}`} value="" onChange={(e) => e.target.value && editDay(dayIndex, [...ids, e.target.value])} className="mt-0 sm:w-auto sm:min-w-[16rem]">
                      <option value="">Add a stop to this day…</option>
                      {unused.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {points.length ? (
                  <div className="mt-4">
                    <RouteMap points={points} connect title={`Map of day ${dayIndex + 1}`} />
                  </div>
                ) : null}
              </section>
            );
          })}

          {matches ? (
            <section aria-labelledby="matching-tours" className="rounded-2xl card-edge bg-surface p-5 sm:p-6">
              <h3 id="matching-tours" className="font-display text-2xl font-semibold text-daet-ink">
                Book a guide for these places
              </h3>
              {matches.length === 0 ? (
                <p className="mt-2 text-sm text-daet-ink/70">No published tours pass these places yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {matches.map((match) => (
                    <li key={match.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-daet-sand/60 p-3">
                      {match.coverImageUrl ? <img src={match.coverImageUrl} alt="" className="h-14 w-20 rounded-2xl object-cover" /> : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-daet-ink">{match.title}</p>
                        <p className="text-sm text-daet-ink/70">Visits {match.matched.join(", ")}</p>
                      </div>
                      <Link href={`/tours/packages/${match.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-daet-forest px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700">
                        View tour
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
          <section aria-labelledby="limits" className="rounded-2xl card-edge bg-surface p-5">
            <h3 id="limits" className="text-base font-bold text-daet-ink">
              Against your limits
            </h3>
            <div className="mt-3 space-y-4">
              {plan.days.map((day, dayIndex) => {
                const stats = dayStats(day, prefs.groupSize);
                const feePct = percentOf(stats.perPerson, prefs.budgetPerDay);
                const timePct = stats.endsAt === null ? 0 : percentOf(stats.endsAt - prefs.dayStart, prefs.dayEnd - prefs.dayStart);
                return (
                  <div key={day.date}>
                    <p className="text-sm font-bold text-daet-ink">Day {dayIndex + 1}</p>
                    <Meter label="Entrance fees per person" value={`${peso(stats.perPerson)} of ${peso(prefs.budgetPerDay)}`} percent={feePct} />
                    <Meter label="Finishes at" value={stats.endsAt === null ? "Free day" : `${formatClock(stats.endsAt)} of ${formatClock(prefs.dayEnd)}`} percent={timePct} />
                  </div>
                );
              })}
            </div>
          </section>
          <AskAssistant
            aiAvailable={result.llmAvailable}
            onRequest={async (text) => {
              const response = await requestPlanChange(text, plan, input, tips);
              if (!response.ok) return { reply: response.message, changed: false };
              if (response.changed) {
                const previous = { plan, prefs, input, tips };
                setPlan(response.plan);
                setPrefs(response.prefs);
                setInput(response.input);
                setTips(response.tips);
                if (response.source === "llm") setUsedAi(true);
                setSaveState(null);
                return {
                  reply: response.reply,
                  changed: true,
                  source: response.source,
                  undo: () => {
                    setPlan(previous.plan);
                    setPrefs(previous.prefs);
                    setInput(previous.input);
                    setTips(previous.tips);
                  },
                };
              }
              return { reply: response.reply, changed: false, source: response.source };
            }}
          />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-daet-ink/10 bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 print:hidden">
        <div className="mx-auto max-w-6xl">
          {saveState ? (
            <Notice variant={saveState.tone} className="mb-2">
              {saveState.text}{" "}
              {saveState.id ? (
                <Link href={`/tours/my-itineraries/${saveState.id}`} className="font-bold underline">
                  Open it
                </Link>
              ) : null}
            </Notice>
          ) : null}
          {signedIn ? (
            <div className="flex items-end gap-3">
              <Field id="title" label="Plan name" className="min-w-0 flex-1">
                <Input id="title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="mt-0" />
              </Field>
              <Button onClick={save} loading={pending} loadingText="Saving…" disabled={!validation.ok || saveState?.tone === "success"}>
                Save plan
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-daet-ink/80">Sign in to save plans and share them.</p>
              <Link href={`/login?next=${encodeURIComponent("/tours/plan")}`} className="inline-flex min-h-11 items-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition-colors hover:bg-blue-700">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between gap-2 text-sm text-daet-ink">
        <span>{label}</span>
        <strong className="text-right">{value}</strong>
      </div>
      <div role="img" aria-label={`${label}: ${percent} percent of the limit`} className="mt-1 h-2.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40">
        <div className="h-full bg-daet-leaf" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
