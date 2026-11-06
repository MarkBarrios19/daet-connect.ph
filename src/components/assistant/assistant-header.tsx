"use client";

import { useEffect, useRef, useState } from "react";
import { AiAvatar } from "@/components/chat/ai-avatar";
import { LineIcon } from "@/components/ui/icons";
import { ASSISTANT_NAME } from "@/lib/tours/assistant/name";
import type { ChatActions } from "@/components/assistant/chat-actions";

/**
 * The assistant's chat header, shared by the dock window, the phone dialog and
 * the Messages page: avatar, name, a plain subtitle (no fake online dot), the
 * "⋯" menu, and whatever window controls the surface needs.
 */
export function AssistantHeader({
  actionsRef,
  controls,
  leading,
  headingId,
  headingLevel = "h2",
  tone = "brand",
}: {
  actionsRef: React.MutableRefObject<ChatActions | null>;
  controls?: React.ReactNode;
  leading?: React.ReactNode;
  headingId?: string;
  headingLevel?: "h1" | "h2";
  /** "brand" is the blue bar used by windows; "plain" sits on the card in Messages. */
  tone?: "brand" | "plain";
}) {
  const Heading = headingLevel;
  const brand = tone === "brand";
  return (
    <header className={`relative flex items-center gap-2 px-2 py-1.5 ${brand ? "bg-blue-600 text-white" : "text-daet-ink sm:px-3"}`}>
      {leading}
      <AiAvatar size="sm" />
      <div className="min-w-0 flex-1">
        <Heading id={headingId} className="truncate text-base font-bold">
          {ASSISTANT_NAME}
        </Heading>
        <p className={`truncate text-sm ${brand ? "text-white/90" : "text-slate-600 dark:text-slate-400"}`}>Travel guide · replies instantly</p>
      </div>
      <AssistantMenu actionsRef={actionsRef} brand={brand} />
      {controls}
    </header>
  );
}

function AssistantMenu({ actionsRef, brand }: { actionsRef: React.MutableRefObject<ChatActions | null>; brand: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const actions = actionsRef.current;
  const empty = !actions?.hasMessages;
  const item = "flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold text-daet-ink hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent";
  const close = () => {
    setOpen(false);
    setConfirm(false);
  };

  // Not `relative`: the menu hangs from the header, so in a narrow window it
  // stays inside it instead of running off the left edge.
  return (
    <div ref={root} className="shrink-0">
      <button
        type="button"
        aria-label="Chat options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`grid h-11 w-11 place-items-center rounded-full ${brand ? "text-white hover:bg-white/15" : "text-daet-ink hover:bg-muted"}`}
      >
        <LineIcon name="more" className="h-5 w-5" />
      </button>
      {open ? (
        <div role="menu" aria-label="Chat options" className="absolute right-2 top-full z-20 mt-1 w-56 max-w-[calc(100%-1rem)] overflow-hidden rounded-2xl bg-surface py-1 shadow-[var(--shadow-float)] card-edge">
          {confirm ? (
            <div className="space-y-1 p-3">
              <p className="text-sm text-daet-ink">Delete this chat history?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    await actionsRef.current?.deleteHistory();
                    close();
                  }}
                  className="min-h-11 flex-1 rounded-full bg-red-600 px-3 text-sm font-bold text-white"
                >
                  Delete
                </button>
                <button type="button" role="menuitem" onClick={() => setConfirm(false)} className="min-h-11 flex-1 rounded-full px-3 text-sm font-bold text-daet-ink hover:bg-muted">
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={empty}
                onClick={() => {
                  if (actionsRef.current?.savedOnServer) return setConfirm(true);
                  actionsRef.current?.newChat();
                  close();
                }}
                className={item}
              >
                New chat
              </button>
              <button type="button" role="menuitem" disabled={empty} onClick={() => setConfirm(true)} className={item}>
                Delete history
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!actions?.canGiveFeedback}
                title={actions?.canGiveFeedback ? undefined : "Available after the assistant replies"}
                onClick={() => {
                  actionsRef.current?.feedback();
                  close();
                }}
                className={item}
              >
                Send feedback
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
