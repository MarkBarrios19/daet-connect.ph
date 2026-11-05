"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { TransportCardView } from "@/components/assistant/transport-card";
import { RouteMap, type MapPoint } from "@/components/maps/route-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/money";
import type { ItineraryResult } from "@/lib/tours/assistant/plan-tool";
import type { BookablePackage } from "@/lib/tours/itinerary/data";
import { formatClock, type VisitBlock } from "@/lib/tours/itinerary/types";

/** What the panel's buttons call; injected so the panel works without a server in tests. */
export type PanelActions = {
  regenerate: (it: ItineraryResult) => Promise<PanelUpdate>;
  swap: (it: ItineraryResult, day: number, id: string) => Promise<PanelUpdate>;
  remove: (it: ItineraryResult, day: number, id: string) => Promise<PanelUpdate>;
  /** A change in words, e.g. "Make it more relaxed"; the reply says what changed. */
  change: (it: ItineraryResult, text: string) => Promise<PanelUpdate & { reply?: string; input?: ItineraryResult["input"] }>;
};
export type PanelUpdate = { ok: true; plan: ItineraryResult["plan"]; stops: ItineraryResult["stops"]; packages: BookablePackage[] } | { ok: false; message: string };

const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const pillClass = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-bold transition ${on ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-muted text-daet-ink hover:bg-muted-strong"}`;

export const WEATHER_RULE = "If the operator calls this trip off for weather, you pick a new date or get a full refund.";

/**
 * The drafted plan: day pills, a map that follows the day, stops with a menu
 * (ask, nearby, swap, remove) and the tours you can book. Every number shown
 * comes from the plan_trip result or a panel action, never from chat text.
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
  footer?: React.ReactNode;
  /** A change asked from outside the panel (a follow-up chip); runs once per new value. */
  request?: { text: string; id: number } | null;
}) {
  const { plan } = itinerary;
  const [day, setDay] = useState<number | "all">(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(itinerary.stops.map((s) => [s.id, s]));
  const group = itinerary.travelers.adults + itinerary.travelers.children.length;
  const shown = day === "all" ? plan.days.map((d, i) => ({ d, i })) : [{ d: plan.days[day] ?? plan.days[0], i: day }];

  const points: MapPoint[] = shown.flatMap(({ d }) =>
    d.blocks.flatMap((b) => {
      const s = b.kind === "visit" ? byId.get(b.attractionId) : null;
      return s ? [{ lat: s.lat, lng: s.lng, label: s.name }] : [];
    }),
  );

  function run(label: string, call: () => Promise<PanelUpdate>) {
    setMessage(null);
    start(async () => {
      const result = await call().catch(() => ({ ok: false as const, message: "That didn't work. Check your connection and try again." }));
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onChange({ ...itinerary, plan: result.plan, stops: result.stops, packages: result.packages });
      setMessage(label);
    });
  }

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

  return (
    <section aria-labelledby="plan-title" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plan-title" className="text-xl font-bold text-daet-ink">
          Your {plan.days.length}-day plan
        </h2>
        <Button variant="secondary" loading={pending} loadingText="Working…" onClick={() => run("Here is a fresh plan.", () => actions.regenerate(itinerary))}>
          Regenerate
        </Button>
      </div>

      <div className="scrollbar-quiet -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Choose a day">
        {plan.days.map((d, i) => (
          <button key={d.date} type="button" aria-pressed={day === i} onClick={() => setDay(i)} className={pillClass(day === i)}>
            Day {i + 1} <span className="ml-1 font-normal opacity-80">{dayLabel(d.date)}</span>
          </button>
        ))}
        {plan.days.length > 1 ? (
          <button type="button" aria-pressed={day === "all"} onClick={() => setDay("all")} className={pillClass(day === "all")}>
            All days
          </button>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className={message ? "text-sm font-semibold text-daet-ink" : "sr-only"}>
        {message ?? ""}
      </p>

      {points.length ? (
        <div className="h-56 overflow-hidden rounded-2xl sm:h-72">
          <RouteMap points={points} connect={day !== "all"} title={day === "all" ? "Map of all days" : `Map of day ${Number(day) + 1}`} className="h-full" />
        </div>
      ) : null}

      {shown.map(({ d, i }) => (
        <div key={d.date} className="space-y-2">
          {day === "all" ? <h3 className="font-bold text-daet-ink">Day {i + 1} · {dayLabel(d.date)}</h3> : null}
          {i === 0 && itinerary.gettingThere ? <GettingThere value={itinerary.gettingThere} /> : null}
          {d.blocks.length === 0 ? (
            <p className="rounded-2xl bg-canvas p-3 text-sm text-slate-600 dark:text-slate-400">Nothing fits this day yet. Try Regenerate, or ask for different places.</p>
          ) : (
            <ol className="space-y-2">
              {d.blocks.map((b, j) =>
                b.kind === "visit" ? (
                  <li key={`${b.attractionId}-${j}`}>
                    <StopCard
                      block={b}
                      busy={pending}
                      onAsk={() => onAsk(`Tell me about ${b.name}`)}
                      onNearby={() => onAsk(`What's near ${b.name}? Food and places to see.`)}
                      onSwap={() => run(`Swapped ${b.name}.`, () => actions.swap(itinerary, i, b.attractionId))}
                      onRemove={() => run(`Removed ${b.name}.`, () => actions.remove(itinerary, i, b.attractionId))}
                    />
                  </li>
                ) : (
                  <li key={`lunch-${j}`} className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="w-16 shrink-0 font-semibold">{formatClock(b.start)}</span> Lunch break
                  </li>
                ),
              )}
            </ol>
          )}
        </div>
      ))}

      {itinerary.packages.length ? <BookEachTrip itinerary={itinerary} group={group} /> : null}

      <p className="text-xs text-slate-600 dark:text-slate-400">Costs are entrance fees for your group of {group}. Times are estimates; confirm hours marked as not confirmed.</p>
      {footer}
    </section>
  );
}

function StopCard({ block, busy, onAsk, onNearby, onSwap, onRemove }: { block: VisitBlock; busy: boolean; onAsk: () => void; onNearby: () => void; onSwap: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const menuItem = "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-daet-ink hover:bg-muted disabled:opacity-50";
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <div className="flex items-start gap-3">
        <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold text-slate-600 dark:text-slate-400">{formatClock(block.start)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-daet-ink">{block.name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {block.cost > 0 ? `${formatPeso(block.cost)} for your group` : "Free"} · until {formatClock(block.end)}
          </p>
          {block.hoursConfirmed ? null : <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Opening hours not confirmed</p>}
        </div>
        <button type="button" aria-expanded={open} aria-label={`Options for ${block.name}`} onClick={() => setOpen((v) => !v)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold text-daet-ink hover:bg-muted">
          ⋯
        </button>
      </div>
      {open ? (
        <div className="mt-2 grid gap-1 sm:grid-cols-2" role="group" aria-label={`Options for ${block.name}`}>
          <button type="button" className={menuItem} onClick={pick(onAsk)}>Ask about this place</button>
          <button type="button" className={menuItem} onClick={pick(onNearby)}>Find nearby</button>
          <button type="button" className={menuItem} disabled={busy} onClick={pick(onSwap)}>Swap stop</button>
          <button type="button" className={`${menuItem} text-red-700 dark:text-red-300`} disabled={busy} onClick={pick(onRemove)}>Remove</button>
        </div>
      ) : null}
    </div>
  );
}

/** Day 1 starts with how to get to Daet: listed fares, always labelled as estimates. */
function GettingThere({ value }: { value: NonNullable<ItineraryResult["gettingThere"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-canvas p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-daet-ink">Getting there from {value.from}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {value.card
              ? `${value.card.options.length === 1 ? "One listed way" : `${value.card.options.length} listed ways`}${value.card.options[0]?.time ? `, about ${value.card.options[0].time}` : ""}`
              : `No fares listed from ${value.from} yet. Most people go through Manila or Naga, then take a bus or van to Daet.`}
          </p>
        </div>
        {value.card ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="min-h-11 shrink-0 rounded-full px-3 text-sm font-bold text-blue-700 dark:text-blue-300">
            {open ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {open && value.card ? <div className="mt-2"><TransportCardView card={value.card} /></div> : null}
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Estimate. Fares change; confirm with the driver or operator{value.checkedOn ? ` (listed fares checked ${value.checkedOn})` : ""}.
      </p>
    </div>
  );
}

/** What booking a tour costs this group, from the database price; null when no price is listed. */
export function groupPrice(pkg: BookablePackage, group: number): number | null {
  if (!pkg.price) return null;
  return pkg.price.perPerson ? pkg.price.amount * group : pkg.price.amount;
}

/** The first plan day that visits a place the tour passes, so the booking form opens on that date. */
export function bookingHref(pkg: BookablePackage, itinerary: ItineraryResult, group: number): string {
  const day = itinerary.plan.days.find((d) => d.blocks.some((b) => b.kind === "visit" && pkg.matched.includes(b.name))) ?? itinerary.plan.days[0];
  const query = new URLSearchParams({ ...(day ? { date: day.date } : {}), pax: String(group) });
  return `/tours/packages/${pkg.id}/book?${query}`;
}

/** Each bookable tour with its own Book button (each is paid separately), and the total. */
function BookEachTrip({ itinerary, group }: { itinerary: ItineraryResult; group: number }) {
  const prices = itinerary.packages.map((p) => groupPrice(p, group));
  const known = prices.filter((p): p is number => p !== null);
  return (
    <div className="space-y-2">
      <h3 className="font-bold text-daet-ink">Book each trip</h3>
      {itinerary.packages.map((p) => (
        <BookableCard key={p.id} pkg={p} group={group} bookHref={bookingHref(p, itinerary, group)} />
      ))}
      {itinerary.packages.length > 1 && known.length ? (
        <p className="text-sm font-semibold text-daet-ink">
          {known.length < prices.length ? "At least " : "About "}
          {formatPeso(known.reduce((a, b) => a + b, 0))} for all {itinerary.packages.length} trips. Each one is booked and paid separately.
        </p>
      ) : null}
    </div>
  );
}

export function BookableCard({ pkg, group, bookHref }: { pkg: BookablePackage; group: number; bookHref?: string }) {
  const price = pkg.price ? (pkg.price.perPerson ? `from ${formatPeso(pkg.price.amount)} per person · about ${formatPeso(pkg.price.amount * group)} for ${group}` : `from ${formatPeso(pkg.price.amount)} per group`) : null;
  return (
    <div className="rounded-2xl bg-blue-50 p-3 dark:bg-blue-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">Bookable</Badge>
        {pkg.verified ? <span className="text-xs font-bold text-green-800 dark:text-green-300">Verified by the Tourism Office</span> : null}
      </div>
      <p className="mt-1 font-bold text-daet-ink">{pkg.title}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{[pkg.operatorName, `passes ${pkg.matched.slice(0, 2).join(", ")}`].filter(Boolean).join(" · ")}</p>
      {price ? <p className="mt-1 text-sm font-semibold text-daet-ink">{price}</p> : null}
      {pkg.notIncluded.length ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Not included: {pkg.notIncluded.join(", ")}</p> : null}
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{WEATHER_RULE}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {bookHref ? (
          <Link href={bookHref} className="inline-flex min-h-11 items-center rounded-full bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
            Book for {group}
          </Link>
        ) : null}
        <Link href={`/tours/packages/${pkg.id}`} className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-bold text-blue-700 hover:bg-muted dark:text-blue-300">
          View tour
        </Link>
      </div>
    </div>
  );
}
