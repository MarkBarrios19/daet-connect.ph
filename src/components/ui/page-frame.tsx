import type { ReactNode } from "react";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { ChatDock } from "@/components/chat-dock/chat-dock";
import { RevealObserver } from "@/components/ui/reveal-observer";
import { RoleTabBar } from "@/components/ui/role-tab-bar";
import { SiteFooter } from "@/components/ui/site-footer";
import { SiteHeader } from "@/components/ui/site-header";
import type { PhotoKey } from "@/lib/photo-credits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { accountLinks, roleTabs } from "@/lib/tours/dashboards";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

type Viewer = { role: string; initial: string; name: string };

async function signedInViewer(): Promise<Viewer | undefined> {
  if (!isSupabaseConfigured()) return undefined;
  try {
    const { user, role } = await getAuthenticatedSession();
    if (!user) return undefined;
    const meta = (user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
    const fullName = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim();
    const name = fullName ?? user.email ?? "Your account";
    return { role: role ?? "tourist", name, initial: (name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase() };
  } catch {
    return undefined;
  }
}

const isStaffRole = (role: string | null | undefined): role is "operator" | "guide" | "admin" =>
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
  const viewer = await signedInViewer();
  const role = viewer?.role;
  const tabs = role === undefined ? [] : roleTabs(role);
  const staff = isStaffRole(role);
  const account = viewer ? { initial: viewer.initial, name: viewer.name } : undefined;
  return (
    <div className="min-h-screen">
      <RevealObserver />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-blue-600 focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to main content
      </a>
      <SiteHeader showAdminLink={adminNav} signedIn={role !== undefined} role={isStaffRole(role) ? role : undefined} tabs={tabs} account={account} />
      <main
        id="main-content"
        tabIndex={-1}
        className={bleed ? "w-full outline-none" : "mx-auto w-full max-w-7xl px-4 py-6 outline-none sm:px-6 sm:py-10 lg:px-8"}
      >
        {children}
      </main>
      {/* Signed-in work pages get a one-line footer; public pages (and visitors) get the full close. */}
      {/* Room under the footer for the floating chat button (and the tab bar on phones). */}
      <SiteFooter credits={credits} compact={role !== undefined && !bleed} className={tabs.length ? "pb-24" : "pb-20 sm:pb-24"} />
      <RoleTabBar tabs={tabs} account={account && !staff ? { ...account, links: accountLinks(role, tabs) } : undefined} />
      <AssistantWidget signedIn={role !== undefined} raised={tabs.length > 0} />
      {role !== undefined ? <ChatDock /> : null}
    </div>
  );
}
