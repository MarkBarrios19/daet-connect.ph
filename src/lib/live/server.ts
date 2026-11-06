import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveCounts, LiveSummary } from "@/lib/live/summary";
import type { NotificationRow } from "@/lib/tours/notifications";
import { toManilaDateKey } from "@/lib/tours/events-calendar";

const SELECT = "id, type, title, body, link, read_at, created_at";
const head = (supabase: SupabaseClient, table: string) => supabase.from(table).select("id", { count: "exact", head: true });

async function roleCounts(supabase: SupabaseClient, userId: string, role: string | null): Promise<LiveCounts> {
  if (role === "admin") {
    const [operators, guides, packages] = await Promise.all([
      head(supabase, "tours_operators").eq("accreditation_status", "pending"),
      head(supabase, "tours_guides").eq("accreditation_status", "pending"),
      head(supabase, "tours_packages").eq("status", "pending_review"),
    ]);
    return { adminOperators: operators.count ?? 0, adminGuides: guides.count ?? 0, adminPackages: packages.count ?? 0 };
  }
  if (role === "operator") {
    const { data: operator } = await supabase.from("tours_operators").select("id").eq("profile_id", userId).maybeSingle();
    if (!operator) return {};
    const pending = await head(supabase, "tours_bookings").eq("status", "pending");
    return { operatorPending: pending.count ?? 0 };
  }
  if (role === "guide") {
    const { data: guide } = await supabase.from("tours_guides").select("id").eq("profile_id", userId).maybeSingle();
    if (!guide) return {};
    const today = toManilaDateKey(new Date());
    const [upcoming, todays] = await Promise.all([
      head(supabase, "tours_bookings").eq("assigned_guide_id", guide.id).gte("tour_date", today).in("status", ["pending", "confirmed"]),
      head(supabase, "tours_bookings").eq("assigned_guide_id", guide.id).eq("tour_date", today).in("status", ["pending", "confirmed"]),
    ]);
    return { guideUpcoming: upcoming.count ?? 0, guideToday: todays.count ?? 0 };
  }
  return {};
}

/** Everything the header, the message badge and the dashboards need in one round trip. */
export async function loadLiveSummary(supabase: SupabaseClient, userId: string, role: string | null): Promise<LiveSummary> {
  const [list, unread, inbox, counts] = await Promise.all([
    supabase.from("tours_notifications").select(SELECT).order("created_at", { ascending: false }).limit(15),
    head(supabase, "tours_notifications").is("read_at", null),
    supabase.rpc("tours_chat_inbox"),
    roleCounts(supabase, userId, role).catch(() => ({}) as LiveCounts),
  ]);
  const rows = Array.isArray(inbox.data) ? (inbox.data as Array<{ unread: number | null; last_message_at: string | null }>) : [];
  return {
    notifications: { unread: unread.count ?? 0, items: (list.data ?? []) as NotificationRow[] },
    chatUnread: rows.reduce((sum, row) => sum + (Number(row.unread) > 0 ? 1 : 0), 0),
    chatStamp: rows.reduce<string | null>((latest, row) => (row.last_message_at && (!latest || row.last_message_at > latest) ? row.last_message_at : latest), null),
    counts,
  };
}
