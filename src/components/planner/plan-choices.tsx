"use client";

import { LineIcon } from "@/components/ui/icons";
import type { Transport } from "@/lib/tours/assistant/plan-tool";

export const PACE_CHOICES = [
  { value: "relaxed", label: "Relaxed" },
  { value: "normal", label: "Balanced" },
  { value: "packed", label: "Packed" },
] as const;

export const TRANSPORT_CHOICES: Array<{ value: Transport | null; label: string }> = [
  { value: "motorbike", label: "Motorbike" },
  { value: "car", label: "Car with driver" },
  { value: "tricycle", label: "Tricycle and van" },
  { value: null, label: "Decide later" },
];

const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition disabled:opacity-60 ${
    on ? "border-2 border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300" : "border border-slate-500 bg-surface text-daet-ink hover:bg-muted"
  }`;

/**
 * The follow-up questions under a plan in the chat (Desktop-Results board):
 * pace drafts the plan again; getting around changes how travel is labelled.
 */
export function PlanChoices({
  pace,
  transport,
  busy,
  status,
  onPace,
  onTransport,
}: {
  pace: string;
  transport: Transport | null | undefined;
  busy: boolean;
  status: string | null;
  onPace: (pace: string) => void;
  onTransport: (transport: Transport | null) => void;
}) {
  return (
    <div className="space-y-3 pt-1">
      <fieldset>
        <legend className="mb-2 font-bold text-daet-ink">What pace do you want?</legend>
        <div className="flex flex-wrap gap-2">
          {PACE_CHOICES.map((p) => (
            <button key={p.value} type="button" aria-pressed={pace === p.value} disabled={busy} onClick={() => pace !== p.value && onPace(p.value)} className={chip(pace === p.value)}>
              {pace === p.value ? <LineIcon name="check" className="h-4 w-4" /> : null}
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-bold text-daet-ink">How will you get around?</legend>
        <div className="flex flex-wrap gap-2">
          {TRANSPORT_CHOICES.map((t) => {
            const on = transport !== undefined && (transport ?? null) === t.value;
            return (
              <button key={t.label} type="button" aria-pressed={on} onClick={() => onTransport(t.value)} className={chip(on)}>
                {on ? <LineIcon name="check" className="h-4 w-4" /> : null}
                {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p role="status" className="min-h-5 text-sm font-semibold text-slate-600 dark:text-slate-400">
        {status ?? ""}
      </p>
    </div>
  );
}
