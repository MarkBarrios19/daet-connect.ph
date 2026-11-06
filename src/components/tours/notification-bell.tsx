"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLive } from "@/components/live/live-provider";
import { LineIcon } from "@/components/ui/icons";
import { notificationIcon, safeNotificationLink, timeAgo, type NotificationRow } from "@/lib/tours/notifications";
import { announceOverlay } from "@/lib/ui-overlay";
import { markNotificationsRead } from "@/app/(subsystems)/tours/notifications/actions";

/** Header bell: unread count, latest notifications, live updates. Hidden when signed out. */
export function NotificationBell({ initial = null }: { initial?: { userId: string; items: NotificationRow[]; unread: number } | null }) {
  // The shared live poll (Realtime makes it sooner) feeds the bell; the
  // server-loaded list is the first paint and the fallback outside a provider.
  const live = useLive();
  const items = live?.ready ? live.summary.notifications.items : (initial?.items ?? []);
  const unread = live?.ready ? live.summary.notifications.unread : (initial?.unread ?? 0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    announceOverlay("notifications", open);
    // Leaving the page with the panel open must not keep the chat button hidden.
    return () => {
      if (open) announceOverlay("notifications", false);
    };
  }, [open]);

  function markRead(ids?: string[]) {
    if (live) live.markRead(ids);
    else void markNotificationsRead(ids);
  }

  return (
    <div ref={rootRef} className="sm:relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid h-11 w-11 place-items-center rounded-full text-daet-ink transition-[background-color,scale] duration-150 ease-out hover:bg-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-daet-forest/40 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-white/60"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span key={unread} className="motion-pop-in absolute right-1 top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-daet-coral px-1 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="motion-pop absolute inset-x-4 top-full z-50 mt-1 overflow-hidden rounded-2xl [--pop-origin:top_center] sm:[--pop-origin:calc(100%-1.25rem)_0] card-edge bg-surface text-left shadow-[var(--shadow-float)] sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-daet-ink/10 px-4 py-3">
            <p className="font-bold text-daet-ink">Notifications</p>
            {unread > 0 ? (
              <button type="button" onClick={() => markRead()} className="min-h-11 rounded-full px-2 text-sm font-bold text-daet-forest dark:text-blue-300 hover:bg-daet-sand">
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-daet-ink/70">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-daet-ink/10 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={safeNotificationLink(item.link)}
                    onClick={() => {
                      if (!item.read_at) markRead([item.id]);
                      setOpen(false);
                    }}
                    className={`flex gap-3 px-4 py-3 transition hover:bg-daet-sand/40 ${item.read_at ? "" : "bg-daet-forest/5"}`}
                  >
                    <LineIcon name={notificationIcon(item.type)} className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm text-daet-ink ${item.read_at ? "font-semibold" : "font-bold"}`}>{item.title}</span>
                      {item.body ? <span className="block line-clamp-2 text-xs text-daet-ink/65">{item.body}</span> : null}
                      <span className="mt-0.5 block text-[11px] text-daet-ink/70">{timeAgo(item.created_at)}</span>
                    </span>
                    {!item.read_at ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-daet-coral" aria-label="Unread" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/tours/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-daet-ink/10 px-4 py-3 text-center text-sm font-bold text-daet-forest dark:text-blue-300 hover:bg-daet-sand/40"
          >
            See all and notification settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
