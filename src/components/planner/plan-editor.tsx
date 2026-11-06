"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CategoryIcon, LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import type { ItineraryResult, PlanStop } from "@/lib/tours/assistant/plan-tool";
import type { StopChoice } from "@/lib/tours/itinerary/edit";
import { formatClock, type PlanDay, type VisitBlock } from "@/lib/tours/itinerary/types";

const longDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const container = (day: number) => `day-${day}`;
const visits = (day: PlanDay) => day.blocks.filter((b): b is VisitBlock => b.kind === "visit");

/** Moves one stop to a new place in the day-by-day order; `over` is a stop or a day's list. */
export function moveInOrders(orders: string[][], active: string, over: string): string[][] {
  const from = orders.findIndex((ids) => ids.includes(active));
  const overDay = over.startsWith("day-") ? Number(over.slice(4)) : orders.findIndex((ids) => ids.includes(over));
  if (from < 0 || overDay < 0 || active === over) return orders;
  const next = orders.map((ids) => ids.filter((id) => id !== active));
  const target = next[overDay];
  const at = over.startsWith("day-") ? target.length : orders[overDay].indexOf(over);
  // Within one day dnd-kit reports the stop it lands on: take its place.
  const index = from === overDay ? at : at < 0 ? target.length : at;
  target.splice(Math.max(0, Math.min(index, target.length)), 0, active);
  return next;
}

/**
 * The Desktop-Edit board: each stop with a remove button, its photo, time and
 * cost, and a drag handle. Stops are dragged within a day, or between days
 * when all days are shown. Phones press and hold the handle; keyboards use
 * Space and the arrow keys. The engine re-times every change on the server;
 * a change that doesn't fit snaps back with the reason.
 */
export function PlanEditor({
  itinerary,
  days,
  busy,
  onReorder,
  onRemove,
  loadChoices,
  onAdd,
}: {
  itinerary: ItineraryResult;
  /** The day indexes shown (one day, or all). */
  days: number[];
  busy: boolean;
  onReorder: (orders: string[][]) => Promise<boolean>;
  onRemove: (day: number, block: VisitBlock) => void;
  loadChoices: (day: number) => Promise<StopChoice[] | string>;
  onAdd: (day: number, choice: StopChoice) => void;
}) {
  const dndId = useId();
  const stops = useMemo(() => new Map(itinerary.stops.map((s) => [s.id, s])), [itinerary.stops]);
  const planOrders = useMemo(() => itinerary.plan.days.map((d) => visits(d).map((b) => b.attractionId)), [itinerary.plan.days]);
  const [orders, setOrders] = useState(planOrders);
  // A new plan from the server (or a snapped-back order) replaces the local one.
  useEffect(() => setOrders(planOrders), [planOrders]);

  const blockFor = new Map(itinerary.plan.days.flatMap((d, i) => visits(d).map((b) => [b.attractionId, { block: b, day: i }] as const)));
  const nameOf = (id: UniqueIdentifier) => blockFor.get(String(id))?.block.name ?? stops.get(String(id))?.name ?? "This stop";
  const placeOf = (id: UniqueIdentifier) => {
    const d = orders.findIndex((ids) => ids.includes(String(id)));
    return d < 0 ? "" : `position ${orders[d].indexOf(String(id)) + 1} on Day ${d + 1}`;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold, so a phone can still scroll the plan.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, at ${placeOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over ${String(over.id).startsWith("day-") ? `the end of Day ${Number(String(over.id).slice(4)) + 1}` : nameOf(over.id)}.` : `${nameOf(active.id)} is not over a stop.`),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped. Checking the new times.` : `${nameOf(active.id)} returned to its place.`),
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} cancelled.`,
  };

  async function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const next = moveInOrders(orders, String(event.active.id), String(event.over.id));
    if (next === orders || JSON.stringify(next) === JSON.stringify(orders)) return;
    setOrders(next);
    const ok = await onReorder(next);
    if (!ok) setOrders(planOrders);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Drag to reorder{days.length > 1 ? " or move a stop to another day" : ""}. Remove a stop with the minus.
      </p>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)} accessibility={{ announcements, screenReaderInstructions: { draggable: "To move a stop, press Space on its handle, use the arrow keys, then press Space again to drop it, or Escape to cancel." } }}>
        {days.map((i) => (
          <DayList
            key={itinerary.plan.days[i].date}
            index={i}
            date={itinerary.plan.days[i].date}
            ids={orders[i] ?? []}
            blockFor={blockFor}
            stops={stops}
            busy={busy}
            onRemove={onRemove}
            loadChoices={loadChoices}
            onAdd={onAdd}
          />
        ))}
      </DndContext>
    </div>
  );
}

function DayList({
  index,
  date,
  ids,
  blockFor,
  stops,
  busy,
  onRemove,
  loadChoices,
  onAdd,
}: {
  index: number;
  date: string;
  ids: string[];
  blockFor: Map<string, { block: VisitBlock; day: number }>;
  stops: Map<string, PlanStop>;
  busy: boolean;
  onRemove: (day: number, block: VisitBlock) => void;
  loadChoices: (day: number) => Promise<StopChoice[] | string>;
  onAdd: (day: number, choice: StopChoice) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: container(index) });
  return (
    <section aria-label={`Day ${index + 1} stops`} className="space-y-2">
      <h3 className="font-bold text-daet-ink">
        Day {index + 1} · {longDay(date)}
      </h3>
      <SortableContext id={container(index)} items={ids} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className={`min-h-16 space-y-2 rounded-2xl p-1 ${isOver && !ids.length ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}>
          {ids.length ? (
            ids.map((id, n) => <SortableRow key={id} id={id} number={n + 1} entry={blockFor.get(id)} stop={stops.get(id)} busy={busy} onRemove={(b) => onRemove(blockFor.get(id)?.day ?? index, b)} />)
          ) : (
            <li className="flex min-h-14 items-center rounded-xl px-3 text-sm text-slate-600 dark:text-slate-400">No stops yet. Drag one here or add a stop.</li>
          )}
        </ol>
      </SortableContext>
      <AddStop day={index} busy={busy} loadChoices={loadChoices} onAdd={onAdd} />
    </section>
  );
}

