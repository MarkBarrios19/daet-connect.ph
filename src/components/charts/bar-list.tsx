import type { ReactNode } from "react";

export type BarItem = { key: string; label: ReactNode; value: number; display?: string; note?: string };

/** Horizontal bars, one hue, value at the tip; every value is labelled so no tooltip is needed. */
export function BarList({ items, empty = "No data in this range." }: { items: BarItem[]; empty?: string }) {
  if (items.length === 0) return <p className="text-sm text-daet-ink/70">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    // min-w-0: even embedded straight into a grid/flex row, the list sizes to
    // its widest single-line label instead of stretching its container.
    <ul className="min-w-0 space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-daet-ink">{item.label}</span>
            <span className="shrink-0 font-bold text-daet-ink">
              {item.display ?? item.value}
              {item.note ? <span className="ml-1 font-normal text-daet-ink/70">{item.note}</span> : null}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-r bg-transparent" aria-hidden="true">
            <div className="h-2.5 rounded-r bg-daet-forest" style={{ width: `${item.value > 0 ? Math.max(1.5, (item.value / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
