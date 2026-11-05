"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { ASSISTANT_MAX_LENGTH, TRIP_EXAMPLES } from "@/lib/tours/itinerary/assistant";
import type { PlannerInput } from "@/lib/tours/itinerary/form";
import { interpretTripRequest } from "./actions";

/** "Describe your trip": plain words in, form fields out (Gemini when configured, rules otherwise). */
export function DescribeTrip({
  aiAvailable,
  initialText = "",
  input,
  onFill,
}: {
  aiAvailable: boolean;
  initialText?: string;
  input: PlannerInput;
  onFill: (input: PlannerInput) => void;
}) {
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<{ tone: "success" | "error"; understood?: string[]; text?: string; source?: "llm" | "rules" } | null>(null);
  const [pending, startTransition] = useTransition();

  function interpret(value: string) {
    startTransition(async () => {
      const response = await interpretTripRequest(value, input);
      if (!response.ok) {
        setState({ tone: "error", text: response.message });
        return;
      }
      onFill(response.input);
      setState({ tone: "success", understood: response.understood, source: response.source });
    });
  }

  return (
    <section aria-labelledby="describe-trip" className="rounded-2xl card-edge bg-surface p-5 sm:p-6">
      <h2 id="describe-trip" className="font-display text-2xl font-semibold text-daet-ink">
        Describe your trip
      </h2>
      <p className="mt-1 text-sm text-daet-ink/70">
        Write it the way you would tell a friend, in English or Taglish. {aiAvailable ? "Our AI assistant fills" : "We fill"} in the details below; check them, then plan.
      </p>
      <label htmlFor="trip-description" className="sr-only">
        Describe your trip
      </label>
      <Textarea
        id="trip-description"
        rows={3}
        maxLength={ASSISTANT_MAX_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={TRIP_EXAMPLES[0]}
        className="mt-3"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {TRIP_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setText(example);
              interpret(example);
            }}
            className="min-h-11 rounded-full border border-daet-ink/25 bg-surface px-4 py-2 text-left text-sm text-daet-ink transition-colors hover:bg-daet-sand"
          >
            {example}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" loading={pending} loadingText="Reading…" disabled={text.trim().length < 3} onClick={() => interpret(text)}>
          Fill in the form
        </Button>
        <span className="text-sm text-daet-ink/70">
          {text.length}/{ASSISTANT_MAX_LENGTH}
        </span>
      </div>
      <div aria-live="polite">
        {state?.tone === "error" ? (
          <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{state.text}</p>
        ) : state?.understood ? (
          <div className="mt-3">
            <p className="text-sm font-bold text-daet-ink">
              Got it{state.source === "llm" ? " (AI)" : ""}. I set:
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {state.understood.map((item) => (
                <li key={item}>
                  <Badge tone="brand">{item}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
