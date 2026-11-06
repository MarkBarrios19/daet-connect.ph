/**
 * In-app notifications (rows written by database triggers, see the F5
 * migration) and the Web Push payload built from them.
 */

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** The kind of line icon each notification type shows (NotificationIcon in components/ui/icons.tsx). */
export type NotificationKind = "inbox" | "check" | "cancel" | "star" | "return" | "guide" | "money" | "receipt" | "ticket" | "message" | "award" | "note" | "gift" | "bag" | "swap" | "warning" | "bell";

const KINDS: Record<string, NotificationKind> = {
  booking_created: "inbox",
  booking_confirmed: "check",
  booking_declined: "cancel",
  booking_cancelled: "cancel",
  booking_completed: "star",
  cancellation_requested: "return",
  cancellation_approved: "return",
  cancellation_declined: "return",
  guide_assigned: "guide",
  payment_received: "money",
  refund_recorded: "money",
  proof_submitted: "receipt",
  proof_rejected: "receipt",
  checked_in: "ticket",
  message: "message",
  accreditation_approved: "award",
  accreditation_rejected: "note",
  package_approved: "check",
  package_rejected: "note",
  package_submitted: "note",
  review_received: "star",
  review_reply: "message",
  points_earned: "gift",
  merch_submitted: "bag",
  merch_approved: "bag",
  merch_rejected: "note",
  guide_swap_requested: "swap",
  guide_swap_approved: "check",
  guide_swap_rejected: "return",
  live_started: "guide",
  live_separated: "warning",
};

export function notificationIcon(type: string): NotificationKind {
  return KINDS[type] ?? "bell";
}

/** Links come from our triggers; anything else falls back to the notifications page. */
export function safeNotificationLink(link: string | null | undefined): string {
  return typeof link === "string" && /^\/tours\/[A-Za-z0-9/_?=&.-]*$/.test(link) && !link.includes("//") ? link : "/tours/notifications";
}

export type PushPayload = { title: string; body: string; url: string; tag: string };

export function buildPushPayload(notification: Pick<NotificationRow, "id" | "type" | "title" | "body" | "link">): PushPayload {
  const url = safeNotificationLink(notification.link);
  return {
    title: notification.title.slice(0, 120),
    body: (notification.body ?? "").slice(0, 300),
    url,
    // Messages from one thread replace each other on the lock screen.
    tag: notification.type === "message" ? `message:${url}` : `notification:${notification.id}`,
  };
}

export function unreadCount(rows: Pick<NotificationRow, "read_at">[]): number {
  return rows.filter((row) => !row.read_at).length;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

/** Validates what the browser's PushSubscription.toJSON() sent. */
export function parsePushSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  const b64 = /^[A-Za-z0-9_-]+={0,2}$/;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !b64.test(p256dh) || !b64.test(auth) || p256dh.length > 200 || auth.length > 100) {
    return null;
  }
  return { endpoint, p256dh, auth };
}
