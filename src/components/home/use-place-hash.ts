"use client";

import { useCallback, useEffect, useState } from "react";

const PREFIX = "#place-";

/** `#place-bagasbas-beach` → `bagasbas-beach`; anything else → null. */
export function slugFromHash(hash: string): string | null {
  return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null;
}

/**
 * Keeps the open place and the URL hash in step.
 *
 * Opening pushes `#place-<slug>`, so the browser's Back button closes the
 * place instead of leaving the page. Closing from the page itself strips the
 * hash without adding another history entry, and a `popstate` (or a hand-
 * edited hash) re-reads the URL.
 */
export function usePlaceHash(slugs: string[]) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const readHash = useCallback(() => {
    if (typeof window === "undefined") return;
    const slug = slugFromHash(window.location.hash);
    setOpenSlug(slug && slugs.includes(slug) ? slug : null);
  }, [slugs]);

  useEffect(() => {
    readHash();
    window.addEventListener("popstate", readHash);
    window.addEventListener("hashchange", readHash);
    return () => {
      window.removeEventListener("popstate", readHash);
      window.removeEventListener("hashchange", readHash);
    };
  }, [readHash]);

  const open = useCallback((slug: string) => {
    setOpenSlug(slug);
    if (window.location.hash === `${PREFIX}${slug}`) return;
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${PREFIX}${slug}`);
  }, []);

  const close = useCallback(() => {
    setOpenSlug(null);
    if (slugFromHash(window.location.hash) === null) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  return { openSlug, open, close };
}
