"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncRoleClaim } from "@/app/role-sync/actions";

const CHECK_EVERY_MS = 5 * 60 * 1000;
const KEY = "role-claim-checked-at";

/**
 * The header's tabs come from the session token's role, which can lag a role
 * change. Once per few minutes per browser, quietly ask the server whether the
 * role still matches and, if not, refresh the session and redraw. Renders nothing.
 */
export function RoleClaimSync({ shownRole }: { shownRole: string }) {
  const router = useRouter();

  useEffect(() => {
    try {
      const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < CHECK_EVERY_MS) return;
      window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // No storage: check on every page load.
    }
    let cancelled = false;
    syncRoleClaim(shownRole)
      .then((r) => {
        if (r.refreshed && !cancelled) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [shownRole, router]);

  return null;
}
