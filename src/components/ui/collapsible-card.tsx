import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { LineIcon } from "@/components/ui/icons";

/**
 * A card that opens and closes like a drop-down.
 *
 * Native `<details>`/`<summary>`, the same disclosure the mobile menu, the
 * filters, the booking panel and the FAQ use: it opens without JavaScript,
 * keeps its contents in the HTML for find-in-page, and needs no ARIA to work
 * from the keyboard. It starts closed, so a page of these stays short and the
 * one-line summary says what is inside.
 *
 * `action` is rendered as a sibling of `<details>`, absolutely positioned over
 * the header row — never inside `<summary>`, where it would be a nested
 * control sharing the row's toggle. It stays visible and clickable whether the
 * card is open or closed. It is vertically centred against the summary's
 * minimum 4rem height, so pair it with a single-line (description-less)
 * header.
 *
 * The opening itself is animated in globals.css under `data-collapsible-card`,
 * where the browser can interpolate to `auto`; anywhere else it opens
 * instantly, which is how it behaves without that support.
 */
export function CollapsibleCard({
  id,
  title,
  description,
  hint,
  action,
  className,
  bodyClassName,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Short status shown in the header row before the chevron — visible while collapsed, e.g. "2 unread". */
  hint?: ReactNode;
  /** Stays visible whether open or closed. Keep to a single link or button. */
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <div id={id} className={cn("relative min-w-0 scroll-mt-6 rounded-2xl card-edge bg-surface", className)}>
      <details data-collapsible-card className="group" {...(defaultOpen ? { open: true } : {})}>
        <summary
          className={cn(
            "flex min-h-16 cursor-pointer list-none select-none items-center gap-3 rounded-2xl px-5 py-4",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600/60",
            "[&::-webkit-details-marker]:hidden",
            action ? "pr-36 sm:pr-40" : null,
          )}
        >
          <span className="min-w-0 flex-1">
            {/* One heading per disclosure is allowed inside <summary>; the h2 keeps the document outline the plain Card had. */}
            <h2 className="text-xl font-bold text-daet-ink sm:text-2xl">{title}</h2>
            {description ? <span className="mt-1 block text-sm font-normal text-daet-ink/80">{description}</span> : null}
          </span>
          {hint ? <span className="shrink-0 text-sm font-bold text-daet-ink/70">{hint}</span> : null}
          <LineIcon
            name="chevron-down"
            aria-hidden="true"
            className="h-6 w-6 shrink-0 text-daet-ink/55 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-180"
          />
        </summary>
        <div className={cn("border-t border-hairline px-5 pb-5 pt-4 sm:px-6", bodyClassName)}>{children}</div>
      </details>
      {action ? (
        <div className="absolute right-14 top-0 flex h-16 items-center sm:right-16">{action}</div>
      ) : null}
    </div>
  );
}
