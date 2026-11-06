"use client";

import Link, { useLinkStatus } from "next/link";

/** A fixed-size spinner slot: it only fades in, so the pill never changes width when it is tapped. */
function Spinner() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-pending={pending ? "true" : "false"}
      className={`h-4 w-4 shrink-0 rounded-full border-2 border-white/35 border-t-white motion-safe:animate-spin ${pending ? "inline-block" : "hidden"}`}
    />
  );
}

function Label() {
  const { pending } = useLinkStatus();
  return <span>{pending ? "Opening…" : "Book"}</span>;
}

/**
 * The Book pill on a trip's row. A tap answers at once (spinner and "Opening…");
 * while one is opening the other pills dim and stop taking taps. Put the pills
 * inside a `group/books` element, and give the row `has-[[data-pending=true]]`
 * styling (a stronger tint) to mark the one that is opening.
 */
export function BookLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex min-h-11 min-w-24 items-center justify-center gap-2 rounded-full bg-blue-600 px-[18px] text-[15px] font-bold text-white transition-opacity hover:bg-blue-700 group-has-[[data-pending=true]]/books:[&:not(:has([data-pending=true]))]:pointer-events-none group-has-[[data-pending=true]]/books:[&:not(:has([data-pending=true]))]:opacity-45"
    >
      <Spinner />
      <Label />
    </Link>
  );
}
