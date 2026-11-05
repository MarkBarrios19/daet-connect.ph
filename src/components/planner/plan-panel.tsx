"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { TransportCardView } from "@/components/assistant/transport-card";
import { BookableCard, groupPrice } from "@/components/planner/book-each-trip";
import { PlanEditor } from "@/components/planner/plan-editor";
import { StopMenu } from "@/components/planner/stop-menu";
import { RouteMap, type MapPoint } from "@/components/maps/route-map";
import { Button } from "@/components/ui/button";
import { CategoryIcon, LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import type { ItineraryResult, PlanStop, Transport } from "@/lib/tours/assistant/plan-tool";
import { bookHref, dayFor } from "@/lib/tours/itinerary/bookable";
import type { BookablePackage } from "@/lib/tours/itinerary/data";
import type { StopChoice } from "@/lib/tours/itinerary/edit";
import { formatClock, type PlanDay, type VisitBlock } from "@/lib/tours/itinerary/types";

/** What the panel's buttons call; injected so the panel works without a server in tests. */
export type PanelActions = {
  regenerate: (it: ItineraryResult) => Promise<PanelUpdate>;
  swap: (it: ItineraryResult, day: number, id: string) => Promise<PanelUpdate>;
  remove: (it: ItineraryResult, day: number, id: string) => Promise<PanelUpdate>;
  /** A change in words, e.g. "Make it more relaxed"; the reply says what changed. */
  change: (it: ItineraryResult, text: string) => Promise<PanelUpdate & { reply?: string; input?: ItineraryResult["input"] }>;
  /** Edit mode: the traveller's own order of stops, day by day. Optional so read-only uses of the panel need not pass them. */
  reorder?: (it: ItineraryResult, orders: string[][]) => Promise<PanelUpdate>;
  add?: (it: ItineraryResult, day: number, id: string) => Promise<PanelUpdate>;
  choices?: (it: ItineraryResult, day: number) => Promise<{ ok: true; choices: StopChoice[] } | { ok: false; message: string }>;
};
export type PanelUpdate = { ok: true; plan: ItineraryResult["plan"]; stops: ItineraryResult["stops"]; packages: BookablePackage[] } | { ok: false; message: string };

const longDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const PACE_LABEL = { relaxed: "Relaxed pace", normal: "Balanced pace", packed: "Packed pace" } as const;

const pillClass = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center rounded-full px-5 text-sm font-bold transition motion-reduce:transition-none ${
    on ? "bg-blue-600 text-white" : "border border-slate-500 bg-surface text-daet-ink hover:bg-muted"
  }`;

/** "Nov 6 to Nov 8 · 2 travelers · Relaxed pace": the line under the plan's title. */
export function tripLine(itinerary: ItineraryResult): string {
  const days = itinerary.plan.days;
  const group = itinerary.travelers.adults + itinerary.travelers.children.length;
  const dates = days.length > 1 ? `${shortDate(days[0].date)} to ${shortDate(days[days.length - 1].date)}` : days[0] ? shortDate(days[0].date) : "";
  const pace = PACE_LABEL[itinerary.input.pace as keyof typeof PACE_LABEL];
  const around = itinerary.transport ? TRAVEL_LABEL[itinerary.transport] : null;
  return [dates, `${group} traveler${group === 1 ? "" : "s"}`, pace, around].filter(Boolean).join(" · ");
}

/** "Bagasbas Beach, Daet Heritage Center and 2 more": what a day is about. */
function daySummary(day: PlanDay): string {
  const names = day.blocks.filter((b): b is VisitBlock => b.kind === "visit").map((b) => b.name);
  if (!names.length) return "Nothing planned yet";
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/**
 * Each bookable tour shows inside the first planned stop it passes, as on the
 * boards; tours that pass no stop of the shown days are listed after them.
 */
export function placePackages(days: PlanDay[], packages: BookablePackage[]): { byStop: Map<string, BookablePackage[]>; rest: BookablePackage[] } {
  const byStop = new Map<string, BookablePackage[]>();
  const rest: BookablePackage[] = [];
  for (const pkg of packages) {
    const matched = new Set(pkg.matched.map((m) => m.toLowerCase()));
    let placed = false;
    for (const [i, day] of days.entries()) {
      const block = day.blocks.find((b) => b.kind === "visit" && matched.has(b.name.toLowerCase()));
      if (block && block.kind === "visit") {
        const key = `${i}:${block.attractionId}`;
        byStop.set(key, [...(byStop.get(key) ?? []), pkg]);
        placed = true;
        break;
      }
    }
    if (!placed) rest.push(pkg);
  }
  return { byStop, rest };
}

/**
 * The drafted plan, laid out as the Desktop-Results and Phone-Results boards:
 * title and trip line with Regenerate and Save, day pills, then the day's
 * numbered stops beside a map of its route (stacked on narrow screens). Every
 * number shown comes from the plan_trip result or a panel action, never from
 * chat text.
 */
export function PlanPanel({
  itinerary,
  onChange,
  onAsk,
  actions,
  footer,
  request,
}: {
  itinerary: ItineraryResult;
  onChange: (next: ItineraryResult) => void;
  /** Sends a message to the chat, e.g. "Tell me about Bagasbas Beach". */
  onAsk: (text: string) => void;
  actions: PanelActions;
  /** Saving (and sharing once saved); opened with the Save to a trip button. */
  footer?: React.ReactNode;
  /** A change asked from outside the panel (a follow-up chip); runs once per new value. */
  request?: { text: string; id: number } | null;
}) {
  const { plan } = itinerary;
  const [day, setDay] = useState<number | "all">(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const canEdit = Boolean(actions.reorder && actions.add && actions.choices);
  const [editing, setEditing] = useState(false);
  // The plan from before Edit, for Cancel; and the plan from before a remove, for Undo.
  const [snapshot, setSnapshot] = useState<ItineraryResult | null>(null);
  const [undo, setUndo] = useState<{ label: string; before: ItineraryResult } | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(itinerary.stops.map((s) => [s.id, s]));
  const group = itinerary.travelers.adults + itinerary.travelers.children.length;
  const current = day === "all" ? null : Math.min(day, plan.days.length - 1);
  const shown = current === null ? plan.days.map((d, i) => ({ d, i })) : [{ d: plan.days[current], i: current }];
  const { byStop, rest } = placePackages(plan.days, itinerary.packages);
  const datedFor = (p: BookablePackage) => dayFor(p.matched, plan.days.map((d) => ({ date: d.date, names: d.blocks.map((b) => b.name) })));

  // A new plan (regenerated, or from another request) starts again on Day 1.
  useEffect(() => {
    setDay((d) => (d === "all" || d < plan.days.length ? d : 0));
  }, [plan.days.length]);

  const points: MapPoint[] = shown.flatMap(({ d }) =>
    d.blocks.flatMap((b) => {
      const s = b.kind === "visit" ? byId.get(b.attractionId) : null;
      return s ? [{ lat: s.lat, lng: s.lng, label: s.name }] : [];
    }),
  );
  const mapTitle = current === null ? "All days" : `Day ${current + 1} route`;

  function run(label: string, call: () => Promise<PanelUpdate>, after?: (ok: boolean) => void) {
    setMessage(null);
    start(async () => {
      const result = await call().catch(() => ({ ok: false as const, message: "That didn't work. Check your connection and try again." }));
      if (!result.ok) {
        setMessage(result.message);
        after?.(false);
        return;
      }
      onChange({ ...itinerary, plan: result.plan, stops: result.stops, packages: result.packages });
      setMessage(label);
      after?.(true);
    });
  }

  function removeWithUndo(day: number, b: VisitBlock) {
    const before = itinerary;
    run(`Removed ${b.name}.`, () => actions.remove(itinerary, day, b.attractionId), (ok) => ok && setUndo({ label: `${b.name} removed from your trip`, before }));
  }

  // The Undo offer lasts a few seconds, as on the Desktop-Edit board.
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const lastRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!request || lastRequest.current === request.id) return;
    lastRequest.current = request.id;
    setMessage(null);
    start(async () => {
      const result = await actions.change(itinerary, request.text).catch(() => ({ ok: false as const, message: "That didn't work. Check your connection and try again." }));
      if (!result.ok) return setMessage(result.message);
      onChange({ ...itinerary, plan: result.plan, stops: result.stops, packages: result.packages, input: "input" in result && result.input ? result.input : itinerary.input });
      setMessage("reply" in result && result.reply ? result.reply : "Plan updated.");
    });
  }, [request, actions, itinerary, onChange]);

  // A status line belongs to the plan it was about: a new plan clears it.
  useEffect(() => setMessage(null), [itinerary.generatedAt]);

  const prices = itinerary.packages.map((p) => groupPrice(p, group));
  const known = prices.filter((p): p is number => p !== null);

  return (
    <section aria-labelledby="plan-title" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="plan-title" className="font-[family-name:var(--font-display)] text-2xl font-semibold text-daet-ink sm:text-3xl">
            Your {plan.days.length}-day Daet plan
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{editing ? `Editing · ${tripLine(itinerary)}` : tripLine(itinerary)}</p>
        </div>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                if (snapshot) onChange(snapshot);
                setEditing(false);
                setUndo(null);
                setMessage("Changes cancelled.");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setUndo(null);
                setMessage("Your changes are in the plan.");
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setSnapshot(itinerary);
                  setSaveOpen(false);
                  setMessage(null);
                  setEditing(true);
                }}
              >
                <LineIcon name="edit" className="h-4 w-4" /> Edit
              </Button>
            ) : null}
            <Button variant="secondary" loading={pending} loadingText="Working…" onClick={() => run("Here is a fresh plan.", () => actions.regenerate(itinerary))}>
              <LineIcon name="return" className="h-4 w-4" /> Regenerate
            </Button>
            {footer ? (
              <Button aria-expanded={saveOpen} aria-controls="plan-save" onClick={() => setSaveOpen((v) => !v)}>
                <LineIcon name="plus" className="h-4 w-4" /> Save to a trip
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {footer && saveOpen && !editing ? (
        <div id="plan-save" className="rounded-2xl bg-surface p-4">
          {footer}
        </div>
      ) : null}

      <div className="scrollbar-quiet -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Choose a day">
        {plan.days.length > 1 ? (
          <button type="button" aria-pressed={day === "all"} onClick={() => setDay("all")} className={pillClass(day === "all")}>
            All days
          </button>
        ) : null}
        {plan.days.map((d, i) => (
          <button key={d.date} type="button" aria-pressed={day === i} aria-label={`Day ${i + 1}, ${longDay(d.date)}`} onClick={() => setDay(i)} className={pillClass(day === i)}>
            Day {i + 1}
          </button>
        ))}
      </div>

      <p role="status" aria-live="polite" className={message ? "rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 dark:bg-blue-950/40 dark:text-blue-200" : "sr-only"}>
        {message ?? ""}
      </p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:gap-6">
        {points.length ? (
          <div className="relative h-60 min-w-0 overflow-hidden rounded-2xl sm:h-72 xl:sticky xl:top-4 xl:order-2 xl:h-[min(42rem,calc(100dvh-8rem))]">
            <RouteMap points={points} connect={current !== null} title={current === null ? "Map of all days" : `Map of day ${current + 1}`} className="h-full" />
            <span className="pointer-events-none absolute left-3 top-3 z-[500] inline-flex min-h-8 items-center rounded-full bg-surface px-3 text-sm font-bold text-daet-ink">{mapTitle}</span>
          </div>
        ) : null}
        <div className="min-w-0 space-y-6 xl:order-1">
          {editing && canEdit ? (
            <PlanEditor
              itinerary={itinerary}
              days={shown.map(({ i }) => i)}
              busy={pending}
              onReorder={(orders) =>
                new Promise<boolean>((resolve) => run("New times are in.", () => actions.reorder!(itinerary, orders), resolve))
              }
              onRemove={removeWithUndo}
              loadChoices={async (d) => {
                const result = await actions.choices!(itinerary, d);
                return result.ok ? result.choices : result.message;
              }}
              onAdd={(d, c) => run(`Added ${c.name} to Day ${d + 1}.`, () => actions.add!(itinerary, d, c.id))}
            />
          ) : null}
          {editing && canEdit ? null : shown.map(({ d, i }) => (
            <div key={d.date} className="space-y-3">
              <div>
                <h3 className="font-bold text-daet-ink">
                  Day {i + 1} · {longDay(d.date)}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{daySummary(d)}</p>
              </div>
              {i === 0 && itinerary.gettingThere ? <GettingThere value={itinerary.gettingThere} /> : null}
              {d.blocks.length === 0 ? (
                <p className="rounded-2xl bg-surface p-3 text-sm text-slate-600 dark:text-slate-400">Nothing fits this day yet. Try Regenerate, or ask for different places.</p>
              ) : (
                <DayStops
                  day={d}
                  index={i}
                  transport={itinerary.transport ?? null}
                  stops={byId}
                  group={group}
                  busy={pending}
                  packagesFor={(id) => byStop.get(`${i}:${id}`) ?? []}
                  bookingHref={(p) => bookHref(p.id, datedFor(p), group)}
                  onAsk={onAsk}
                  onSwap={(b) => run(`Swapped ${b.name}.`, () => actions.swap(itinerary, i, b.attractionId))}
                  onRemove={(b) => removeWithUndo(i, b)}
                />
              )}
            </div>
          ))}

          {!editing && rest.length ? (
            <div className="space-y-2">
              <h3 className="font-bold text-daet-ink">More tours near your plan</h3>
              {rest.map((p) => (
                <BookableCard key={p.id} pkg={p} group={group} bookHref={bookHref(p.id, datedFor(p), group)} />
              ))}
            </div>
          ) : null}

          {!editing && itinerary.packages.length > 1 && known.length ? (
            <p className="text-sm font-semibold text-daet-ink">
              {known.length < prices.length ? "At least " : "About "}
              {formatPeso(known.reduce((a, b) => a + b, 0))} for all {itinerary.packages.length} bookable trips. Each one is booked and paid separately.
            </p>
          ) : null}
          <p className="text-xs text-slate-600 dark:text-slate-400">Costs are entrance fees for your group of {group}. Times are estimates; confirm hours marked as not confirmed.</p>
        </div>
      </div>

      {undo ? (
        <div role="status" className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-slate-900 py-1 pl-5 pr-2 text-sm text-white shadow-[var(--shadow-float)] dark:bg-slate-100 dark:text-slate-900">
          <span className="min-w-0 truncate">{undo.label}</span>
          <button
            type="button"
            onClick={() => {
              onChange(undo.before);
              setUndo(null);
              setMessage("Stop put back.");
            }}
            className="min-h-11 shrink-0 rounded-full px-4 font-bold underline"
          >
            Undo
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DayStops({
  day,
  index,
  stops,
  group,
  busy,
  packagesFor,
  bookingHref,
  onAsk,
  onSwap,
  onRemove,
  transport = null,
}: {
  day: PlanDay;
  index: number;
  transport?: Transport | null;
  stops: Map<string, PlanStop>;
  group: number;
  busy: boolean;
  packagesFor: (attractionId: string) => BookablePackage[];
  bookingHref: (p: BookablePackage) => string;
  onAsk: (text: string) => void;
  onSwap: (b: VisitBlock) => void;
  onRemove: (b: VisitBlock) => void;
}) {
  let n = 0;
  return (
    <ol className="space-y-3" aria-label={`Day ${index + 1} stops`}>
      {day.blocks.map((b, j) => {
        if (b.kind !== "visit") {
          return (
            <li key={`lunch-${j}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
              <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                <LineIcon name="plate" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-daet-ink">Lunch break</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {formatClock(b.start)} · Ask the assistant for food nearby
                </p>
              </div>
            </li>
          );
        }
        n += 1;
        return (
          <li key={`${b.attractionId}-${j}`} className="space-y-3">
            {j > 0 && b.travelMinutes > 0 ? <TravelChip minutes={b.travelMinutes} transport={transport} /> : null}
            <StopCard
              number={n}
              block={b}
              stop={stops.get(b.attractionId)}
              group={group}
              busy={busy}
              packages={packagesFor(b.attractionId)}
              bookingHref={bookingHref}
              onAsk={() => onAsk(`Tell me about ${b.name}`)}
              onNearby={() => onAsk(`What's near ${b.name}? Food and places to see.`)}
              onSwap={() => onSwap(b)}
              onRemove={() => onRemove(b)}
            />
          </li>
        );
      })}
    </ol>
  );
}

