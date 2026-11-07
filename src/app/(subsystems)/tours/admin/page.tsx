import { getAuthUser } from "@/lib/tours/server-auth";
import { LiveCount } from "@/components/live/live-count";
import { LineIcon } from "@/components/ui/icons";
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageFrame } from '@/components/ui/page-frame';
import { Notice } from '@/components/ui/notice';


export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();
  
  // Check if user is admin
  const user = await getAuthUser();
  if (!user) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="info" title="Admin sign-in required">
            <Link href={`/login?next=${encodeURIComponent("/tours/admin")}`} className="font-bold underline underline-offset-4">
              Sign in
            </Link>{" "}
            with a Tourism Office admin account.
          </Notice>
        </div>
      </PageFrame>
    );
  }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  
  if (profile?.role !== 'admin') {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="error" title="Access denied">
            Only Tourism Office admins can access this dashboard.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  // Get counts of pending items
  const [
    operatorsResult,
    guidesResult,
    pendingPackagesResult,
    publishedPackagesResult,
    bookingsResult,
  ] = await Promise.all([
    supabase.from('tours_operators').select('*', { count: 'exact', head: true }).eq('accreditation_status', 'pending'),
    supabase.from('tours_guides').select('*', { count: 'exact', head: true }).eq('accreditation_status', 'pending'),
    supabase.from('tours_packages').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('tours_packages').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('tours_bookings').select('*', { count: 'exact', head: true }),
  ]);

  const pendingOperators = operatorsResult.count || 0;
  const pendingGuides = guidesResult.count || 0;
  const pendingPackages = pendingPackagesResult.count || 0;
  const publishedPackages = publishedPackagesResult.count || 0;
  const totalBookings = bookingsResult.count || 0;

  // Get recent admin activities
  const { data: recentActivities } = await supabase
    .from('tours_admin_audit_log')
    .select('*, profiles!inner(full_name)')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <PageFrame adminNav>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="display-2 text-daet-ink">Tourism Office</h1>
            <p className="mt-2 text-lg text-daet-ink">
              Welcome back, {profile.full_name || 'Admin'}
            </p>
          </div>
        </div>
      </div>

      {/* Two figures per row on phones; what waits on the office is amber and links to its queue. */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(
          [
            { label: "Operators to review", value: pendingOperators || 0, href: "/tours/admin/operators", icon: "building", waiting: true, live: "adminOperators" as const },
            { label: "Guides to verify", value: pendingGuides || 0, href: "/tours/admin/guides", icon: "user", waiting: true, live: "adminGuides" as const },
            { label: "Packages to approve", value: pendingPackages || 0, href: "/tours/admin/packages", icon: "box", waiting: true, live: "adminPackages" as const },
            { label: "Published packages", value: publishedPackages || 0, href: null, icon: "check", waiting: false },
            { label: "Bookings, all time", value: totalBookings || 0, href: null, icon: "calendar", waiting: false },
          ] as const
        ).map((stat) => {
          const body = (
            <>
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">{stat.label}</span>
                <LineIcon name={stat.icon} className="h-5 w-5 shrink-0 text-daet-ink/60" />
              </span>
              {"live" in stat && stat.live ? (
                <LiveCount name={stat.live} initial={stat.value} waiting className="mt-1 block text-3xl font-bold" />
              ) : (
                <span className="mt-1 block text-3xl font-bold text-daet-ink">{stat.value}</span>
              )}
              {stat.href ? <span className="mt-1 block text-sm font-bold text-blue-700 dark:text-blue-300">{stat.value > 0 ? "Review →" : "Open →"}</span> : null}
            </>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="block rounded-2xl card-edge bg-surface p-4 transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-[0.99]">
              {body}
            </Link>
          ) : (
            <div key={stat.label} className="rounded-2xl card-edge bg-surface p-4">
              {body}
            </div>
          );
        })}
      </div>

      {/* Analytics, approvals and messages are in the tab bar and header; this lists the rest. */}
      <div className="mb-8 rounded-2xl card-edge bg-surface p-5 sm:p-6">
        <h2 className="mb-4 text-xl font-bold text-daet-ink">Manage</h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ["/tours/admin/events", "Events calendar"],
            ["/tours/admin/attractions", "Places"],
            ["/tours/admin/guide-places", "Food, stays and fares"],
            ["/tours/admin/reviews", "Reviews"],
            ["/tours/admin/merch", "Merchandise"],
            ["/tours/admin/guides", "Guides"],
            ["/tours/admin/packages", "Packages"],
            ["/tours/admin/emergency", "Emergency numbers"],
            ["/tours/admin/feedback", "Assistant feedback"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="flex min-h-12 items-center rounded-2xl bg-canvas px-4 font-bold leading-snug text-daet-ink transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-[0.98]">
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {recentActivities && recentActivities.length > 0 && (
        <div className="rounded-2xl card-edge bg-surface p-6">
          <h2 className="text-xl font-bold text-daet-ink mb-4">Recent activity</h2>
          <div className="space-y-3">
            {recentActivities.map((activity: any) => (
              <div key={activity.id} className="flex items-start gap-3 text-sm">
                <div className="h-8 w-8 rounded-full bg-daet-sand flex items-center justify-center flex-shrink-0">
                  {getActivityIcon(activity.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-daet-ink font-medium">
                    {activity.profiles.full_name || 'Admin'}{' '}
                    <span className="text-daet-ink/70 font-normal">
                      {getActivityDescription(activity)}
                    </span>
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {new Date(activity.created_at).toLocaleString()}
                  </p>
                  {activity.notes && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 italic">"{activity.notes}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageFrame>
  );
}

function getActivityIcon(action: string): string {
  switch (action) {
    case 'approve_operator':
    case 'approve_guide':
      return '✓';
    case 'reject_operator':
    case 'reject_guide':
      return '✗';
    case 'update_package_status':
      return '•';
    case 'delete_package':
      return '−';
    case 'ban_user':
      return '×';
    case 'unban_user':
      return '✓';
    default:
      return '•';
  }
}

function getActivityDescription(activity: any): string {
  switch (activity.action) {
    case 'approve_operator':
      return 'approved an operator application';
    case 'reject_operator':
      return 'rejected an operator application';
    case 'approve_guide':
      return 'approved a guide application';
    case 'reject_guide':
      return 'rejected a guide application';
    case 'update_package_status':
      return `changed package status to ${activity.new_value}`;
    case 'delete_package':
      return 'deleted a package';
    case 'ban_user':
      return 'banned a user';
    case 'unban_user':
      return 'unbanned a user';
    default:
      return 'performed an action';
  }
}
