"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/modal";

/**
 * Leaving a form with unsaved changes.
 *
 * Two doors lead away from an editor: the browser's own (reload, closing the
 * tab, a typed address) and the app's (a link to another page). The browser's
 * door is watched with `beforeunload`, which a page cannot bypass, so the
 * browser asks in its own words. The app's door is watched by a capture-phase
 * click listener, so every internal link is checked before Next.js acts on it,
 * and a ConfirmDialog asks in plain words — the browser's own prompt cannot be
 * styled or read reliably by a screen reader.
 */

/** "1 unsaved change" / "3 unsaved changes". Shared by the bar and the guard. */
export function describeChangeCount(count: number): string {
  return count === 1 ? "1 unsaved change" : `${count} unsaved changes`;
}

/** The browser's ask on reload or close. Modern browsers ignore the text. */
export function useBeforeUnloadGuard(when: boolean) {
  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers still need returnValue set to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [when]);
}

/**
 * Is this a link that would take the person somewhere else in the app? An
 * in-page anchor, another site, a download and a new tab all leave the editor
 * alone, so they are none of the guard's business.
 */
export function isInternalNavigation(anchor: HTMLAnchorElement): boolean {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#")) return false;
  let url: URL;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  // The same page, e.g. the section links in the editor's own navigation.
  return !(url.pathname === window.location.pathname && url.search === window.location.search);
}

export function UnsavedChangesGuard({
  when,
  changes,
  holding = false,
  title = "Leave without saving?",
  confirmLabel = "Leave page",
  cancelLabel = "Keep editing",
}: {
  /** Unsaved changes exist and the page can still be edited. */
  when: boolean;
  /** How many changes would be lost; shown in the question. */
  changes: number;
  /**
   * Something the page is already asking — another confirmation, say. Leaving
   * is not a question to stack on top of that one, so the guard stands down and
   * the link is held until the page's own question is answered.
   */
  holding?: boolean;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  const router = useRouter();
  const [href, setHref] = useState<string | null>(null);
  // The link that asked the question, so focus can go back to it on cancel.
  const opener = useRef<HTMLElement | null>(null);

  // A question the page already raised is answered first; the person still gets
  // their say before the link goes anywhere.
  useBeforeUnloadGuard(when && !holding);

  useEffect(() => {
    if (!when || holding) {
      setHref(null);
      return;
    }
    const onClick = (event: MouseEvent) => {
      // A modified click, a middle click or one already handled is not a plain
      // navigation: leave it to the browser and to whoever handled it.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || !isInternalNavigation(anchor)) return;

      // Capture phase, so this runs before Next.js sees the click.
      event.preventDefault();
      event.stopPropagation();
      opener.current = anchor;
      setHref(anchor.getAttribute("href"));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [when, holding]);

  const keepEditing = () => {
    setHref(null);
    opener.current?.focus?.();
  };

  return (
    <ConfirmDialog
      open={href !== null}
      title={title}
      description={`You have ${describeChangeCount(changes)}. If you leave this page they will be lost.`}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={() => {
        const to = href;
        setHref(null);
        if (to) router.push(to);
      }}
      onCancel={keepEditing}
    />
  );
}
