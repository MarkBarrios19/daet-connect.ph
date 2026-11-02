import { AccountMenu } from "@/components/ui/account-menu";
import { BrandMark } from "@/components/ui/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { ExploreMenu } from "@/components/ui/explore-menu";
import { LineIcon } from "@/components/ui/icons";
import { MobileMenu, type MenuLink } from "@/components/ui/mobile-menu";
import { SiteNavLink } from "@/components/ui/site-nav-link";
import { NotificationBell } from "@/components/tours/notification-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { accountLinks, type DashboardRole, type Tab } from "@/lib/tours/dashboards";

const PLAN_LINK: MenuLink = { href: "/tours/plan", label: "Plan a trip" };

/** What a visitor or tourist came for. Staff don't get it (adviser revision R1). */
const DESTINATION_LINKS: MenuLink[] = [
  { href: "/tours/browse", label: "Trips" },
  { href: "/tours/attractions", label: "Places" },
  { href: "/tours/events", label: "Events" },
  { href: "/tours/merch", label: "Souvenirs" },
];

const JOIN_LINKS: MenuLink[] = [
  { href: "/tours/operator/register", label: "Run tours: apply as an operator" },
  { href: "/tours/guide/register", label: "Guide tours: apply as a guide" },
];

const ADMIN_LINKS: MenuLink[] = [
  { href: "/tours/admin/analytics", label: "Analytics" },
  { href: "/tours/admin/operators", label: "Operators" },
  { href: "/tours/admin/guides", label: "Guides" },
  { href: "/tours/admin/packages", label: "Packages" },
];

/**
 * Nav iteration 3. Wide screens: plain links in the bar (Plan a trip first),
 * then the bell and a round avatar that opens the account menu. Tablets fold
 * the destinations into one Explore menu. Phones: Menu, the wordmark and the
 * bell; tourists reach their account from the You tab, staff from the avatar.
 */
export function SiteHeader({
  showAdminLink = false,
  signedIn = false,
  role,
  tabs = [],
  account,
}: {
  showAdminLink?: boolean;
  signedIn?: boolean;
  /** Signed-in role. Staff (operator, guide, admin) don't get the tourist exploration menu (R1). */
  role?: DashboardRole;
  /** The signed-in user's role tabs (the bottom bar on phones). */
  tabs?: Tab[];
  /** Who is signed in, for the avatar. */
  account?: { initial: string; name: string };
}) {
  const explorer = !signedIn || !role || role === "tourist";
  const destinations = explorer ? DESTINATION_LINKS : [];
  // Home and Messages live in the account menu; the bar keeps the work sections.
  const roleLinks = signedIn && !explorer ? tabs.filter((tab) => tab.label !== "Home" && tab.href !== "/tours/messages") : [];
  const adminLinks = showAdminLink ? ADMIN_LINKS : [];
  const menuLinks = explorer ? [DESTINATION_LINKS[0], PLAN_LINK, ...DESTINATION_LINKS.slice(1)] : [];
  const workLinks = signedIn && !explorer ? tabs.map((tab) => ({ href: tab.href, label: tab.label === "Home" ? "Dashboard" : tab.label })) : [];

  return (
    // The bar stays at the top of the screen and is a scrim in both themes: white
    // at 80% with ink text in light mode, 80% ink with white text in dark mode,
    // each over a blur so the hero's photos read through it without turning the
    // label edges to noise. Light mode also keeps the one resting elevation the
    // design system allows (see --shadow-header).
    <header className="sticky top-0 z-40 bg-surface/80 text-daet-ink shadow-header backdrop-blur-md dark:bg-slate-950/80 dark:text-white dark:shadow-none print:hidden">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-1 px-3 sm:min-h-[3.8rem] sm:px-6 lg:px-8">
        <MobileMenu
          showTheme={!signedIn}
          groups={[
            { label: "Explore Daet", links: menuLinks },
            { label: "Your work", links: workLinks },
            { label: "Tourism Office", links: adminLinks },
            { label: "Join CONNECT-Daet", links: signedIn ? [] : JOIN_LINKS },
          ]}
        />
        <div className="flex min-w-0 flex-1 items-center">
          <BrandMark />
        </div>
        <nav aria-label="Main navigation" className="hidden min-w-0 items-center gap-1 md:flex">
          {explorer ? (
            <>
              <SiteNavLink href={PLAN_LINK.href} className="text-blue-700! dark:text-blue-200!">
                <LineIcon name="sparkle" className="mr-2 h-5 w-5" />
                {PLAN_LINK.label}
              </SiteNavLink>
              {/* A wrapper hides them; on the links themselves "hidden" would fight their inline-flex. */}
              <span className="hidden lg:contents">
                {destinations.map((link) => (
                  <SiteNavLink key={link.href} href={link.href}>
                    {link.label}
                  </SiteNavLink>
                ))}
              </span>
              <ExploreMenu links={destinations} className="lg:hidden" />
            </>
          ) : null}
          {roleLinks.map((link) => (
            <SiteNavLink key={link.href} href={link.href}>
              {link.label}
            </SiteNavLink>
          ))}
          <span className="hidden xl:contents">
            {adminLinks.map((link) => (
              <SiteNavLink key={link.href} href={link.href}>
                {link.label}
              </SiteNavLink>
            ))}
          </span>
        </nav>
        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2 md:flex-1">
          {signedIn ? (
            <>
              <NotificationBell />
              {account ? (
                // Tourists on phones use the You tab instead.
                <span className={explorer ? "hidden sm:contents" : "contents"}>
                  <AccountMenu initial={account.initial} name={account.name} links={accountLinks(role, tabs)} />
                </span>
              ) : null}
            </>
          ) : (
            <>
              <ThemeToggle className="hidden md:grid" />
              {/* Signing up is the header's one filled button; signing in is the
                  quiet way in, so the call to action reads at a glance. */}
              <ButtonLink href="/login" variant="onHeader" className="whitespace-nowrap px-4!">
                Sign in
              </ButtonLink>
              {/* A wrapper hides it on phones; on the link itself "hidden" would fight the button's inline-flex. */}
              <span className="hidden sm:contents">
                <ButtonLink href="/signup" size="lg" className="whitespace-nowrap">
                  Sign up
                </ButtonLink>
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
