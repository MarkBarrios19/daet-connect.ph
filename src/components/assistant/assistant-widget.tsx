"use client";

import { LineIcon } from "@/components/ui/icons";
import { useEffect, useRef, useState } from "react";
import { OPEN_ASSISTANT_EVENT, OVERLAY_EVENT, type OverlayDetail } from "@/lib/ui-overlay";
import { usePathname } from "next/navigation";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { DOCK_BUSY_EVENT, openInDock } from "@/components/chat-dock/dock-bus";

/** Pages where a floating chat button would get in the way. */
const HIDDEN = [/^\/login/, /^\/signup/, /^\/forgot-password/, /^\/tours\/help/, /^\/tours\/messages\/[^/]+$/, /^\/tours\/guide\/check-in/, /\/ticket$/];

/**
 * Floating "Ask the assistant" button on every page, opening the travel
 * assistant in a dialog (full screen on phones, a side panel from sm up).
 * The native <dialog> traps focus and closes on Escape.
 */
export function AssistantWidget({ signedIn, raised }: { signedIn: boolean; raised: boolean }) {
  // Phones with a tab bar reach the assistant from Messages, where it is pinned
  // first, so the floating button would only cover cards and buttons.
  const phoneHidden = signedIn && raised;
  const pathname = usePathname() ?? "";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // On phones, step aside while the notifications sheet or the phone menu is open.
  const [covered, setCovered] = useState<string[]>([]);
  useEffect(() => {
    const onOverlay = (event: Event) => {
      const { id, open: isOpen } = (event as CustomEvent<OverlayDetail>).detail;
      setCovered((list) => (isOpen ? [...new Set([...list, id])] : list.filter((x) => x !== id)));
    };
    window.addEventListener(OVERLAY_EVENT, onOverlay);
    return () => window.removeEventListener(OVERLAY_EVENT, onOverlay);
  }, []);
  // The home hero carries its own "Ask the travel guide" button, and the pill
  // used to sit right next to it in the corner. While the hero's heading is on
  // screen the pill steps aside, and comes back — reachable by keyboard — as
  // soon as the hero has scrolled away.
  const [heroInView, setHeroInView] = useState(false);
  useEffect(() => {
    const title = document.querySelector("#home-title");
    if (!title || typeof IntersectionObserver === "undefined") {
      setHeroInView(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => setHeroInView(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0 },
    );
    observer.observe(title);

    return () => observer.disconnect();
  }, [pathname]);

  // A chat window is open in the dock, in the same corner this pill sits in:
  // stand down rather than sit on top of it.
  const [dockBusy, setDockBusy] = useState(false);
  useEffect(() => {
    const onBusy = (event: Event) => setDockBusy(Boolean((event as CustomEvent<{ busy?: boolean }>).detail?.busy));
    window.addEventListener(DOCK_BUSY_EVENT, onBusy);
    return () => window.removeEventListener(DOCK_BUSY_EVENT, onBusy);
  }, []);

  // Pages raise this event instead of reaching into the dialog themselves.
  useEffect(() => {
    const onOpen = () => {
      if (signedIn && openInDock("ai")) return;
      dialogRef.current?.showModal();
      setOpen(true);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, [signedIn]);

  if (HIDDEN.some((pattern) => pattern.test(pathname))) return null;

  const close = () => dialogRef.current?.close();

  // When the pill shows at all: it steps aside for an open dock window, for the
  // home hero (which has its own "Ask the travel guide"), for a sheet covering
  // the phone, and for signed-in phones with a tab bar.
  const pill = dockBusy
    ? "hidden"
    : heroInView
      ? "hidden"
      : covered.length
        ? "hidden md:inline-flex"
        : phoneHidden
          ? "hidden sm:inline-flex"
          : "inline-flex";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Signed in on a wide screen: the assistant opens as a chat head in the dock.
          if (signedIn && openInDock("ai")) return;
          dialogRef.current?.showModal();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={`fixed right-4 z-40 ${pill} h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-3 text-sm font-bold text-white shadow-[var(--shadow-float)] transition hover:bg-blue-700 active:scale-95 sm:bottom-6 sm:right-6 sm:px-4 print:hidden ${raised ? "bottom-20" : "bottom-4"}`}
      >
        <LineIcon name="sparkle" className="h-6 w-6 sm:h-5 sm:w-5" />
        <span className="sr-only sm:not-sr-only">Daet AI assistant</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="assistant-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        className="m-0 h-dvh max-h-dvh w-full max-w-full bg-surface p-0 text-daet-ink backdrop:bg-slate-950/50 sm:ml-auto sm:h-dvh sm:w-[26rem] sm:max-w-[26rem] sm:rounded-l-3xl"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 bg-blue-600 px-4 py-3 text-white">
            <div>
              <h2 id="assistant-title" className="text-base font-bold">
                Daet AI assistant
              </h2>
              <p className="text-xs text-white">Your local guide, 24/7 · from CONNECT-Daet&apos;s listings</p>
            </div>
            <button type="button" onClick={close} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg hover:bg-white/10" aria-label="Close the assistant">
              ✕
            </button>
          </div>
          {open ? <AssistantChat signedIn={signedIn} onNavigate={close} autoFocus /> : null}
        </div>
      </dialog>
    </>
  );
}
