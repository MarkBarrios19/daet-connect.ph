"use client";

import { useEffect, useState } from "react";
import { approxLabel, visitorCurrency } from "@/lib/currency/approx";

let ratesPromise: Promise<Record<string, number> | null> | null = null;
function loadRates() {
  if (typeof fetch !== "function") return Promise.resolve(null);
  ratesPromise ??= fetch("/api/rates")
    .then((r) => (r.ok ? r.json() : { rates: null }))
    .then((body: { rates: Record<string, number> | null }) => body.rates)
    .catch(() => null);
  return ratesPromise;
}

/** "≈ US$16 approx." next to a peso price, for visitors outside the Philippines (decision 24). */
export function ApproxPrice({ pesos, className = "" }: { pesos: number; className?: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const currency = visitorCurrency(navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (!currency || !(pesos > 0)) return;
    let live = true;
    void loadRates().then((rates) => {
      const rate = rates?.[currency];
      if (live && rate) setLabel(approxLabel(pesos, rate, currency, navigator.language));
    });
    return () => {
      live = false;
    };
  }, [pesos]);
  return label ? <span className={`block text-sm text-slate-600 dark:text-slate-400 ${className}`}>{label}</span> : null;
}
