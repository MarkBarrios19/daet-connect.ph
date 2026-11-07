"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LineIcon } from "@/components/ui/icons";
import { ThemeChoices } from "@/components/ui/theme-toggle";
import { useDragDismiss } from "@/components/ui/use-drag-dismiss";
import { announceOverlay } from "@/lib/ui-overlay";

const DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";

/** The sheet drops in from the bar; with reduced motion it only fades. */
function playOpen(sheet: HTMLElement | null) {
  if (!sheet?.animate) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  sheet.animate(
    reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "none" }],
    { duration: reduce ? 150 : 240, easing: DRAWER },
  );
}

export type MenuLink = { href: string; label: string };

/**
 * The phone menu: a round 44px Menu button at the start of the bar that opens
 * a sheet of links. Built on <details>, so it opens without JavaScript; it
 * closes itself after navigation. Visitors also get the Theme choice; signed-in
 * users have Dark mode in their account menu.
 */
export function MobileMenu({ groups, showTheme = true }: { groups: Array<{ label: string; links: MenuLink[] }>; showTheme?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  // Unmounting while open (no toggle event fires then) clears the overlay too.
  useEffect(() => () => announceOverlay("menu", false), []);
  const visible = groups.filter((g) => g.links.length);
  // Swipe the sheet up (by its bottom handle) to close it.
  const { sheetRef, handleRef } = useDragDismiss<HTMLElement, HTMLDivElement>("up", () => {
    if (ref.current) ref.current.open = false;
  });

  return (
    <details
      ref={ref}
      className="group md:hidden"
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setOpen(isOpen);
        announceOverlay("menu", isOpen);
        if (isOpen) playOpen(sheetRef.current);
      }}
    >
      <summary
        aria-label="Menu"
        className="mr-1.5 grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full bg-blue-50 text-blue-700 transition-[scale] duration-150 ease-out active:scale-95 dark:bg-blue-950/40 dark:text-blue-300 [&::-webkit-details-marker]:hidden"
      >
        {/* The bars turn into a cross: one icon rotates out as the other rotates in. */}
        <span className="relative h-6 w-6">
          <LineIcon name="menu" className="absolute inset-0 h-6 w-6 transition-[opacity,rotate,scale] duration-200 ease-out group-open:rotate-90 group-open:scale-50 group-open:opacity-0" />
          <LineIcon name="close" className="absolute inset-0 h-6 w-6 -rotate-90 scale-50 opacity-0 transition-[opacity,rotate,scale] duration-200 ease-out group-open:rotate-0 group-open:scale-100 group-open:opacity-100" />
        </span>
      </summary>
      <nav
        ref={sheetRef}
        aria-label="Menu"
        className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4.5rem)] overflow-y-auto bg-surface px-4 pb-6 pt-2 shadow-[var(--shadow-float)]"
      >
        {visible.map((group) => (
          <div key={group.label} className="mt-3 first:mt-0">
            <p className="px-3 py-2 text-sm font-semibold text-daet-ink/70">{group.label}</p>
            <ul>
              {group.links.map((link) => {
                const current = pathname === link.href || (pathname ?? "").startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? "page" : undefined}
                      className={`flex min-h-12 items-center rounded-2xl px-3 text-lg font-semibold ${current ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" : "text-daet-ink hover:bg-muted"}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {showTheme ? <ThemeChoices /> : null}
        <div ref={handleRef} aria-hidden="true" className="-mb-4 flex touch-none justify-center pb-1 pt-4">
          <span className="h-1.5 w-10 rounded-full bg-muted-strong" />
        </div>
      </nav>
      {/* Portaled to <body>: the header's backdrop filter would otherwise clip a fixed scrim to the bar. */}
      {open
        ? createPortal(
            <div
              aria-hidden="true"
              onClick={() => {
                if (ref.current) ref.current.open = false;
              }}
              className="fixed inset-0 z-30 bg-black/30 md:hidden"
            />,
            document.body,
          )
        : null}
    </details>
  );
}
