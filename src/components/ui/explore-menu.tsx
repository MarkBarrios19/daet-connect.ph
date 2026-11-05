"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LineIcon } from "@/components/ui/icons";
import type { MenuLink } from "@/components/ui/mobile-menu";
import { usePopover } from "@/components/ui/use-popover";

/** Tablet widths: the destination links fold into one Explore menu (nav iteration 3). */
export function ExploreMenu({ links, className = "" }: { links: MenuLink[]; className?: string }) {
  const { open, toggle, rootRef, buttonRef } = usePopover("explore");
  const pathname = usePathname() ?? "";
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const inside = links.some((link) => isCurrent(link.href));
  if (links.length === 0) return null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="explore-panel"
        onClick={toggle}
        className={`inline-flex min-h-11 items-center gap-1 rounded-full pl-3.5 pr-3 text-[15px] font-semibold transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.97] ${inside || open ? "bg-blue-50 text-blue-700 dark:bg-white/15 dark:text-white" : "text-daet-ink hover:bg-muted dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white"}`}
      >
        Explore
        <LineIcon name="chevron-down" className={`h-4 w-4 transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <nav id="explore-panel" aria-label="Explore" className="motion-pop absolute left-0 top-full z-50 mt-2 w-52 [--pop-origin:3rem_0] rounded-2xl card-edge bg-surface p-2 shadow-[var(--shadow-float)]">
          <ul>
            {links.map((link) => {
              const current = isCurrent(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-base ${current ? "bg-blue-50 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-daet-ink hover:bg-muted"}`}
                  >
                    {link.label}
                    {current ? <LineIcon name="check" className="h-[18px] w-[18px]" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
