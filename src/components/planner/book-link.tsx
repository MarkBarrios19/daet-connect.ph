"use client";

import Link, { useLinkStatus } from "next/link";
import { LineIcon } from "@/components/ui/icons";

/** The arrow, which becomes a spinner the moment the tap is accepted. A fixed-size slot, so nothing shifts. */
function Hint() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true" className="relative grid h-6 w-6 shrink-0 place-items-center">
      <LineIcon name="arrowRight" className={`h-6 w-6 transition-opacity duration-150 ${pending ? "opacity-0" : "opacity-100"}`} />
      <span
        data-pending={pending ? "true" : "false"}
        className={`absolute h-5 w-5 rounded-full border-2 border-white/35 border-t-white transition-opacity duration-150 motion-safe:animate-spin ${pending ? "opacity-100" : "opacity-0"}`}
      />
    </span>
  );
}

/** The second line says "Opening…" while the next page loads. */
function Detail({ children }: { children: string }) {
  const { pending } = useLinkStatus();
  return <span className="block text-sm leading-5 text-blue-100">{pending ? "Opening…" : children}</span>;
}

/**
 * A booking button: the trip's name, then its price, then an arrow. A tap
 * answers at once (spinner and "Opening…"), and while one is opening the
 * others dim and stop taking taps (put them inside a `group/books` element).
 */
export function BookLink({ href, title, detail, label }: { href: string; title: string; detail: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex min-h-16 items-center gap-3 rounded-full bg-blue-600 py-2.5 pl-5 pr-3 text-left text-white transition-opacity hover:bg-blue-700 group-has-[[data-pending=true]]/books:[&:not(:has([data-pending=true]))]:pointer-events-none group-has-[[data-pending=true]]/books:[&:not(:has([data-pending=true]))]:opacity-45"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold leading-5">{title}</span>
        <Detail>{detail}</Detail>
      </span>
      <Hint />
    </Link>
  );
}