function SortableRow({ id, number, entry, stop, busy, onRemove }: { id: string; number: number; entry: { block: VisitBlock } | undefined; stop: PlanStop | undefined; busy: boolean; onRemove: (b: VisitBlock) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const name = entry?.block.name ?? stop?.name ?? "Stop";
  const block = entry?.block;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl bg-surface py-2 pl-1 pr-2 motion-reduce:transition-none ${isDragging ? "relative z-10 bg-blue-50 outline outline-2 -outline-offset-2 outline-blue-600 dark:bg-blue-950/60" : ""}`}
    >
      <button type="button" disabled={busy || !block} onClick={() => block && onRemove(block)} aria-label={`Remove ${name}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-muted disabled:opacity-40 dark:text-red-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8" />
        </svg>
      </button>
      {stop?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- listing photos come from many hosts
        <img src={stop.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover sm:h-16 sm:w-16" />
      ) : (
        <span aria-hidden="true" className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800 sm:h-16 sm:w-16 dark:bg-blue-950/40 dark:text-blue-300">
          <CategoryIcon category={stop?.category ?? "nature"} className="h-6 w-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-daet-ink">
          <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 align-[1px] text-[13px] text-white">{number}</span>
          {name}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">{block ? `${formatClock(block.start)} · ${block.cost > 0 ? formatPeso(block.cost) : "Free"}` : "Checking the time…"}</p>
      </div>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${name}`}
        className={`inline-flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-full text-slate-600 hover:bg-muted dark:text-slate-400 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
    </li>
  );
}

/** "Add a stop": listed places not yet in the plan that suit the day, best first. */
function AddStop({ day, busy, loadChoices, onAdd }: { day: number; busy: boolean; loadChoices: (day: number) => Promise<StopChoice[] | string>; onAdd: (day: number, choice: StopChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<StopChoice[] | string | null>(null);
  const listId = useId();
  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    setChoices(null);
    setChoices(await loadChoices(day).catch(() => "Places could not be loaded. Please try again."));
  }
  return (
    <div className="space-y-2">
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => void toggle()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-500 bg-surface px-5 text-sm font-bold text-daet-ink hover:bg-muted">
        <LineIcon name="plus" className="h-4 w-4" /> Add a stop
      </button>
      {open ? (
        <div id={listId} className="rounded-2xl bg-surface p-2">
          {choices === null ? (
            <p role="status" className="px-2 py-3 text-sm text-slate-600 dark:text-slate-400">Finding places…</p>
          ) : typeof choices === "string" ? (
            <p role="alert" className="px-2 py-3 text-sm font-semibold text-red-600 dark:text-red-300">{choices}</p>
          ) : choices.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-600 dark:text-slate-400">Every listed place is already in your plan.</p>
          ) : (
            <ul className="divide-y divide-line">
              {choices.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-2 py-2">
                  <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                    <CategoryIcon category={c.category} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-daet-ink">{c.name}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{c.fee ? `${formatPeso(c.fee)} per person` : "Free"}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setOpen(false);
                      onAdd(day, c);
                    }}
                    aria-label={`Add ${c.name} to Day ${day + 1}`}
                    className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-blue-700 hover:bg-muted disabled:opacity-50 dark:text-blue-300"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
