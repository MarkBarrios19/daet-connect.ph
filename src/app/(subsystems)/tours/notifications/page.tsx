import { EmptyState } from "@/components/ui/empty-state";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { SoundToggle } from "@/components/tours/sound-toggle";
import { PushOptIn } from "@/components/tours/push-opt-in";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LineIcon } from "@/components/ui/icons";
import { notificationIcon, safeNotificationLink, timeAgo, type NotificationRow } from "@/lib/tours/notifications";
import { MarkAllReadButton } from "./mark-all-read-button";
import { getAuthUser } from "@/lib/tours/server-auth";


export default async function NotificationsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to see notifications.</Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/notifications")}`);

  const { data, error } = await supabase
    .from("tours_notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as NotificationRow[];
  const hasUnread = rows.some((row) => !row.read_at);

  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="display-2 text-daet-ink">Notifications</h1>
          {hasUnread ? <MarkAllReadButton /> : null}
        </div>

        <Card className="mt-6">
          <PushOptIn variant="settings" />
          <div className="mt-4 border-t border-daet-ink/10 pt-4">
            <SoundToggle />
          </div>
        </Card>

        {error ? (
          <Notice variant="error" className="mt-6">Notifications could not be loaded. Refresh to try again.</Notice>
        ) : rows.length === 0 ? (
          <EmptyState className="mt-6" icon={<LineIcon name="bell" />} title="Nothing yet" description="Updates about bookings, payments and messages appear here." />
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={safeNotificationLink(row.link)}
                  className={`flex gap-3 rounded-2xl p-4 transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-[0.99] ${row.read_at ? "card-edge bg-surface" : "bg-blue-50 dark:bg-blue-950/40"}`}
                >
                  <LineIcon name={notificationIcon(row.type)} className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-daet-ink ${row.read_at ? "font-semibold" : "font-bold"}`}>{row.title}</span>
                    {row.body ? <span className="block text-sm text-daet-ink/70">{row.body}</span> : null}
                    <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{timeAgo(row.created_at)}</span>
                  </span>
                  {!row.read_at ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" role="img" aria-label="Unread" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageFrame>
  );
}
