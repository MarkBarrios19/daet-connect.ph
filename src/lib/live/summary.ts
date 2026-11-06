/** Shapes shared by the live summary endpoint and the browser. No server imports: safe on both sides. */
import type { NotificationRow } from "@/lib/tours/notifications";

/** Numbers shown on dashboards that follow the poll. Keys missing for roles that do not use them. */
export type LiveCounts = Partial<{
  adminOperators: number;
  adminGuides: number;
  adminPackages: number;
  operatorPending: number;
  guideUpcoming: number;
  guideToday: number;
}>;

export type LiveSummary = {
  notifications: { unread: number; items: NotificationRow[] };
  chatUnread: number;
  /** Changes whenever any of the viewer's chats gets a new message. */
  chatStamp: string | null;
  counts: LiveCounts;
};

export const EMPTY_SUMMARY: LiveSummary = { notifications: { unread: 0, items: [] }, chatUnread: 0, chatStamp: null, counts: {} };

/** Notifications in `next` that were not in `known`, newest first. */
export function newNotifications(known: ReadonlySet<string>, next: NotificationRow[]): NotificationRow[] {
  return next.filter((row) => !known.has(row.id) && !row.read_at);
}

/** Merges a notification into a list by id (newest first, capped), so Realtime and polling never double up. */
export function mergeNotifications(current: NotificationRow[], incoming: NotificationRow[], limit = 15): NotificationRow[] {
  const byId = new Map<string, NotificationRow>();
  for (const row of [...incoming, ...current]) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

export type ToastPlan = { text: string; href: string; ids: string[] } | null;

/**
 * What one poll's new arrivals say, as a single grouped toast. `activePath` is
 * the page the viewer is on: items that point at it are skipped (an open chat).
 */
export function planToast(fresh: NotificationRow[], chatGrew: boolean, activePath: string, safeLink: (link: string | null) => string): ToastPlan {
  const visible = fresh.filter((row) => safeLink(row.link) !== activePath);
  if (visible.length === 1) return { text: visible[0].title, href: safeLink(visible[0].link), ids: [visible[0].id] };
  if (visible.length > 1) return { text: `${visible.length} new notifications`, href: "/tours/notifications", ids: visible.map((row) => row.id) };
  if (chatGrew && !activePath.startsWith("/tours/messages")) return { text: "New message", href: "/tours/messages", ids: [] };
  return null;
}
