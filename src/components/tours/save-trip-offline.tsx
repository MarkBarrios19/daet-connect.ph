"use client";

import { useEffect, useState } from "react";

/**
 * Keeps this saved trip and its tickets on the phone for the trip days, so
 * the plan, meeting points and QR codes open without signal. Only for the
 * signed-in owner (this page needs sign-in); signing out deletes them.
 */
export function SaveTripOffline({ ticketPaths }: { ticketPaths: string[] }) {
  const [saved, setSaved] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("caches" in window) || !navigator.onLine) return;
    let cancelled = false;
    const paths = [window.location.pathname, ...ticketPaths];
    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const ready = await navigator.serviceWorker.ready;
        (ready.active ?? registration.active)?.postMessage({ type: "save-trip", paths });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const hits = await Promise.all(paths.map((p) => caches.match(p, { cacheName: "daet-tickets-v1" })));
        if (!cancelled && hits[0]) setSaved(hits.slice(1).filter(Boolean).length);
      } catch {
        // Saving offline is a convenience; the trip still works online.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketPaths]);

  if (offline) {
    return (
      <p role="status" className="mt-3 inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-slate-900 dark:bg-yellow-900/40 dark:text-yellow-100">
        Offline · showing the copy saved on this phone
      </p>
    );
  }
  return saved !== null ? (
    <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-400 print:hidden">
      Saved on this phone{saved ? ` with ${saved} ticket${saved === 1 ? "" : "s"}` : ""}, so it opens without signal on your trip. Signing out removes it.
    </p>
  ) : null;
}
