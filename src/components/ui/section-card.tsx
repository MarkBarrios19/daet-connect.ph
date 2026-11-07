"use client";

import type { ReactNode } from "react";

/**
 * A section of a long editor: a heading, a one-line summary of what is in it,
 * and the fields that edit it in place.
 *
 * It is a labelled `<section>` with a focusable root, so the section navigation
 * can point at it and a failed save can put focus here. `scroll-mt` keeps a
 * sticky header and the phone's own section picker from covering the heading
 * when someone jumps here from the navigation.
 */
export function SectionCard({
  id,
  title,
  summary,
  dirty = false,
  error = null,
  action,
  children,
}: {
  /** The DOM id the section navigation links to. */
  id: string;
  title: ReactNode;
  /** One line of what is in this section, so it can be read without opening it. */
  summary?: ReactNode;
  dirty?: boolean;
  /** A summary of what is wrong, shown at the top of the section. */
  error?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-heading`}
      aria-invalid={error ? true : undefined}
      className="scroll-mt-[calc(var(--header-h)+4.5rem)] rounded-2xl card-edge bg-surface p-5 outline-none sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id={`${id}-heading`} className="text-xl font-bold text-daet-ink">
              {title}
            </h2>
            {dirty ? (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
                Unsaved
              </span>
            ) : null}
          </div>
          {summary ? <p className="mt-1 text-sm leading-6 text-daet-ink/75">{summary}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Take the person to a section: put focus on its first invalid field, or on the
 * first control, or on the section itself when it holds neither. Focus before
 * scrolling so a screen reader follows along and the address bar stays put.
 */
export function focusSection(id: string) {
  const section = document.getElementById(id);
  if (!section) return false;
  const target =
    section.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    section.querySelector<HTMLElement>("input, textarea, select, progress, [role='group'] button") ??
    section;
  target.focus({ preventScroll: true });
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  section.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  return true;
}
