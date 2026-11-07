import "server-only";
import { timed } from "@/lib/server-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/tours/server-auth";
import type { NotificationRow } from "@/lib/tours/notifications";

export type LoadedNotifications = { userId: string; items: NotificationRow[]; unread: number };

const SELECT = "id, type, title, body, link, read_at, created_at";

/**
 * The signed-in user's latest notifications and unread count, read on the
 * server so the header bell never depends on the browser holding a session.
 * Returns null when nobody is signed in or the lookup fails.
 */
export function loadNotifications(): Promise<LoadedNotifications | null> {
  return timed("notifications", readNotifications);
}

async function readNotifications(): Promise<LoadedNotifications | null> {
  try {
    const user = await getAuthUser();
    if (!user) return null;
    const supabase = await createSupabaseServerClient();
    const [list, count] = await Promise.all([
      supabase.from("tours_notifications").select(SELECT).order("created_at", { ascending: false }).limit(15),
      supabase.from("tours_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    if (list.error || count.error) return null;
    return { userId: user.id, items: (list.data ?? []) as NotificationRow[], unread: count.count ?? 0 };
  } catch {
    return null;
  }
}
