"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabIcon } from "@/components/ui/icons";
import { UnreadMessagesBadge } from "@/components/chat/unread-badge";
import { AccountMenu } from "@/components/ui/account-menu";
import { activeTab, type Tab } from "@/lib/tours/dashboards";

/**
 * Bottom tab bar on phones for signed-in users; hidden from sm up, where the
 * header has room. With `account` the last tab is You, the account menu.
 */
export function RoleTabBar({
  tabs,
  account,
}: {
  tabs: Tab[];
  account?: { initial: string; name: string; avatarUrl?: string | null; links: Tab[] };
}) {
  const pathname = usePathname() ?? "";
  const current = activeTab(tabs, pathname);
  if (tabs.length === 0) return null;
  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] sm:hidden print:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold transition-[color,scale] duration-150 ease-out active:scale-95 ${active ? "text-blue-600 dark:text-blue-300" : "text-daet-ink/75 hover:text-daet-ink"}`}
              >
                <span className="relative isolate">
                  {/* The active tab's pill fades in behind its icon. */}
                  {active ? <span aria-hidden="true" className="motion-pop-in absolute -inset-x-3.5 -inset-y-1 -z-10 rounded-full bg-blue-50 dark:bg-blue-950/40" /> : null}
                  <TabIcon label={tab.label} className="h-6 w-6" />
                  {tab.href === "/tours/messages" ? <UnreadMessagesBadge className="absolute -right-3 -top-1.5" /> : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
        {account ? (
          <li>
            <AccountMenu variant="tab" initial={account.initial} name={account.name} avatarUrl={account.avatarUrl} links={account.links} />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
