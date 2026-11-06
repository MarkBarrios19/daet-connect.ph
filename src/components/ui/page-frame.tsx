import { PresenceHeartbeat } from "@/components/chat/presence-heartbeat";
import type { ReactNode } from "react";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { ChatDock } from "@/components/chat-dock/chat-dock";
import { RevealObserver } from "@/components/ui/reveal-observer";
import { RoleTabBar } from "@/components/ui/role-tab-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { SiteFooter } from "@/components/ui/site-footer";
import { SiteHeader } from "@/components/ui/site-header";
import type { PhotoKey } from "@/lib/photo-credits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { accountLinks, barTabs, roleTabs } from "@/lib/tours/dashboards";
import { loadNotifications } from "@/lib/tours/notifications-server";
import { getMyProfile } from "@/lib/tours/my-profile";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { displayName, initials } from "@/lib/profile/name";

type Viewer = {
  role: string;
  initial: string;
  name: string;
  avatarUrl: string | null;
};

async function signedInViewer(): Promise<Viewer | undefined> {
  if (!isSupabaseConfigured()) return undefined;
  try {
    // The profile row is the record (name and photo); the sign-up metadata and
    // the address are the fallbacks, so a header always has something to draw.
    const [{ user, role }, profile] = await Promise.all([
      getAuthenticatedSession(),
      getMyProfile(),
    ]);
    if (!user) return undefined;
    const meta = (user.user_metadata ?? {}) as {
      full_name?: unknown;
      name?: unknown;
    };
    const metaName = [meta.full_name, meta.name].find(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    const name = displayName({
      profileName: profile?.fullName,
      metaName,
      email: user.email,
    });
    return {
      role: role ?? "tourist",
      name,
      initial: initials(name),
      avatarUrl: profile?.avatarUrl ?? null,
    };
  } catch {
    return undefined;
  }
}

const isStaffRole = (
  role: string | null | undefined,
): role is "operator" | "guide" | "admin" =>
  role === "operator" || role === "guide" || role === "admin";

export async function PageFrame({
  children,
  adminNav = false,
  credits,
  bleed = false,
}: {
  children: ReactNode;
  adminNav?: boolean;
  /** Photos shown on the page, credited in the footer. */
  credits?: PhotoKey[];
  /** The page lays out its own full-width sections (public pages); no inner padding or max width. */
  bleed?: boolean;
}) {
  const [viewer, notifications] = await Promise.all([signedInViewer(), loadNotifications()]);
  const role = viewer?.role;
  const tabs = role === undefined ? [] : roleTabs(role);
  const staff = isStaffRole(role);
  const account = viewer
    ? {
        initial: viewer.initial,
        name: viewer.name,
        avatarUrl: viewer.avatarUrl,
      }
    : undefined;
  return (
    // data-has-tabs: the phone tab bar is drawn, so anything docked to the foot
    // of the screen (the home page's open-place sheet) must clear it. See
    // --tab-bar-h in globals.css.
    <div className="min-h-screen" data-has-tabs={tabs.length > 0 ? "" : undefined}>
      <RevealObserver />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-blue-600 focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to main content
      </a>
      <SiteHeader
        showAdminLink={adminNav}
        signedIn={role !== undefined}
        role={isStaffRole(role) ? role : undefined}
        tabs={tabs}
        account={account}
        notifications={notifications}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className={
          bleed
            ? "w-full outline-none"
            : "mx-auto w-full max-w-7xl px-4 py-6 outline-none sm:px-6 sm:py-10 lg:px-8"
        }
      >
        {children}
      </main>
      {/* Signed-in work pages get a one-line footer; public pages (and visitors) get the full close. */}
      {/* Room under the footer for the floating chat button (and the tab bar on phones). */}
      <SiteFooter
        credits={credits}
        compact={role !== undefined && !bleed}
        className={tabs.length ? "pb-24" : "pb-20 sm:pb-24"}
      />
      {/* The bar's tabs, not the role's: a tourist's Home here is the landing
          page. The account menu below still takes `tabs`, so its Dashboard
          link stays the dashboard. */}
      <RoleTabBar
        tabs={barTabs(role, tabs)}
        account={
          account && !staff
            ? { ...account, links: accountLinks(role, tabs) }
            : undefined
        }
      />
      {role !== undefined ? <PresenceHeartbeat /> : null}
      <AssistantWidget signedIn={role !== undefined} raised={tabs.length > 0} />
      {/* The way back to the top of a long page; lifted over the tab bar when there is one. */}
      <ScrollToTop raised={tabs.length > 0} />
      {role !== undefined ? <ChatDock /> : null}
    </div>
  );
}