export const TRAVEL_LABEL: Record<Transport, string> = { motorbike: "By motorbike", car: "By car", tricycle: "By tricycle or van" };

export function TravelChip({ minutes, transport = null }: { minutes: number; transport?: Transport | null }) {
  return (
    <p className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-blue-50 px-3 text-sm font-bold text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
      <LineIcon name="van" className="h-4 w-4" />
      {transport ? TRAVEL_LABEL[transport] : "By road"} · about {minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`}
    </p>
  );
}

function StopCard({
  number,
  block,
  stop,
  group,
  busy,
  packages,
  bookingHref,
  onAsk,
  onNearby,
  onSwap,
  onRemove,
}: {
  number: number;
  block: VisitBlock;
  stop: PlanStop | undefined;
  group: number;
  busy: boolean;
  packages: BookablePackage[];
  bookingHref: (p: BookablePackage) => string;
  onAsk: () => void;
  onNearby: () => void;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <article className="relative space-y-3 rounded-2xl bg-surface p-3">
      <div className="flex gap-3">
        {stop?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- listing photos come from many hosts
          <img src={stop.photoUrl} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-28 sm:w-28" />
        ) : (
          <span aria-hidden="true" className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800 sm:h-28 sm:w-28 dark:bg-blue-950/40 dark:text-blue-300">
            <CategoryIcon category={stop?.category ?? "nature"} className="h-8 w-8" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h4 className="flex min-w-0 flex-1 items-center gap-2 font-bold text-daet-ink">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[13px] text-white">{number}</span>
              <span className="min-w-0">{block.name}</span>
            </h4>
            <button ref={menuButton} type="button" aria-expanded={open} aria-haspopup="true" aria-label={`Options for ${block.name}`} onClick={() => setOpen((v) => !v)} className="-mr-1 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-daet-ink hover:bg-muted">
              <LineIcon name="menu" className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {formatClock(block.start)} to {formatClock(block.end)} · {block.cost > 0 ? `${formatPeso(block.cost)} for your group` : "Free"}
          </p>
          {stop?.tip ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{stop.tip}</p> : null}
          {block.hoursConfirmed ? null : <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Opening hours not confirmed</p>}
          <button type="button" onClick={onAsk} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-blue-700 hover:underline dark:text-blue-300">
            <LineIcon name="chat" className="h-4 w-4" /> Ask about this place
          </button>
        </div>
      </div>
      {open ? (
        <StopMenu
          name={block.name}
          returnFocus={menuButton}
          onClose={() => setOpen(false)}
          items={[
            { label: "Ask about this place", icon: "chat", onSelect: onAsk },
            { label: "Find experiences nearby", icon: "search", onSelect: onNearby },
            { label: "Swap this stop", icon: "swap", onSelect: onSwap, disabled: busy },
            { label: "Remove from this day", icon: "trash", onSelect: onRemove, disabled: busy, danger: true },
          ]}
        />
      ) : null}
      {packages.map((p) => (
        <BookableCard key={p.id} pkg={p} group={group} bookHref={bookingHref(p)} />
      ))}
    </article>
  );
}

/** Day 1 starts with how to get to Daet: listed fares, always labelled as estimates. */
export function GettingThere({ value }: { value: NonNullable<ItineraryResult["gettingThere"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <LineIcon name="bus" className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-daet-ink">Getting there from {value.from}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {value.card
              ? `${value.card.options.length === 1 ? "One listed way" : `${value.card.options.length} listed ways`}${value.card.options[0]?.time ? `, about ${value.card.options[0].time}` : ""}`
              : `No fares listed from ${value.from} yet. Most people go through Manila or Naga, then take a bus or van to Daet.`}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Estimate. Fares change; confirm with the driver or operator{value.checkedOn ? ` (listed fares checked ${value.checkedOn})` : ""}.
          </p>
        </div>
        {value.card ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="min-h-11 shrink-0 rounded-full px-3 text-sm font-bold text-blue-700 dark:text-blue-300">
            {open ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {open && value.card ? <div className="mt-2"><TransportCardView card={value.card} /></div> : null}
    </div>
  );
}
