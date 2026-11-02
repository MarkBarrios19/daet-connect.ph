"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { CategoryIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { ATTRACTION_CATEGORIES, isAttractionCategory, type AttractionCategory } from "@/lib/tours/attractions";
import type { PlannerInput } from "@/lib/tours/itinerary/form";
import { MAX_DAYS, MAX_GROUP, type Plan } from "@/lib/tours/itinerary/types";
import { generateItinerary, type GenerateResult } from "./actions";
import { DescribeTrip } from "./describe-trip";
import { PlanEditor } from "./plan-editor";
import { shortDate } from "./plan-format";

type Generated = Extract<GenerateResult, { ok: true }>;

const PACE_LABELS = { relaxed: "Relaxed", normal: "Normal", packed: "Packed" } as const;
const PACE_STOPS = { relaxed: "about 3 stops a day", normal: "about 4 stops a day", packed: "about 5 stops a day" } as const;
const ALL_CATEGORIES = Object.keys(ATTRACTION_CATEGORIES) as AttractionCategory[];

export function PlannerApp({
  defaultDate,
  aiAvailable,
  signedIn,
  initialDescription = "",
}: {
  defaultDate: string;
  aiAvailable: boolean;
  signedIn: boolean;
  initialDescription?: string;
}) {
  const [input, setInput] = useState<PlannerInput>({ startDate: defaultDate, days: 2, budgetPerDay: 500, interests: ["beach", "heritage"], pace: "normal", groupSize: 2, dayStart: "08:00", dayEnd: "18:00" });
  const [useAi, setUseAi] = useState(aiAvailable);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setMessage(null);
    startTransition(async () => {
      const response = await generateItinerary(input, useAi);
      if (!response.ok) {
        setErrors(response.errors);
        setMessage(response.message ?? null);
        return;
      }
      setErrors({});
      setResult(response);
      setPlan(response.plan);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const set = <K extends keyof PlannerInput>(key: K, value: PlannerInput[K]) => setInput((current) => ({ ...current, [key]: value }));

  if (result && plan) {
    return <PlanEditor result={result} plan={plan} setPlan={setPlan} input={input} setInput={setInput} onBack={() => setResult(null)} signedIn={signedIn} />;
  }

  const lastDay = new Date(`${input.startDate}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + Math.max(0, input.days - 1));
  const dates = input.startDate ? (input.days > 1 ? `${shortDate(input.startDate)} to ${shortDate(lastDay.toISOString().slice(0, 10))}` : shortDate(input.startDate)) : "Pick a first day";
  const pace = input.pace in PACE_LABELS ? (input.pace as keyof typeof PACE_LABELS) : "normal";
  const allInterests = ALL_CATEGORIES.every((c) => input.interests.includes(c));
  const likes = input.interests.filter(isAttractionCategory).map((i) => ATTRACTION_CATEGORIES[i].toLowerCase()).join(", ");

  return (
    <form
      className="pb-28 lg:pb-0"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        generate();
      }}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <DescribeTrip aiAvailable={aiAvailable} initialText={initialDescription} input={input} onFill={(next) => { setInput(next); setErrors({}); }} />

          {message ? <Notice variant="error">{message}</Notice> : null}

          <section aria-labelledby="trip-details" className="space-y-8 rounded-2xl card-edge bg-surface p-5 sm:p-6">
            <h2 id="trip-details" className="font-display text-2xl font-semibold text-daet-ink">
              Or set the details
            </h2>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-daet-ink">When and who</h3>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field id="startDate" label="First day" required error={errors.startDate}>
                  <Input id="startDate" type="date" value={input.startDate} min={defaultDate} onChange={(e) => set("startDate", e.target.value)} invalid={Boolean(errors.startDate)} />
                </Field>
                <Stepper id="days" label="Days" value={input.days} min={1} max={MAX_DAYS} unit="day" error={errors.days} onChange={(v) => set("days", v)} />
                <Stepper id="groupSize" label="People" value={input.groupSize} min={1} max={MAX_GROUP} unit="person" error={errors.groupSize} onChange={(v) => set("groupSize", v)} />
              </div>
            </div>

            <fieldset>
              <legend className="text-base font-bold text-daet-ink">What do you enjoy?</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={allInterests}
                  onClick={() => set("interests", allInterests ? [] : ALL_CATEGORIES)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors ${allInterests ? "border-daet-leaf bg-daet-sand text-daet-leaf dark:text-blue-300" : "border-daet-ink/25 bg-surface text-daet-ink hover:bg-daet-sand"}`}
                >
                  All
                </button>
                {(Object.entries(ATTRACTION_CATEGORIES) as Array<[AttractionCategory, string]>).map(([value, label]) => {
                  const on = input.interests.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("interests", on ? input.interests.filter((i) => i !== value) : [...input.interests, value])}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors ${on ? "border-daet-leaf bg-daet-sand text-daet-leaf dark:text-blue-300" : "border-daet-ink/25 bg-surface text-daet-ink hover:bg-daet-sand"}`}
                    >
                      <CategoryIcon category={value} className="h-5 w-5" />
                      {label}
                    </button>
                  );
                })}
              </div>
              {input.interests.length === 0 ? <p className="mt-2 text-sm text-daet-ink/70">No preference: we&apos;ll mix everything.</p> : null}
            </fieldset>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-daet-ink">How you like to travel</h3>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="budgetPerDay" label="Entrance-fee budget (₱ per person per day)" hint="Food and transport are not included." error={errors.budgetPerDay}>
                  <Input id="budgetPerDay" type="number" inputMode="numeric" min={0} value={input.budgetPerDay} onChange={(e) => set("budgetPerDay", Number(e.target.value))} invalid={Boolean(errors.budgetPerDay)} />
                </Field>
                <fieldset>
                  <legend className="text-sm font-bold text-daet-ink">Pace</legend>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {(Object.keys(PACE_LABELS) as Array<keyof typeof PACE_LABELS>).map((pace) => (
                      <label key={pace} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-daet-ink/25 bg-surface text-sm font-bold text-daet-ink transition-colors has-[:checked]:border-daet-leaf has-[:checked]:bg-daet-sand has-[:checked]:text-daet-leaf dark:has-[:checked]:text-blue-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-daet-forest/40">
                        <input type="radio" name="pace" value={pace} checked={input.pace === pace} onChange={() => set("pace", pace)} className="sr-only" />
                        {PACE_LABELS[pace]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="dayStart" label="Start each day at" error={errors.dayStart}>
                  <Input id="dayStart" type="time" value={input.dayStart} onChange={(e) => set("dayStart", e.target.value)} invalid={Boolean(errors.dayStart)} />
                </Field>
                <Field id="dayEnd" label="Finish by" error={errors.dayEnd}>
                  <Input id="dayEnd" type="time" value={input.dayEnd} onChange={(e) => set("dayEnd", e.target.value)} invalid={Boolean(errors.dayEnd)} />
                </Field>
              </div>
            </div>

            {aiAvailable ? (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-daet-sand/60 p-4">
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="mt-0.5 h-5 w-5 accent-daet-forest" />
                <span>
                  <span className="block text-sm font-bold text-daet-ink">Polish with AI</span>
                  <span className="block text-sm text-daet-ink/70">Reorders stops and adds tips using only our attraction list. Every suggestion is checked against opening hours and your budget.</span>
                </span>
              </label>
            ) : null}
          </section>
        </div>

        {/* On phones this is the sticky bottom bar; from lg it is the "your trip so far" card. */}
        <aside
          aria-label="Your trip so far"
          className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-daet-ink/10 bg-surface px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 print:hidden lg:sticky lg:top-6 lg:z-auto lg:block lg:rounded-2xl lg:border-0 lg:bg-daet-leaf lg:p-6 lg:text-white"
        >
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-bold text-daet-ink">{dates}</p>
            <p className="truncate text-sm text-daet-ink/70">
              {input.groupSize} {input.groupSize === 1 ? "person" : "people"}
            </p>
          </div>
          <div className="hidden lg:block">
            <h2 className="font-display text-2xl font-semibold">Your trip so far</h2>
            <dl className="mt-4 space-y-3">
              <Summary term="Dates" detail={dates} />
              <Summary term="Group" detail={`${input.groupSize} ${input.groupSize === 1 ? "person" : "people"}`} />
              <Summary term="Into" detail={likes || "Nothing picked yet"} />
              <Summary term="Pace" detail={`${PACE_LABELS[pace]}, ${PACE_STOPS[pace]}`} />
            </dl>
          </div>
          <Button type="submit" size="lg" loading={pending} loadingText="Planning your trip…" className="shrink-0 lg:mt-6 lg:w-full lg:bg-surface lg:text-daet-leaf dark:lg:text-blue-300 lg:hover:bg-daet-sand">
            Plan my trip
          </Button>
          <p className="mt-3 hidden text-sm text-blue-100 lg:block">Every stop is checked against opening hours, travel time and your budget. You can change anything afterwards.</p>
        </aside>
      </div>
    </form>
  );
}

function Summary({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-sm text-blue-100">{term}</dt>
      <dd className="text-lg font-bold leading-6">{detail}</dd>
    </div>
  );
}

/** A number input with round minus and plus buttons; typing still works. */
function Stepper({ id, label, value, min, max, unit, error, onChange }: { id: string; label: string; value: number; min: number; max: number; unit: string; error?: string; onChange: (value: number) => void }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  const stepButton = "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-daet-ink/25 bg-surface text-xl text-daet-ink transition-colors hover:bg-daet-sand disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-daet-ink">
        {label}
        <span className="text-red-600 dark:text-red-300" aria-hidden="true">
          {" "}*
        </span>
      </label>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" className={stepButton} aria-label={`One ${unit} fewer`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
          <span aria-hidden="true">&minus;</span>
        </button>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0 w-20 text-center"
        />
        <button type="button" className={stepButton} aria-label={`One ${unit} more`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
