"use client";

import type { ReactNode } from "react";
import { describeChangeCount } from "@/components/ui/unsaved-changes";

/**
 * The one save button for a long editor, within reach wherever the person has
 * scrolled to.
 *
 * It is fixed to the foot of the viewport. While there is nothing to save it is
 * not drawn at all, so a clean page is never covered by a bar with nothing to
 * do — unless the page *pins* it, which the draft editor does so that "Submit
 * for review" stays reachable once the draft is saved.
 *
 * On a phone it sits on top of the role tab bar (`--tab-bar-h`, set by
 * page-frame.tsx) rather than over it; the editor adds the matching bottom
 * padding so the last field can still be scrolled clear.
 *
 * The live region repeats the count, so a screen reader hears "3 unsaved
 * changes" when a third one appears and hears a save's result beside it.
 */
export function StickySaveBar({
  changes,
  onSave,
  onDiscard,
  saving = false,
  error = null,
  status = "",
  primaryLabel = "Save",
  secondary,
  pinned = false,
}: {
  /** How many changes are unsaved. Zero hides the bar unless `pinned`. */
  changes: number;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
  error?: ReactNode;
  /** One line saying what saving will do, e.g. that it sends for review. */
  status?: ReactNode;
  primaryLabel?: string;
  /** An extra button, e.g. "Submit for review" on a saved draft. */
  secondary?: ReactNode;
  /** Draw the bar even with nothing to save, with the reason in `secondary`. */
  pinned?: boolean;
}) {
  const dirty = changes > 0;
  // Nothing to save, nothing being saved and nothing to pin: the bar is not
  // drawn at all, so a clean page is never covered.
  if (!dirty && !saving && !pinned) return null;

  return (
    <div
      data-testid="sticky-save-bar"
      className="fixed inset-x-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md print:hidden"
      style={{ bottom: "var(--tab-bar-h, 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p role="status" aria-live="polite" className="text-sm font-bold text-daet-ink">
            {saving ? "Saving…" : dirty ? describeChangeCount(changes) : "All changes saved."}
          </p>
          {status && !saving && dirty ? <p className="mt-0.5 text-sm text-daet-ink/80">{status}</p> : null}
          {error ? (
            <p role="alert" className="mt-0.5 text-sm font-semibold text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {dirty || saving ? (
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold text-daet-ink ring-1 ring-inset ring-daet-ink/20 transition-colors duration-150 hover:bg-muted disabled:opacity-60"
            >
              Discard
            </button>
          ) : null}
          {secondary}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            aria-busy={saving || undefined}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-bold text-white transition-[background-color,scale] duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
                />
                Saving…
              </>
            ) : (
              primaryLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
