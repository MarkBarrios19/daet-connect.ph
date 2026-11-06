"use client";

import { useLive } from "@/components/live/live-provider";

/** Unread chats for the signed-in viewer, from the shared live poll (Realtime only makes it sooner). */
export function useUnreadChats(): number {
  return useLive()?.summary.chatUnread ?? 0;
}

/** Unread chat count for the Messages tab and the account menu. */
export function UnreadMessagesBadge({ className = "" }: { className?: string }) {
  const count = useUnreadChats();
  if (count === 0) return null;
  return (
    // Re-keyed so a new count pops in.
    <span key={count} className={`motion-pop-in inline-grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-5 text-white ${className}`}>
      {count > 9 ? "9+" : count}
      <span className="sr-only"> unread {count === 1 ? "chat" : "chats"}</span>
    </span>
  );
}
