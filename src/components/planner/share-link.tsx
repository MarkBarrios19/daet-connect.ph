"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type SetSharing = (id: string, shared: boolean) => Promise<{ token: string | null; error?: string }>;

/**
 * A view-only link to a saved trip. Phones get the system share sheet; other
 * browsers copy the link. Anyone with the link sees the plan and can book the
 * tours, but not who is coming, and can't change anything. Stopping sharing
 * makes the old link stop working.
 */
export function ShareLink({
  id,
  title,
  initialToken,
  baseUrl,
  setSharing,
}: {
  id: string;
  title: string;
  initialToken: string | null;
  /** Site address for the link; the page's own origin when left out. */
  baseUrl?: string;
  setSharing: SetSharing;
}) {
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const origin = baseUrl ?? (typeof window === "undefined" ? "" : window.location.origin);
  const link = token ? `${origin}/tours/itineraries/shared/${token}` : null;

  function toggle(shared: boolean) {
    setError(null);
    setNote(null);
    start(async () => {
      const result = await setSharing(id, shared).catch(() => ({ token: null, error: "Sharing could not be changed. Check your connection." }));
      if (result.error) setError(result.error);
      else {
        setToken(result.token);
        setNote(shared ? "Link ready. Anyone with it can view this plan." : "Sharing stopped. The old link no longer works.");
      }
    });
  }

  async function share() {
    if (!link) return;
    setNote(null);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: `My Daet trip plan: ${title}`, url: link });
        return;
      } catch (err) {
        // Closing the share sheet is not an error.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copied.");
    } catch {
      setNote("Select the link and copy it.");
    }
  }

  return (
    <div className="space-y-2">
      {link ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">Anyone with this link can view this plan and book its tours. They can&apos;t change it or see who is coming.</p>
          <input readOnly value={link} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="block min-h-11 w-full rounded-xl bg-muted px-3 text-sm text-daet-ink" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void share()}>Share link</Button>
            <Button variant="danger" onClick={() => toggle(false)} loading={pending} loadingText="Stopping…">
              Stop sharing
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={() => toggle(true)} loading={pending} loadingText="Creating link…">
          Share a view-only link
        </Button>
      )}
      <p role="status" aria-live="polite" className={note ? "text-sm font-semibold text-daet-ink" : "sr-only"}>
        {note ?? ""}
      </p>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
