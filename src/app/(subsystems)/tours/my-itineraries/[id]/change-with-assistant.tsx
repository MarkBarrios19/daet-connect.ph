"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineIcon } from "@/components/ui/icons";
import { HANDOFF_KEY } from "@/components/assistant/assistant-chat";
import { openSavedInPlanner } from "../../plan/panel-actions";

/** Opens the saved trip in the chat planner, with its places in their saved order. */
export function ChangeWithAssistant({ id, className }: { id: string; className: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const result = await openSavedInPlanner(id);
            if (!result.ok) {
              setMessage(result.message);
              return;
            }
            try {
              window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(result.itinerary));
            } catch {
              setMessage("Your browser blocked this. Open the planner and describe the trip instead.");
              return;
            }
            router.push("/tours/plan");
          })
        }
      >
        <LineIcon name="chat" className="h-[18px] w-[18px]" />
        {pending ? "Opening…" : "Change with the assistant"}
      </button>
      {message ? (
        <span role="status" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {message}
        </span>
      ) : null}
    </span>
  );
}
