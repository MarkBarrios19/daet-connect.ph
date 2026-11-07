import { Suspense, type ReactNode } from "react";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { ChatDock } from "@/components/chat-dock/chat-dock";
import { BrandMark } from "@/components/ui/brand-mark";
import { LiveProvider, LiveSeed } from "@/components/live/live-provider";
import { signedInViewer, isStaffRole } from "@/components/ui/page-frame";
import { RevealObserver } from "@/components/ui/reveal-observer";
import { RoleTabBar } from "@/components/ui/role-tab-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { SiteFooter } from "@/components/ui/site-footer";
import { SiteHeader } from "@/components/ui/site-header";
import { accountLinks, barTabs, roleTabs } from "@/lib/tours/dashboards";
import { loadNotifications } from "@/lib/tours/notifications-server";

/**
 * The chrome shared by every signed-in page, mounted once by the layout of the
 * `(signed-in)` route group. Client navigations between those pages keep the
 * layout, so the header, tab bar, chat dock and live poller are not fetched or
 * rebuilt on each tap; only the page inside `{children}` changes.
 *
 * What is the same for every visitor is the static shell, prerendered and sent
 * at once: the skip link, a header and tab bar of the right size, the footer and
 * the floating buttons. What depends on who is signed in (their name, photo,
 * role tabs, notifications, the chat dock) is read at request time behind one
 * <Suspense> boundary and streams in. Nothing personal is ever cached.
 *
 * The live poller wraps both the streamed chrome and the page, because page
 * bodies read it too (the inbox, live counts, the chat). It mounts empty and is
 * handed the person's notifications by <LiveSeed> once the chrome has them.
 *
 * Because these pages are for signed-in people, the shell can say so: the
 * compact footer, room for the phone tab bar and the raised floating buttons
 * hold for every role. Each page lays out its own width with <PageBody>.
 */
export function SignedInFrame({ children }: { children: ReactNode }) {
  return (
    <LiveProvider>
      <div className="min-h-screen" data-has-tabs="">
        <RevealObserver />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-blue-600 focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
        >
          Skip to main content
        </a>
        <Suspense fallback={<ChromeFallback />}>
          <ViewerChrome />
        </Suspense>
        <main id="main-content" tabIndex={-1} className="w-full outline-none">
          {children}
        </main>
        <SiteFooter compact className="pb-24" />
        <AssistantWidget signedIn raised />
        <ScrollToTop raised />
      </div>
    </LiveProvider>
  );
}

/** The page's width and padding inside the shared frame. `bleed` is for pages that lay out their own full-width sections. */
export function PageBody({ children, bleed = false }: { children: ReactNode; bleed?: boolean }) {
  return bleed ? <>{children}</> : <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">{children}</div>;
}

/** The header, tab bar and chat dock for whoever is signed in. Reads cookies, so it runs per request. */
async function ViewerChrome() {
  const [viewer, notifications] = await Promise.all([signedInViewer(), loadNotifications()]);
  const role = viewer?.role;
  const tabs = role === undefined ? [] : roleTabs(role);
  const staff = isStaffRole(role);
  const account = viewer ? { initial: viewer.initial, name: viewer.name, avatarUrl: viewer.avatarUrl } : undefined;
  return (
    <>
      <LiveSeed initial={role !== undefined ? notifications : null} />
      <SiteHeader
        signedIn={role !== undefined}
        role={isStaffRole(role) ? role : undefined}
        tabs={tabs}
        account={account}
        notifications={notifications}
      />
      <RoleTabBar
        tabs={barTabs(role, tabs)}
        account={account && !staff ? { ...account, links: accountLinks(role, tabs) } : undefined}
      />
      {role !== undefined ? <ChatDock /> : null}
    </>
  );
}

/** Same size as the real header and tab bar, so nothing moves when they arrive. */
function ChromeFallback() {
  return (
    <>
      <header className="sticky top-0 z-40 bg-surface/80 text-daet-ink shadow-header backdrop-blur-md dark:bg-slate-950/80 dark:text-white dark:shadow-none print:hidden">
        <div className="mx-auto flex min-h-[var(--header-h)] max-w-7xl items-center gap-1 px-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center">
            <BrandMark />
          </div>
          <div aria-hidden="true" className="h-9 w-9 animate-pulse rounded-full bg-daet-ink/10" />
        </div>
      </header>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] sm:hidden print:hidden"
      >
        <div className="mx-auto grid min-h-14 max-w-md grid-cols-5 items-center justify-items-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-6 w-6 animate-pulse rounded-full bg-daet-ink/10" />
          ))}
        </div>
      </div>
    </>
  );
}
