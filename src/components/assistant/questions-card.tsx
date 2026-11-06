"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_ADULTS, MAX_CHILDREN, MAX_TRIP_DAYS, ORIGIN_CHIPS, sampleDates, tripDays, type TripContext } from "@/lib/tours/assistant/context";

type Answers = Required<Pick<TripContext, "dates" | "travelers" | "origin">> & { sample?: boolean };
type Errors = Partial<Record<"dates" | "children" | "origin", string>>;

const field = "block min-h-11 w-full rounded-xl bg-surface px-3 text-base text-daet-ink focus:outline-none focus:ring-2 focus:ring-blue-600/40";
const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold transition active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none ${on ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"}`;

/**
 * "Before I draft": the three answers a plan needs. Child ages are required for
 * each child, because prices and pace depend on them. Nothing leaves the
 * browser until the traveller taps Draft my plan.
 */
export function QuestionsCard({ prefill, today, onSubmit, title = "Before I draft", submitLabel = "Draft my plan" }: { prefill: TripContext | null; today: string; onSubmit: (answers: Answers) => void; title?: string; submitLabel?: string }) {
  const id = useId();
  const [start, setStart] = useState(prefill?.dates?.start ?? "");
  const [end, setEnd] = useState(prefill?.dates?.end ?? "");
  // "No dates yet" (decision 35): a sample plan of this many days.
  const [noDates, setNoDates] = useState(Boolean(prefill?.sample));
  const [sampleDays, setSampleDays] = useState(prefill?.sample && prefill.dates ? tripDays(prefill.dates) : 2);
  const [adults, setAdults] = useState(prefill?.travelers?.adults ?? 2);
  // Kept as text so a child's age can be blank until it is filled in.
  const [ages, setAges] = useState<string[]>((prefill?.travelers?.children ?? []).map(String));
  const prefillCity = prefill?.origin?.city ?? "";
  const [city, setCity] = useState<string>(ORIGIN_CHIPS.includes(prefillCity as (typeof ORIGIN_CHIPS)[number]) ? prefillCity : "");
  const [other, setOther] = useState(prefillCity && !ORIGIN_CHIPS.includes(prefillCity as (typeof ORIGIN_CHIPS)[number]) ? prefillCity : "");
  const [errors, setErrors] = useState<Errors>({});

  const origin = other.trim() || city;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    const days = start && end ? tripDays({ start, end }) : 0;
    if (noDates) {
      // no dates to check
    } else if (!start || !end) next.dates = "Pick your first and last day.";
    else if (start < today) next.dates = "Pick dates from today onward.";
    else if (days < 1) next.dates = "The last day can't be before the first.";
    else if (days > MAX_TRIP_DAYS) next.dates = `Plans cover up to ${MAX_TRIP_DAYS} days.`;
    const children = ages.map((a) => (a.trim() === "" ? NaN : Number(a)));
    if (children.some((a) => !Number.isInteger(a) || a < 0 || a > 17)) next.children = "Add each child's age, 0 to 17.";
    if (!origin) next.origin = "Choose a city or type where you're travelling from.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const travelers = { adults, children };
    if (noDates) onSubmit({ dates: sampleDates(today, sampleDays), travelers, origin: { city: origin.slice(0, 60) }, sample: true });
    else onSubmit({ dates: { start, end }, travelers, origin: { city: origin.slice(0, 60) } });
  }

  return (
    <form onSubmit={submit} noValidate aria-label={title} className="min-w-0 space-y-4 rounded-[1.25rem] rounded-bl-md bg-muted p-3">
      <p className="font-bold text-daet-ink">{title}</p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-daet-ink">Dates</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-daet-ink">
          <input type="checkbox" checked={noDates} onChange={(e) => setNoDates(e.target.checked)} className="h-5 w-5 accent-blue-600" />
          No dates yet, show me a sample plan
        </label>
        {noDates ? (
          <label className="block text-sm text-slate-600 dark:text-slate-400">
            How many days?
            <select value={sampleDays} onChange={(e) => setSampleDays(Number(e.target.value))} className={field}>
              {Array.from({ length: MAX_TRIP_DAYS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} day{n === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-slate-600 dark:text-slate-400">
            First day
            <input type="date" min={today} value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} className={field} aria-describedby={errors.dates ? `${id}-dates` : undefined} aria-invalid={Boolean(errors.dates)} />
          </label>
          <label className="text-sm text-slate-600 dark:text-slate-400">
            Last day
            <input type="date" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} className={field} aria-invalid={Boolean(errors.dates)} />
          </label>
        </div>
        )}
        {errors.dates ? <p id={`${id}-dates`} role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{errors.dates}</p> : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-daet-ink">Who is coming</legend>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-daet-ink">Adults</span>
          <Stepper label="adults" value={adults} min={1} max={MAX_ADULTS} onChange={setAdults} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-daet-ink">Children</span>
          <Stepper
            label="children"
            value={ages.length}
            min={0}
            max={MAX_CHILDREN}
            onChange={(n) => setAges((list) => (n > list.length ? [...list, ...Array(n - list.length).fill("")] : list.slice(0, n)))}
          />
        </div>
        {ages.map((age, i) => (
          <label key={i} className="block text-sm text-slate-600 dark:text-slate-400">
            Child {i + 1} age
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={age}
              onChange={(e) => setAges((list) => list.map((a, j) => (j === i ? e.target.value.replace(/\D/g, "") : a)))}
              className={field}
              aria-invalid={Boolean(errors.children) && age.trim() === ""}
            />
          </label>
        ))}
        {errors.children ? <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{errors.children}</p> : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-daet-ink">Travelling from</legend>
        <div className="flex flex-wrap gap-2">
          {ORIGIN_CHIPS.map((name) => (
            <button key={name} type="button" aria-pressed={!other.trim() && city === name} onClick={() => { setCity(name); setOther(""); }} className={chip(!other.trim() && city === name)}>
              {name}
            </button>
          ))}
        </div>
        <label className="block text-sm text-slate-600 dark:text-slate-400">
          Somewhere else
          <input value={other} maxLength={60} onChange={(e) => setOther(e.target.value)} placeholder="Type a city" className={field} aria-invalid={Boolean(errors.origin)} />
        </label>
        {errors.origin ? <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{errors.origin}</p> : null}
      </fieldset>

      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const btn = "inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-lg font-bold text-daet-ink disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>
        −
      </button>
      <span className="min-w-6 text-center font-bold text-daet-ink" aria-live="polite">
        {value}
        <span className="sr-only"> {label}</span>
      </span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>
        +
      </button>
    </div>
  );
}
