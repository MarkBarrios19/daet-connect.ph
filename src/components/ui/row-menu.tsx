"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { LineIcon } from "@/components/ui/icons";
import { usePopover } from "@/components/ui/use-popover";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Draw it as destructive (Delete). */
  danger?: boolean;
};

/**
 * The "⋯" menu that replaces a row's repeated ↑ ↓ Edit Delete buttons.
 *
 * Built on `usePopover`, so it closes on Escape (focus back on the button), on a
 * click outside, and on navigation, and it tells the floating buttons it covers
 * the screen. The list is a real menu with arrow-key roving focus and Home/End,
 * which a screen reader announces as a menu with items.
 */
export function RowMenu({
  label,
  items,
  align = "end",
}: {
  /** Names the button, e.g. "Standard price option". */
  label: string;
  items: RowMenuItem[];
  align?: "start" | "end";
}) {
  const { open, setOpen, toggle, rootRef, buttonRef } = usePopover(`row-menu-${label}`);
  const listRef = useRef<HTMLDivElement>(null);

  // Opening puts focus on the first item, as a menu button should.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} options`}
        onClick={toggle}
        className="inline-grid h-11 w-11 place-items-center rounded-full text-daet-ink/75 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <LineIcon name="more" className="h-5 w-5" />
      </button>
      {open ? (
        <div
          ref={listRef}
          role="menu"
          aria-label={`${label} options`}
          onKeyDown={(event) => {
            const focusable = () =>
              Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
            const items = focusable();
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const next = event.key === "ArrowDown" ? current + 1 : current - 1;
              items[(next + items.length) % items.length]?.focus();
            } else if (event.key === "Home") {
              event.preventDefault();
              items[0]?.focus();
            } else if (event.key === "End") {
              event.preventDefault();
              items[items.length - 1]?.focus();
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
          className={`absolute z-40 mt-1 min-w-48 rounded-2xl card-edge bg-surface p-1 shadow-[var(--shadow-float)] ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
                item.onSelect();
              }}
              className={`flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 text-left text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                item.danger
                  ? "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                  : "text-daet-ink hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A section's heading row: title, an optional one-line summary, and an action. */
export function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={`${id}-heading`} className="text-xl font-bold text-daet-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-daet-ink/80">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
