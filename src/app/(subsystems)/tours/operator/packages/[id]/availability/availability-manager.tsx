"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { MAX_CAPACITY, MAX_DATES_PER_BATCH, seatsLeft, type AvailabilityRow } from "@/lib/tours/availability";
import { closeDate, openDates, updateDateCapacity, type OpenDatesState } from "./actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatDate = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const initialState: OpenDatesState = { message: null, error: null, errors: {} };

export function OpenDatesForm({ packageId, today }: { packageId: string; today: string }) {
  const [state, formAction, pending] = useActionState(openDates, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="packageId" value={packageId} />
      {state.message ? <Notice variant="success">{state.message}</Notice> : null}
      {state.error ? <Notice variant="error">{state.error}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="startDate" label="From" required error={state.errors.startDate}>
          <Input id="startDate" name="startDate" type="date" min={today} required invalid={Boolean(state.errors.startDate)} />
        </Field>
        <Field id="endDate" label="To" hint="Leave empty for a single date." error={state.errors.endDate}>
          <Input id="endDate" name="endDate" type="date" min={today} invalid={Boolean(state.errors.endDate)} />
        </Field>
        <Field id="capacity" label="Seats per date" required error={state.errors.capacity}>
          <Input id="capacity" name="capacity" type="number" inputMode="numeric" min={1} max={MAX_CAPACITY} defaultValue={10} required invalid={Boolean(state.errors.capacity)} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-bold text-daet-ink">
          Days of the week <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEEKDAYS.map((label, index) => (
            <label
              key={label}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-daet-ink/20 bg-surface px-4 text-sm font-bold text-daet-ink has-[:checked]:border-daet-forest has-[:checked]:bg-daet-forest/10"
            >
              <input type="checkbox" name="weekday" value={index} defaultChecked className="h-4 w-4 accent-daet-forest" />
              {label}
            </label>
          ))}
        </div>
        {state.errors.weekday ? <p className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">{state.errors.weekday}</p> : null}
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Up to {MAX_DATES_PER_BATCH} dates at a time. Dates already open are left unchanged.</p>
      </fieldset>

      <Button type="submit" loading={pending} loadingText="Opening dates…">
        Open dates
      </Button>
    </form>
  );
}

export function AvailabilityList({ packageId, rows }: { packageId: string; rows: AvailabilityRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [closing, setClosing] = useState<AvailabilityRow | null>(null);

  function run(action: (formData: FormData) => Promise<{ success: boolean; message?: string; error?: string }>, formData: FormData) {
    formData.set("packageId", packageId);
    startTransition(async () => {
      const response = await action(formData);
      setResult(response.success ? { tone: "success", text: response.message ?? "Saved." } : { tone: "error", text: response.error ?? "Something went wrong." });
      if (response.success) {
        setClosing(null);
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl bg-daet-sand/40 p-4 text-sm text-daet-ink/70">
        No upcoming open dates. Until you open dates, tourists can request any future date.
      </p>
    );
  }

  return (
    <div>
      {result ? <Notice variant={result.tone} className="mb-3">{result.text}</Notice> : null}
      <ul className="divide-y divide-daet-ink/10 rounded-2xl card-edge bg-surface">
        {rows.map((row) => {
          const left = seatsLeft(row);
          return (
            <li key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-daet-ink">{formatDate(row.available_date)}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-daet-ink/70">
                  {row.capacity_booked} of {row.capacity_total} booked
                  {left === 0 ? <Badge tone="danger">Full</Badge> : <Badge tone="success">{left} left</Badge>}
                </p>
              </div>
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(updateDateCapacity, new FormData(event.currentTarget));
                }}
              >
                <input type="hidden" name="availabilityId" value={row.id} />
                <label className="text-sm text-slate-600 dark:text-slate-400">
                  Seats
                  <Input
                    name="capacity"
                    type="number"
                    inputMode="numeric"
                    min={Math.max(1, row.capacity_booked)}
                    max={MAX_CAPACITY}
                    defaultValue={row.capacity_total}
                    aria-label={`Seats on ${formatDate(row.available_date)}`}
                    className="w-24"
                  />
                </label>
                <Button type="submit" variant="secondary" disabled={pending}>
                  Save
                </Button>
                <Button
                  variant="danger"
                  disabled={pending || row.capacity_booked > 0}
                  title={row.capacity_booked > 0 ? "This date has bookings. Lower its seats to the booked count to stop new bookings." : undefined}
                  onClick={() => setClosing(row)}
                >
                  Close
                </Button>
              </form>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={closing !== null}
        title="Close this date?"
        description={closing ? `${formatDate(closing.available_date)} will no longer be offered to tourists.` : undefined}
        confirmLabel="Close date"
        loading={pending}
        onCancel={() => setClosing(null)}
        onConfirm={() => {
          if (!closing?.id) return;
          const formData = new FormData();
          formData.set("availabilityId", closing.id);
          run(closeDate, formData);
        }}
      />
    </div>
  );
}
