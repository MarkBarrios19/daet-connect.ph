"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { dockThread, type DockThread } from "@/app/(subsystems)/tours/messages/actions";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { AiAvatar } from "@/components/chat/ai-avatar";
import { ChatWindow } from "@/components/chat/chat-window";
import { LineIcon } from "@/components/ui/icons";
import { ASSISTANT_NAME } from "@/lib/tours/assistant/name";
import { dockClose, dockMinimize, dockOpen, DOCK_OPEN_EVENT, setDockActive, setDockBusy } from "@/components/chat-dock/dock-bus";

const STORAGE_KEY = "daet-dock-v1";
const WIDE = "(min-width: 1024px)";
type DockState = { open: string[]; heads: string[]; titles: Record<string, string> };
const EMPTY: DockState = { open: [], heads: [], titles: {} };

function load(): DockState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DockState) : EMPTY;
    return Array.isArray(parsed.open) && Array.isArray(parsed.heads) ? { ...EMPTY, ...parsed } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * Messenger-style chat heads on wide screens: up to two chat windows at the
 * bottom right, and round heads for minimised chats, the Daet AI assistant
 * included. Phones keep using the full-screen chat pages.
 */
export function ChatDock() {
  const pathname = usePathname() ?? "";
  const onMessages = pathname.startsWith("/tours/messages");
  const [wide, setWide] = useState(false);
  const [state, setState] = useState<DockState>(EMPTY);

  useEffect(() => {
    const media = window.matchMedia(WIDE);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    setState(load());
    return () => media.removeEventListener("change", update);
  }, []);

  const active = wide && !onMessages;
  useEffect(() => {
    setDockActive(active);
    return () => setDockActive(false);
  }, [active]);

  // Tell the floating assistant pill whether a window is on screen: it sits in
  // the corner an open window occupies, so it stands down until the dock folds
  // back into heads.
  const hasWindow = state.open.length > 0;
  useEffect(() => {
    if (!active) return;
    setDockBusy(hasWindow);
    return () => setDockBusy(false);
  }, [active, hasWindow]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage blocked: the dock still works for this page.
    }
  }, [state]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (typeof id === "string" && id) setState((s) => ({ ...s, ...dockOpen(s, id) }));
    };
    window.addEventListener(DOCK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(DOCK_OPEN_EVENT, onOpen);
  }, []);

  if (!active || (state.open.length === 0 && state.heads.length === 0)) return null;

  const title = (id: string) => (id === "ai" ? ASSISTANT_NAME : (state.titles[id] ?? "Chat"));
  const setTitle = (id: string, value: string) => setState((s) => (s.titles[id] === value ? s : { ...s, titles: { ...s.titles, [id]: value } }));

  return (
    // z-[900]: above every layer the page itself paints (the map's mini card is
    // z-[800], the header z-40). The dock is site chrome, not page content.
    <div aria-label="Open chats" role="region" className="pointer-events-none fixed bottom-0 right-24 z-[900] hidden items-end gap-3 lg:flex print:hidden">
      {[...state.open].reverse().map((id) => (
        <div key={id} className="pointer-events-auto flex h-[30rem] w-[22rem] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-[var(--shadow-float)]">
          {id === "ai" ? (
            <AiDockWindow onMinimize={() => setState((s) => ({ ...s, ...dockMinimize(s, id) }))} onClose={() => setState((s) => ({ ...s, ...dockClose(s, id) }))} />
          ) : (
            <ThreadDockWindow
              id={id}
              onLoaded={(t) => setTitle(id, t)}
              onMinimize={() => setState((s) => ({ ...s, ...dockMinimize(s, id) }))}
              onClose={() => setState((s) => ({ ...s, ...dockClose(s, id) }))}
            />
          )}
        </div>
      ))}
      {/* The assistant has no head of its own: the floating assistant button in
          the corner is the same round icon and reopens it, so a head would be a
          second, identical button beside it. */}
      {state.heads.some((id) => id !== "ai") ? (
        <ul className="pointer-events-auto mb-24 flex flex-col gap-2" aria-label="Minimised chats">
          {state.heads.filter((id) => id !== "ai").map((id) => (
            <li key={id} className="group relative">
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, ...dockOpen(s, id) }))}
                aria-label={`Open chat: ${title(id)}`}
                title={title(id)}
                className="grid h-12 w-12 place-items-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-lg font-bold text-blue-800 dark:text-blue-300 shadow-[var(--shadow-float)] transition hover:scale-105"
              >
                {id === "ai" ? <AiAvatar /> : title(id).slice(0, 1).toUpperCase()}
              </button>
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, ...dockClose(s, id) }))}
                aria-label={`Close chat: ${title(id)}`}
                className="absolute -left-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-surface text-slate-700 dark:text-slate-300 opacity-0 shadow-[var(--shadow-float)] transition focus-visible:opacity-100 group-hover:opacity-100"
              >
                <LineIcon name="close" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WindowControls({ name, onMinimize, onClose, href }: { name: string; onMinimize: () => void; onClose: () => void; href: string }) {
  const btn = "grid h-11 w-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/15";
  return (
    <span className="flex shrink-0">
      <a href={href} aria-label={`Open ${name} full screen`} className={btn}>
        <LineIcon name="arrowRight" className="h-5 w-5 -rotate-45" />
      </a>
      <button type="button" onClick={onMinimize} aria-label={`Minimise ${name}`} className={btn}>
        <span aria-hidden="true" className="h-0.5 w-4 rounded bg-surface" />
      </button>
      <button type="button" onClick={onClose} aria-label={`Close ${name}`} className={btn}>
        <LineIcon name="close" className="h-5 w-5" />
      </button>
    </span>
  );
}

