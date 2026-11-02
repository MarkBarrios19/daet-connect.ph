"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadOlderMessages, markConversationRead, reactToMessage, sendMessage, signAttachments } from "@/app/(subsystems)/tours/messages/actions";
import { ReactionBar, ReactionPills } from "@/components/chat/reactions";
import { TypingDots } from "@/components/assistant/assistant-chat";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MESSAGE_MAX_LENGTH, MESSAGE_PAGE_SIZE, mergeMessages, messageTime, senderLabel, type ChatMembers, type ChatMessage } from "@/lib/tours/messaging";
import {
  applyReaction,
  bubbleCorners,
  isReactionKey,
  quotePreview,
  seenMessageId,
  threadItems,
  toggledReaction,
  TYPING_THROTTLE_MS,
  TYPING_TTL_MS,
  whoIsTyping,
  type Reaction,
  type ReactionKey,
  type ReadMark,
  type ThreadMessage,
} from "@/lib/tours/messenger";

const time = (iso: string) => new Date(messageTime(iso)).toLocaleTimeString("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });
const LONG_PRESS_MS = 450;

export type ChatWindowProps = {
  conversationId: string;
  viewerId: string;
  members: ChatMembers;
  title: string;
  subtitle?: string | null;
  link?: { href: string; label: string } | null;
  initialMessages: ChatMessage[];
  initialAttachmentUrls: Record<string, string>;
  initialReactions: Reaction[];
  initialQuoted: ChatMessage[];
  initialReadMarks: ReadMark[];
  canSend: boolean;
  closedReason: string | null;
  emptyText?: string;
  /** Back link on phones; the dock passes its own window controls instead. */
  backHref?: string;
  controls?: ReactNode;
  compact?: boolean;
  /** h1 on the chat page, h2 inside the dock. */
  headingLevel?: 1 | 2;
};

/**
 * A Messenger-style chat: grouped bubbles, Seen, typing dots, the online dot,
 * reactions and replies, optimistic sending with retry, and earlier messages
 * on demand. Messages and reactions arrive through Realtime (row-level
 * security decides who receives them); typing, presence and "seen" pings use
 * a private channel only the chat's members can join.
 */
export function ChatWindow(props: ChatWindowProps) {
  const { conversationId, viewerId, members, canSend, compact = false } = props;
  const [messages, setMessages] = useState<ThreadMessage[]>(() => mergeMessages([], props.initialMessages));
  const [quoted, setQuoted] = useState<Record<string, ChatMessage>>(() => Object.fromEntries(props.initialQuoted.map((m) => [m.id, m])));
  const [urls, setUrls] = useState(props.initialAttachmentUrls);
  const [reactions, setReactions] = useState<Reaction[]>(props.initialReactions);
  const [marks, setMarks] = useState<ReadMark[]>(props.initialReadMarks);
  const [hasMore, setHasMore] = useState(props.initialMessages.length >= MESSAGE_PAGE_SIZE);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [online, setOnline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const liveChannel = useRef<ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null>(null);
  const lastTypingSent = useRef(0);
  const localSeq = useRef(0);
  const stickToBottom = useRef(true);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const items = useMemo(() => threadItems(messages, viewerId), [messages, viewerId]);
  const seenId = useMemo(() => seenMessageId(messages, viewerId, marks), [messages, viewerId, marks]);
  const typingNow = whoIsTyping(typing, now, viewerId);

  const announceRead = useCallback(() => {
    void markConversationRead(conversationId).then(() => {
      window.dispatchEvent(new Event("daet:chat-read"));
      void liveChannel.current?.send({ type: "broadcast", event: "read", payload: { who: viewerId, at: new Date().toISOString() } });
    });
  }, [conversationId, viewerId]);

  // Messages and reactions: table changes, filtered by row-level security.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`chat-db:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tours_messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const message = payload.new as ChatMessage;
        setMessages((current) => mergeMessages(current, [message]) as ThreadMessage[]);
        setTyping((t) => ({ ...t, [message.sender_id]: 0 }));
        if (message.attachment_url) void signAttachments([message.attachment_url]).then((signed) => setUrls((current) => ({ ...current, ...signed })));
        if (message.sender_id !== viewerId && document.visibilityState === "visible") announceRead();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tours_message_reactions", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<Reaction>;
          if (old.message_id && old.profile_id) setReactions((r) => applyReaction(r, { message_id: old.message_id!, profile_id: old.profile_id!, reaction: null }));
          return;
        }
        const row = payload.new as Reaction;
        if (isReactionKey(row.reaction)) setReactions((r) => applyReaction(r, row));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, viewerId, announceRead]);

  // Typing dots, the online dot and "seen" pings: a private channel for members only.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`conversation:${conversationId}`, { config: { private: true, presence: { key: viewerId } } });
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = typeof payload?.who === "string" ? payload.who : null;
        if (who && who !== viewerId) setTyping((t) => ({ ...t, [who]: Date.now() + TYPING_TTL_MS }));
      })
      .on("broadcast", { event: "read" }, ({ payload }) => {
        const who = typeof payload?.who === "string" ? payload.who : null;
        const at = typeof payload?.at === "string" ? payload.at : null;
        if (who && at && who !== viewerId) setMarks((m) => [...m.filter((x) => x.profile_id !== who), { profile_id: who, last_read_at: at }]);
      })
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(channel.presenceState()).some((key) => key !== viewerId));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: new Date().toISOString() });
      });
    liveChannel.current = channel;
    return () => {
      liveChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, viewerId]);

  // Typing dots fade without a new ping.
  useEffect(() => {
    if (!Object.values(typing).some((until) => until > Date.now())) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [typing]);

  // Stay at the bottom for new messages unless the reader scrolled up.
  useEffect(() => {
    const log = logRef.current;
    if (log && stickToBottom.current) log.scrollTop = log.scrollHeight;
  }, [messages.length, typingNow.length]);

  useEffect(() => {
    if (!menuFor) return;
    const close = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && (event.target as HTMLElement).closest("[data-message-menu]")) return;
      setMenuFor(null);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("mousedown", close);
    };
  }, [menuFor]);

  function pingTyping() {
    const t = Date.now();
    if (t - lastTypingSent.current < TYPING_THROTTLE_MS) return;
    lastTypingSent.current = t;
    void liveChannel.current?.send({ type: "broadcast", event: "typing", payload: { who: viewerId } });
  }

  async function deliver(localId: string, draft: NonNullable<ThreadMessage["draft"]>) {
    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("text", draft.text);
    if (draft.file) formData.set("attachment", draft.file);
    if (draft.replyToId) formData.set("replyToId", draft.replyToId);
    const result = await sendMessage(formData).catch(() => ({ error: "You seem to be offline." }) as Awaited<ReturnType<typeof sendMessage>>);
    if (!result.message) {
      setMessages((current) => current.map((m) => (m.id === localId ? { ...m, status: "failed" } : m)));
      setError(result.error ?? "The message could not be sent.");
      return;
    }
    const sent = result.message;
    setMessages((current) => mergeMessages(current.filter((m) => m.id !== localId), [sent]) as ThreadMessage[]);
    if (sent.attachment_url && result.attachmentUrl) setUrls((current) => ({ ...current, [sent.attachment_url!]: result.attachmentUrl! }));
  }

  function submit() {
    const body = text.trim();
    if (!body && !file) return;
    const draft = { text: body, file, replyToId: replyTo?.id ?? null };
    localSeq.current += 1;
    const localId = `local-${localSeq.current}`;
    const preview = file ? URL.createObjectURL(file) : null;
    setMessages((current) => [
      ...current,
      { id: localId, sender_id: viewerId, message_text: body || null, attachment_url: preview ? localId : null, created_at: new Date().toISOString(), reply_to_id: draft.replyToId, status: "sending", draft },
    ]);
    if (preview) setUrls((current) => ({ ...current, [localId]: preview }));
    setError(null);
    setText("");
    setFile(null);
    setReplyTo(null);
    if (fileRef.current) fileRef.current.value = "";
    stickToBottom.current = true;
    void deliver(localId, draft);
    inputRef.current?.focus();
  }

  function retry(message: ThreadMessage) {
    if (!message.draft) return;
    setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, status: "sending" } : m)));
    void deliver(message.id, message.draft);
  }

  async function react(message: ThreadMessage, key: ReactionKey) {
    setMenuFor(null);
    const next = toggledReaction(reactions, message.id, viewerId, key);
    const before = reactions;
    setReactions((r) => applyReaction(r, { message_id: message.id, profile_id: viewerId, reaction: next }));
    const result = await reactToMessage(message.id, next);
    if (!result.ok) {
      setReactions(before);
      setError(result.error ?? "The reaction could not be saved.");
    }
  }

  async function loadOlder() {
    const oldest = messages.find((m) => !m.status);
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    stickToBottom.current = false;
    const log = logRef.current;
    const fromBottom = log ? log.scrollHeight - log.scrollTop : 0;
    const page = await loadOlderMessages(conversationId, oldest.created_at);
    setMessages((current) => mergeMessages(current, page.messages) as ThreadMessage[]);
    setReactions((r) => [...r, ...page.reactions.filter((x) => !r.some((y) => y.message_id === x.message_id && y.profile_id === x.profile_id))]);
    setQuoted((q) => ({ ...q, ...Object.fromEntries(page.quoted.map((m) => [m.id, m])) }));
    setUrls((u) => ({ ...u, ...page.attachmentUrls }));
    setHasMore(page.hasMore);
    setLoadingOlder(false);
    requestAnimationFrame(() => {
      if (log) log.scrollTop = log.scrollHeight - fromBottom;
    });
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${conversationId}-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-blue-600");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-blue-600"), 1500);
  }

  // Long-press on phones opens the message menu, like Messenger.
  const pressTimer = useRef<number | null>(null);
  const pressHandlers = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      pressTimer.current = window.setTimeout(() => setMenuFor(id), LONG_PRESS_MS);
    },
    onPointerUp: () => pressTimer.current && window.clearTimeout(pressTimer.current),
    onPointerLeave: () => pressTimer.current && window.clearTimeout(pressTimer.current),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuFor(id);
    },
  });

  const headingId = `chat-title-${conversationId}`;
  const Heading = props.headingLevel === 1 ? "h1" : "h2";

  return (
    <section aria-labelledby={headingId} className="flex h-full min-h-0 flex-col bg-surface">
      <header className={`flex items-center gap-2 ${compact ? "bg-blue-600 px-2 py-1.5 text-white" : "px-2 py-2 sm:px-3"}`}>
        {props.backHref ? (
          <Link href={props.backHref} aria-label="All messages" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 lg:hidden">
            <LineIcon name="arrowRight" className="h-5 w-5 rotate-180" />
          </Link>
        ) : null}
        <span className="relative shrink-0" aria-hidden="true">
          <span className={`grid ${compact ? "h-8 w-8 bg-white/20" : "h-10 w-10 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300"} place-items-center rounded-full font-bold`}>{props.title.slice(0, 1).toUpperCase()}</span>
          {online ? <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <Heading id={headingId} className={`truncate font-bold ${compact ? "text-base" : "text-lg text-daet-ink"}`}>
            {props.title}
          </Heading>
          <p className={`truncate text-sm ${compact ? "text-white/90" : "text-slate-600 dark:text-slate-400"}`} aria-live="polite">
            {typingNow.length ? "typing…" : online ? "Active now" : live === "offline" ? "Offline: refresh to see new messages" : props.subtitle}
          </p>
        </div>
        {props.link && !compact ? (
          <Link href={props.link.href} className="hidden min-h-11 shrink-0 items-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-4 text-sm font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 sm:inline-flex">
            {props.link.label}
          </Link>
        ) : null}
        {props.controls}
      </header>

      <div
        ref={logRef}
        role="log"
        aria-label="Messages"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-surface px-3 py-3"
      >
        {hasMore ? (
          <div className="mb-3 flex justify-center">
            <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="min-h-11 rounded-full bg-muted px-4 text-sm font-bold text-daet-ink hover:bg-muted-strong disabled:opacity-60">
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        ) : null}
        {messages.length === 0 ? <p className="py-10 text-center text-slate-600 dark:text-slate-400">{props.emptyText ?? "No messages yet. Say hello."}</p> : null}
        <ul className="space-y-0.5">
          {items.map((item) => {
            if (item.type === "day") {
              return (
                <li key={item.key} className="py-3 text-center text-sm font-semibold text-slate-600 dark:text-slate-400">
                  {item.label}
                </li>
              );
            }
            const { message, mine, position, showSender, showTime } = item;
            const url = message.attachment_url ? urls[message.attachment_url] : null;
            const reply = message.reply_to_id ? (byId.get(message.reply_to_id) ?? quoted[message.reply_to_id]) : undefined;
            const pills = <ReactionPills reactions={reactions} messageId={message.id} viewerId={viewerId} onToggle={(key) => void react(message, key)} mine={mine} />;
            const gapTop = position === "first" || position === "single" ? "pt-2" : "";
            return (
              <li key={item.key} className={`${gapTop} flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {showSender ? <p className="mb-0.5 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400">{senderLabel(message.sender_id, viewerId, members)}</p> : null}
                <div className={`group relative flex max-w-[85%] items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                  <div
                    id={`msg-${conversationId}-${message.id}`}
                    {...pressHandlers(message.id)}
                    className={`min-w-0 select-text px-3 py-2 transition ${bubbleCorners(position, mine)} ${mine ? "bg-blue-600 text-white" : "bg-muted text-daet-ink"} ${message.status === "failed" ? "opacity-70" : ""}`}
                  >
                    {reply !== undefined || message.reply_to_id ? (
                      <button
                        type="button"
                        onClick={() => message.reply_to_id && jumpTo(message.reply_to_id)}
                        className={`mb-1 block w-full rounded-xl px-2 py-1 text-left text-sm ${mine ? "bg-blue-800 text-white" : "bg-surface text-slate-700 dark:text-slate-300"}`}
                      >
                        <span className="block text-xs font-bold">{reply ? `Replying to ${senderLabel(reply.sender_id, viewerId, members)}` : "Reply"}</span>
                        <span className="line-clamp-2">{quotePreview(reply)}</span>
                      </button>
                    ) : null}
                    {message.attachment_url ? (
                      url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={url} alt="Photo attachment" className="max-h-64 rounded-xl object-cover" />
                        </a>
                      ) : (
                        <p className="text-sm opacity-80">
                          <LineIcon name="camera" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Photo
                        </p>
                      )
                    ) : null}
                    {message.message_text ? <p className="whitespace-pre-wrap break-words">{message.message_text}</p> : null}
                  </div>
                  {message.status ? null : (
                    <button
                      type="button"
                      aria-label="React or reply"
                      aria-expanded={menuFor === message.id}
                      onClick={() => setMenuFor(menuFor === message.id ? null : message.id)}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 dark:text-slate-400 opacity-0 transition hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
                    >
                      <LineIcon name="menu" className="h-5 w-5" />
                    </button>
                  )}
                  {menuFor === message.id ? (
                    <div data-message-menu className={`absolute bottom-full z-20 mb-1 ${mine ? "right-0" : "left-0"}`}>
                      <ReactionBar
                        current={reactions.find((r) => r.message_id === message.id && r.profile_id === viewerId)?.reaction ?? null}
                        onPick={(key) => void react(message, key)}
                        onReply={() => {
                          setReplyTo(message);
                          setMenuFor(null);
                          inputRef.current?.focus();
                        }}
                        onCopy={
                          message.message_text
                            ? () => {
                                void navigator.clipboard?.writeText(message.message_text ?? "");
                                setMenuFor(null);
                              }
                            : undefined
                        }
                      />
                    </div>
                  ) : null}
                </div>
                {pills}
                {message.status === "sending" ? <p className="px-3 text-xs text-slate-500 dark:text-slate-400">Sending…</p> : null}
                {message.status === "failed" ? (
                  <button type="button" onClick={() => retry(message)} className="min-h-11 px-3 text-sm font-bold text-red-600 dark:text-red-300 underline">
                    Not sent. Tap to retry
                  </button>
                ) : null}
                {!message.status && showTime ? <p className="px-3 pt-0.5 text-xs text-slate-500 dark:text-slate-400">{time(message.created_at)}</p> : null}
                {seenId === message.id ? <p className="px-3 text-xs font-semibold text-slate-600 dark:text-slate-400">Seen</p> : null}
              </li>
            );
          })}
          {typingNow.length ? (
            <li className="flex pt-2">
              <span className="rounded-2xl bg-muted px-3 py-1">
                <TypingDots />
              </span>
            </li>
          ) : null}
        </ul>
      </div>

      {canSend ? (
        <form
          className="bg-surface px-2 pb-2 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error ? (
            <Notice variant="error" className="mb-2">
              {error}
            </Notice>
          ) : null}
          {replyTo ? (
            <div className="mb-1 flex items-center gap-2 rounded-2xl bg-canvas px-3 py-1">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold text-daet-ink">Replying to {senderLabel(replyTo.sender_id, viewerId, members)}</p>
                <p className="truncate text-slate-600 dark:text-slate-400">{quotePreview(replyTo)}</p>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted">
                <LineIcon name="close" className="h-5 w-5" />
              </button>
            </div>
          ) : null}
          {file ? (
            <p className="mb-1 flex items-center gap-2 px-2 text-sm text-slate-600 dark:text-slate-400">
              <LineIcon name="image" className="h-4 w-4" /> <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="min-h-11 font-bold text-blue-700 dark:text-blue-300 underline"
              >
                Remove
              </button>
            </p>
          ) : null}
          <div className="flex items-end gap-1">
            <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40" title="Add a photo">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <LineIcon name="camera" className="h-6 w-6" />
              <span className="sr-only">Add a photo</span>
            </label>
            <label htmlFor={`message-text-${conversationId}`} className="sr-only">
              Message
            </label>
            <textarea
              id={`message-text-${conversationId}`}
              ref={inputRef}
              rows={1}
              maxLength={MESSAGE_MAX_LENGTH}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                pingTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Aa"
              className="block max-h-32 min-h-11 w-full resize-none rounded-2xl bg-muted px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600/40"
            />
            <button
              type="submit"
              disabled={!text.trim() && !file}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-blue-600 dark:text-blue-300 transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-95 disabled:text-slate-400"
            >
              <LineIcon name="arrowRight" className="h-6 w-6" />
              <span className="sr-only">Send</span>
            </button>
          </div>
        </form>
      ) : props.closedReason ? (
        <Notice variant="info" className="m-3">
          {props.closedReason}
        </Notice>
      ) : null}
    </section>
  );
}
