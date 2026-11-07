"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Field, Select } from "@/components/ui/field";

export type EditorSection = {
  /** The DOM id, also the anchor target. */
  id: string;
  /** What the operator calls it: "Prices", "What's included", ... */
  label: string;
  /** Has unsaved changes. */
  dirty?: boolean;
  /** Has problems that stop saving. */
  hasError?: boolean;
};

/** The offset a sticky header and the phone's own section picker take up. */
const SCROLL_OFFSET = 96;

/**
 * Section navigation for a long editor.
 *
 * A sidebar on a wide screen and a "Jump to section" dropdown on a phone: six
 * sections are too many for tabs at 375px. Both are anchor links, so they work
 * without JavaScript; the script only adds the active mark as the page scrolls
 * and the smooth scroll where motion is welcome.
 *
 * The active mark comes from an IntersectionObserver rather than a scroll
 * listener, so it costs nothing while the person reads. The observer watches a
 * band near the top of the screen: whichever section crosses it, both up and
 * down, is the one being read.
 */
export function useActiveSection(sections: EditorSection[]) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const ids = sections.map((section) => section.id).join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = ids
      .split("|")
      .map((id) => (id ? document.getElementById(id) : null))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    // A one-pixel line 96px below the top of the screen: a section becomes
    // active when its top edge passes it, going either way.
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: `-${SCROLL_OFFSET}px 0px -55% 0px`, threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

/** Reduced motion is a hard stop, not a hint: ask once, fall back to a jump. */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function SectionNav({
  sections,
  compact = false,
}: {
  sections: EditorSection[];
  /** The phone version: a labelled dropdown instead of the sidebar. */
  compact?: boolean;
}) {
  const active = useActiveSection(sections);

  const go = (event: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return; // Let the browser handle a missing section.
    event.preventDefault();
    // Keep the address bar honest without adding a history entry per tap.
    window.history.replaceState(null, "", `#${id}`);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  };

  if (compact) {
    return (
      <div className="sticky top-[var(--header-h)] z-30 -mx-4 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur-md print:hidden">
        <Field id="editor-section-jump" label="Jump to section">
          <Select
            value={active}
            onChange={(event) => {
              const id = event.target.value;
              const target = document.getElementById(id);
              if (!target) return;
              window.history.replaceState(null, "", `#${id}`);
              target.focus({ preventScroll: true });
              target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
            }}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
                {section.hasError ? " — needs attention" : section.dirty ? " — unsaved" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    );
  }

  return (
    <nav aria-label="Sections of this package" className="print:hidden">
      <p className="mb-2 text-sm font-bold text-daet-ink">Sections</p>
      <ul className="space-y-1">
        {sections.map((section) => {
          const current = section.id === active;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={current ? "true" : undefined}
                onClick={(event) => go(event, section.id)}
                className={`flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors duration-150 ${
                  current
                    ? "bg-blue-50 font-bold text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
                    : "text-daet-ink/80 hover:bg-muted"
                }`}
              >
                <span className="flex-1">{section.label}</span>
                {/* The dot is for the eye; the words are for the ear, so the
                    link is announced as "Prices (needs attention)". */}
                {section.hasError ? (
                  <>
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-red-600 dark:bg-red-400" />
                    <span className="sr-only">(needs attention)</span>
                  </>
                ) : section.dirty ? (
                  <>
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-blue-600 dark:bg-blue-300" />
                    <span className="sr-only">(unsaved changes)</span>
                  </>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
