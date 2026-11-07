"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { markNotificationsRead } from "@/app/(subsystems)/tours/notifications/actions";
import { usePolling } from "@/components/live/use-polling";
import { LineIcon } from "@/components/ui/icons";
import { EMPTY_SUMMARY, mergeNotifications, newNotifications, planToast, type LiveSummary, type ToastPlan } from "@/lib/live/summary";
import { pollInterval } from "@/lib/live/schedule";
import { playAlertTone, unlockSoundOnFirstTap } from "@/lib/live/sound";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNotificationLink, type NotificationRow } from "@/lib/tours/notifications";

type LiveValue = {
  summary: LiveSummary;
  /** False until the first poll (or server data) has arrived. */
  ready: boolean;
  markRead: (ids?: string[]) => void;
  refresh: () => void;
};

const LiveContext = createContext<LiveValue | null>(null);
const SeedContext = createContext<((initial: LiveInitial) => void) | null>(null);

/** The shared live state. Outside a provider (tests, signed-out pages) it is empty and inert. */
export function useLive(): LiveValue | null {
  return useContext(LiveContext);
}

const TOAST_MS = 6000;

export type LiveInitial = { userId: string; items: NotificationRow[]; unread: number } | null;

/**
 * One poller for the whole signed-in page: the bell, the message badge, the
 * dashboards' counts, the tab title, the toast and the sound all read from it.
 * Realtime only makes the next poll happen sooner; polling is the safety net.
 */
export function LiveProvider({ initial: initialProp = null, children }: { initial?: LiveInitial; children: ReactNode }) {
  // A shared layout mounts the provider before it knows who is signed in (that
  // is read at request time, behind <Suspense>). <LiveSeed> hands the person's
  // notifications over once they arrive. Nothing polls before that, so a
  // signed-out visitor on a page inside the shared layout (the trip planner)
  // never hits the summary route.
  const [seed, setSeed] = useState<LiveInitial>(null);
  const initial = initialProp ?? seed;
  const [summary, setSummary] = useState<LiveSummary>(() => (initial ? { ...EMPTY_SUMMARY, notifications: { unread: initial.unread, items: initial.items } } : EMPTY_SUMMARY));
  const [ready, setReady] = useState(Boolean(initial));
  const [realtime, setRealtime] = useState(false);
  const [toast, setToast] = useState<ToastPlan>(null);
  const pathname = usePathname() ?? "";
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Ids already shown, and whether the first poll has set the baseline.
  const known = useRef<Set<string>>(new Set(initial?.items.map((row) => row.id) ?? []));
  const baseline = useRef(false);
  const lastStamp = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // A server refresh brings a newer list: take it.
  useEffect(() => {
    if (!initial) return;
    for (const row of initial.items) known.current.add(row.id);
    setSummary((current) => ({ ...current, notifications: { unread: initial.unread, items: mergeNotifications(current.notifications.items, initial.items) } }));
    setReady(true);
  }, [initial]);

  useEffect(() => unlockSoundOnFirstTap(), []);

  const announce = useCallback((plan: ToastPlan) => {
    if (!plan) return;
    setToast(plan);
    playAlertTone();
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const poll = useCallback(async () => {
    const visible = document.visibilityState === "visible" ? "1" : "0";
    const response = await fetch(`/api/live/summary?visible=${visible}`, { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) return; // signed out: nothing to show, nothing to retry
    if (!response.ok) throw new Error(`summary ${response.status}`);
    const next = (await response.json()) as LiveSummary;
    const fresh = newNotifications(known.current, next.notifications.items);
    for (const row of next.notifications.items) known.current.add(row.id);
    const chatGrew = Boolean(next.chatStamp && lastStamp.current && next.chatStamp > lastStamp.current);
    lastStamp.current = next.chatStamp ?? lastStamp.current;
    setSummary((current) => ({ ...next, notifications: { unread: next.notifications.unread, items: mergeNotifications(current.notifications.items, next.notifications.items) } }));
    setReady(true);
    // The first poll after load only sets the baseline: no toast for old items.
    if (baseline.current) announce(planToast(fresh, chatGrew && fresh.every((row) => row.type !== "message"), pathRef.current, safeNotificationLink));
    baseline.current = true;
  }, [announce]);

  const { trigger } = usePolling(poll, pollInterval(realtime), isSupabaseConfigured() && Boolean(initial));

  // Realtime: only an accelerator. Any new notification or message asks for a poll now.
  useEffect(() => {
    if (!isSupabaseConfigured() || !initial?.userId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`live:${initial.userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tours_notifications", filter: `profile_id=eq.${initial.userId}` }, () => trigger())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tours_messages" }, () => trigger())
      .subscribe((status) => setRealtime(status === "SUBSCRIBED"));
    const onRead = () => trigger();
    window.addEventListener("daet:chat-read", onRead);
    return () => {
      window.removeEventListener("daet:chat-read", onRead);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.userId]);

  const markRead = useCallback((ids?: string[]) => {
    const now = new Date().toISOString();
    setSummary((current) => {
      const items = current.notifications.items.map((item) => (!ids || ids.includes(item.id) ? { ...item, read_at: item.read_at ?? now } : item));
      const unread = ids ? Math.max(0, current.notifications.unread - ids.filter((id) => current.notifications.items.some((item) => item.id === id && !item.read_at)).length) : 0;
      return { ...current, notifications: { items, unread } };
    });
    void markNotificationsRead(ids);
  }, []);

  // The tab title carries the unread total, e.g. "(2) Daet Connect".
  const total = summary.notifications.unread + summary.chatUnread;
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\)\s/, "");
      const desired = total > 0 ? `(${total > 99 ? "99+" : total}) ${base}` : base;
      if (document.title !== desired) document.title = desired;
    };
    apply();
    const node = document.querySelector("title");
    if (!node) return;
    const observer = new MutationObserver(apply);
    observer.observe(node, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(/^\(\d+\+?\)\s/, "");
    };
  }, [total]);

  useEffect(() => () => void (toastTimer.current && window.clearTimeout(toastTimer.current)), []);

  const value = useMemo<LiveValue>(() => ({ summary, ready, markRead, refresh: trigger }), [summary, ready, markRead, trigger]);

  return (
    <SeedContext.Provider value={setSeed}>
    <LiveContext.Provider value={value}>
      {children}
      {/* The live region holds the link: a link given role="status" loses its name from its content. */}
      <div role="status" className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-[60] flex justify-center px-4">
        {toast ? (
          <Link
            href={toast.href}
            onClick={() => {
              if (toast.ids.length) markRead(toast.ids);
              setToast(null);
            }}
            className="motion-pop pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl card-edge bg-surface px-4 py-3 text-left text-daet-ink shadow-[var(--shadow-float)]"
          >
            <LineIcon name="bell" className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-300" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{toast.text}</span>
          </Link>
        ) : null}
      </div>
    </LiveContext.Provider>
    </SeedContext.Provider>
  );
}

/** Renders nothing: gives the nearest <LiveProvider> the server-loaded notifications. */
export function LiveSeed({ initial }: { initial: LiveInitial }) {
  const setSeed = useContext(SeedContext);
  useEffect(() => {
    setSeed?.(initial);
  }, [initial, setSeed]);
  return null;
}
