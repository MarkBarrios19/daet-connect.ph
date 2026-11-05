"use client";

import { useEffect, useRef } from "react";
import { LineIcon, type IconName } from "@/components/ui/icons";

export type StopMenuItem = { label: string; icon: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean };

/**
 * A stop's actions, as on the boards: a small pop-up under the ⋯ button on
 * wider screens (Desktop-Actions) and a bottom sheet with Cancel on phones
 * (Phone-Actions). The same element changes shape with the breakpoint, so
 * there is one set of buttons for tests and screen readers. Escape, a tap
 * outside or Cancel close it, and focus goes back to the ⋯ button.
 */
export function StopMenu({ name, items, onClose, returnFocus }: { name: string; items: StopMenuItem[]; onClose: () => void; returnFocus: React.RefObject<HTMLButtonElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, so the listeners below are set up once per opening.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    const close = () => {
      closeRef.current();
      returnFocus.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || returnFocus.current?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [returnFocus]);

  const pick = (item: StopMenuItem) => () => {
    onClose();
    item.onSelect();
  };

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-[70] bg-slate-900/55 sm:hidden" />
      <div
        ref={ref}
        role="group"
        aria-label={`Options for ${name}`}
        className="fixed inset-x-0 bottom-0 z-[71] rounded-t-2xl bg-surface pb-5 pt-2 shadow-[var(--shadow-float)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-2 sm:top-14 sm:w-64 sm:rounded-2xl sm:py-2"
      >
        <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        <p className="px-5 pb-3 pt-1 text-sm text-slate-600 sm:hidden dark:text-slate-400">{name}</p>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={pick(item)}
            className={`flex min-h-14 w-full items-center gap-3.5 px-5 text-left text-base font-bold hover:bg-muted focus-visible:bg-muted disabled:opacity-50 sm:min-h-11 sm:px-4 sm:text-sm ${item.danger ? "text-red-700 dark:text-red-300" : "text-daet-ink"}`}
          >
            <LineIcon name={item.icon} className="h-5 w-5 shrink-0" />
            {item.label}
          </button>
        ))}
        <div className="px-4 pt-2 sm:hidden">
          <button
            type="button"
            onClick={() => {
              onClose();
              returnFocus.current?.focus();
            }}
            className="min-h-12 w-full rounded-full border border-slate-500 bg-surface text-base font-bold text-daet-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