function ThreadDockWindow({ id, onLoaded, onMinimize, onClose }: { id: string; onLoaded: (title: string) => void; onMinimize: () => void; onClose: () => void }) {
  const [thread, setThread] = useState<DockThread | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    dockThread(id)
      .then((t) => {
        if (cancelled) return;
        setThread(t);
        if (t) {
          onLoaded(t.title);
          window.dispatchEvent(new Event("daet:chat-read"));
        }
      })
      .catch(() => !cancelled && setThread(null));
    return () => {
      cancelled = true;
    };
    // onLoaded changes identity each render; loading depends on the chat only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (thread === undefined || thread === null) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 bg-blue-600 px-3 py-1.5 text-white">
          <p className="flex-1 font-bold">{thread === null ? "Chat unavailable" : "Opening chat…"}</p>
          <WindowControls name="chat" href={`/tours/messages/${id}`} onMinimize={onMinimize} onClose={onClose} />
        </div>
        <p className="p-4 text-slate-600 dark:text-slate-400">{thread === null ? "This chat could not be opened." : "Loading messages…"}</p>
      </div>
    );
  }
  return (
    <ChatWindow
      conversationId={thread.conversationId}
      viewerId={thread.viewerId}
      members={thread.members}
      title={thread.title}
      subtitle={thread.subtitle}
      link={thread.link}
      initialMessages={thread.messages}
      initialAttachmentUrls={thread.attachmentUrls}
      initialReactions={thread.reactions}
      initialQuoted={thread.quoted}
      initialReadMarks={thread.marks}
      canSend={thread.canSend}
      closedReason={thread.closedReason}
      emptyText={thread.emptyText}
      compact
      controls={<WindowControls name={thread.title} href={`/tours/messages/${id}`} onMinimize={onMinimize} onClose={onClose} />}
    />
  );
}

function AiDockWindow({ onMinimize, onClose }: { onMinimize: () => void; onClose: () => void }) {
  return (
    <section aria-label={ASSISTANT_NAME} className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 bg-blue-600 px-2 py-1.5 text-white">
        <AiAvatar size="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold">{ASSISTANT_NAME}</h2>
          <p className="truncate text-sm text-white/90">Your local guide · always on</p>
        </div>
        <WindowControls name={ASSISTANT_NAME} href="/tours/messages/ai" onMinimize={onMinimize} onClose={onClose} />
      </header>
      <AssistantChat signedIn autoFocus />
    </section>
  );
}
