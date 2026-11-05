import Link from "next/link";
import { PhotoCredits } from "@/components/ui/photo-credits";
import type { PhotoKey } from "@/lib/photo-credits";

const COLUMNS = [
  {
    label: "Explore",
    links: [
      { href: "/tours/browse", label: "Trips" },
      { href: "/tours/plan", label: "Plan a trip" },
      { href: "/tours/attractions", label: "Places" },
      { href: "/tours/events", label: "Events" },
      { href: "/tours/merch", label: "Souvenirs" },
    ],
  },
  {
    label: "Help",
    links: [
      { href: "/tours/faq", label: "Common questions" },
      { href: "/tours/help", label: "Daet AI assistant" },
      { href: "/tours/my-bookings", label: "My bookings" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    label: "Work with us",
    links: [
      { href: "/tours/operator/register", label: "Apply as an operator" },
      { href: "/tours/guide/register", label: "Apply as a guide" },
    ],
  },
];

/** The site's close: the name set large, the key links, and any photo credits for the page. */
export function SiteFooter({ credits = [], compact = false, className = "" }: { credits?: PhotoKey[]; compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <footer className={`mx-auto max-w-7xl px-4 py-8 text-sm text-daet-ink/80 sm:px-6 lg:px-8 print:hidden ${className}`}>
        CONNECT-DAET · Tourism in Daet, Camarines Norte ·{" "}
        <Link href="/tours/help" className="font-bold text-blue-700 dark:text-blue-300 underline underline-offset-2">
          Help (24/7 assistant)
        </Link>
      </footer>
    );
  }
  return (
    <footer className={`mt-24 bg-slate-900 text-white print:hidden ${className}`}>
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <nav key={column.label} aria-label={column.label}>
              <h2 className="font-sans text-base font-bold tracking-normal text-white">{column.label}</h2>
              <ul className="mt-3 space-y-1">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="inline-flex min-h-11 min-w-11 items-center text-slate-200 hover:text-white hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        {/* The wordmark at the header's own size, not a full-bleed headline
            (owner's note, image-90): the close of the page should read as the
            same name that opened it, not as a second billboard. */}
        <p className="mt-14 font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-white sm:text-xl">
          CONNECT-DAET
        </p>
        <p className="mt-4 max-w-2xl text-slate-300">
          Tours, places and events in Daet, Camarines Norte, run by local operators and guides accredited by the Daet Tourism Office.
        </p>
        {credits.length ? (
          <div className="mt-6 [&_a]:text-slate-200 [&_p]:text-slate-400">
            <PhotoCredits keys={credits} />
          </div>
        ) : null}
      </div>
    </footer>
  );
}
