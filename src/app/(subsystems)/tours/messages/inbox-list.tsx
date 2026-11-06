import Link from "next/link";
import { AiAvatar } from "@/components/chat/ai-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { ASSISTANT_NAME } from "@/lib/tours/assistant/name";
import { PresenceBadge } from "@/components/chat/presence-badge";
import { dayLabel, isConversationKind, KIND_LABELS, presenceOf, type InboxRow } from "@/lib/tours/messaging";

/**
 * The chat list, Messenger-style: the Daet AI assistant pinned on top, then
 * chats newest first, unread ones in bold with a blue dot. Shared by the
 * inbox page and the left pane next to an open chat on wide screens.
 */
export function InboxList({ rows, viewerId, activeId = null }: { rows: InboxRow[]; viewerId: string; activeId?: string | null }) {
  const row = (active: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-2xl p-3 transition active:scale-[0.99] ${active ? "bg-blue-50 dark:bg-blue-950/40" : "card-edge bg-surface hover:bg-canvas"}`;
  return (
    <ul className="space-y-1" aria-label="Chats">
      <li>
        <Link href="/tours/messages/ai" aria-current={activeId === "ai" ? "page" : undefined} className={row(activeId === "ai")}>
          <AiAvatar />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-bold text-daet-ink">{ASSISTANT_NAME}</span>
              <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 text-xs font-bold text-blue-900 dark:text-blue-300">Pinned</span>
            </span>
            <span className="block truncate text-sm text-slate-600 dark:text-slate-400">Food, stays, directions and trip costs in Daet. Ask anything.</span>
          </span>
        </Link>
      </li>
      {rows.length === 0 ? (
        <li>
          <EmptyState className="mt-2" icon={<LineIcon name="chat" />} title="No conversations yet" description="Open a booking, a guide or the Tourism Office and tap Message to start a chat." />
        </li>
      ) : null}
      {rows.map((r) => {
        const title = r.title ?? "Conversation";
        const unread = r.unread > 0;
        const presence = presenceOf(r.other_last_seen);
        const preview = r.last_message ?? (r.last_sender_id ? "Photo" : "No messages yet");
        return (
          <li key={r.conversation_id}>
            <Link href={`/tours/messages/${r.conversation_id}`} aria-current={activeId === r.conversation_id ? "page" : undefined} className={row(activeId === r.conversation_id)}>
              <span aria-hidden="true" className="relative shrink-0">
                <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40 text-lg font-bold text-blue-800 dark:text-blue-300">
                  {r.other_avatar_url ? <img src={r.other_avatar_url} alt="" width={48} height={48} className="h-full w-full object-cover" /> : title.slice(0, 1).toUpperCase()}
                </span>
                <PresenceBadge presence={presence} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-daet-ink ${unread ? "font-bold" : "font-semibold"}`}>{title}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    {presence.state === "online" ? <span className="h-2.5 w-2.5 rounded-full bg-green-500" role="img" aria-label="Online now" /> : null}
                    {dayLabel(r.last_message_at)}
                  </span>
                </span>
                <span className="block truncate text-sm text-slate-600 dark:text-slate-400">
                  {isConversationKind(r.kind) ? KIND_LABELS[r.kind] : "Chat"}
                  {r.subtitle ? ` · ${r.subtitle}` : ""}
                </span>
                <span className={`block truncate text-sm ${unread ? "font-bold text-daet-ink" : "text-slate-600 dark:text-slate-400"}`}>
                  {r.last_sender_id === viewerId ? "You: " : ""}
                  {preview}
                </span>
              </span>
              {unread ? (
                <span className="flex shrink-0 items-center gap-1">
                  <span className="sr-only">{r.unread} unread</span>
                  <span aria-hidden="true" className="h-3 w-3 rounded-full bg-blue-600" />
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
