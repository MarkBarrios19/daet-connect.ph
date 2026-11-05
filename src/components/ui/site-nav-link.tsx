"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

const BASE =
  "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[15px] font-semibold transition-[background-color,color,scale] duration-150 ease-[ease] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 lg:px-4";

/** Header link that marks the current page for assistive tech and sighted users. */
export function SiteNavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname() ?? "";
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        BASE,
        current
          ? "bg-blue-50 text-blue-700 dark:bg-white/15 dark:text-white"
          : "text-daet-ink hover:bg-muted dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white",
        className,
      )}
    >
      {children}
    </Link>
  );
}
