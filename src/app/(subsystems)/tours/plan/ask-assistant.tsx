"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ASSISTANT_MAX_LENGTH, CHANGE_EXAMPLES } from "@/lib/tours/itinerary/assistant";

export type AssistantTurn = { id: number; request: string; reply: string; changed: boolean; source?: "llm" | "rules"; undo?: () => void };

/** "Ask for a change": plain-language edits to the plan, with a short history and undo. */
export function AskAssistant({
  aiAvailable,
  onRequest,
}: {
  aiAvailable: boolean;
  onRequest: (text: string) => Promise<Omit<AssistantTurn, "id" | "request">>;
}) {
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [pending, startTransition] = useTransition();

  function send(value: string) {
    const request = value.trim();
    if (!request) return;
    startTransition(async () => {
      const turn = await onRequest(request);
      setTurns((current) => [...current.slice(-4).map((t) => ({ ...t, undo: undefined })), { id: Date.now(), request, ...turn }]);
      setText("");
    });
  }

  const last = turns[turns.length - 1];
  return (
    <section aria-labelledby="ask-assistant" className="rounded-2xl bg-daet-leaf p-5 text-white">
      <h2 id="ask-assistant" className="text-base font-bold">
        Ask for a change
      </h2>
      <p className="mt-1 text-sm text-blue-100">
        {aiAvailable ? "Tell our AI assistant what to change." : "Say what to change."} Every change is checked against opening hours, travel time and your budget.
      </p>
      {turns.length ? (
        <ol className="mt-3 space-y-2" aria-live="polite">
          {turns.map((turn) => (
            <li key={turn.id} className="space-y-1">
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl bg-white/15 px-3 py-2 text-sm">{turn.request}</p>
              <div className="w-fit max-w-[90%] rounded-2xl card-edge bg-surface px-3 py-2 text-sm text-daet-ink">
                <p>{turn.reply}</p>
                {turn.undo && turn === last ? (
                  <button
                    type="button"
                    onClick={() => {
                      turn.undo?.();
                      setTurns((current) => current.map((t) => (t.id === turn.id ? { ...t, undo: undefined, reply: `${t.reply} (Undone.)` } : t)));
                    }}
                    className="mt-1 min-h-11 text-sm font-bold text-daet-leaf dark:text-blue-300 underline"
                  >
                    Undo this change
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="assistant-request" className="sr-only">
          What should the assistant change?
        </label>
        <div className="flex gap-2">
          <Input
            id="assistant-request"
            value={text}
            maxLength={ASSISTANT_MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. add Bagasbas Beach to day 2"
            className="mt-0 min-w-0 flex-1 rounded-full border-0"
          />
          <Button type="submit" variant="secondary" loading={pending} loadingText="Thinking…" disabled={!text.trim()}>
            Ask
          </Button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHANGE_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={pending}
            onClick={() => send(example)}
            className="min-h-11 rounded-full border border-blue-200 dark:border-blue-700 px-4 text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-60"
          >
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}
