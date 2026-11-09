"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";
import {
  BOARD_FILTER_LABELS,
  BOARD_STATUSES,
  boardUrl,
  type BoardCounts,
  type BoardFilter,
} from "@/lib/tours/booking-board";

const BASE = "/tours/operator/bookings";

/**
 * The filter card above the board: search, tour package, tour date, then the
 * status chips. All four are in the address, so the back button and a shared
 * link work; the chips are links, and the three fields submit together.
 */
export function BoardFilters({
  filters,
  counts,
  packages,
}: {
  filters: { status: BoardFilter; q: string; packageId: string; date: string };
  counts: BoardCounts;
  packages: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [packageId, setPackageId] = useState(filters.packageId);
  const [date, setDate] = useState(filters.date);
  const filtered = Boolean(filters.q || filters.packageId || filters.date);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    router.push(
      boardUrl(BASE, { status: filters.status }, { q: q.trim(), packageId, date, page: 1 }),
    );
  }

  function clear() {
    setQ("");
    setPackageId("");
    setDate("");
    router.push(boardUrl(BASE, { status: filters.status }, { q: "", packageId: "", date: "", page: 1 }));
  }

  return (
    <section aria-label="Filter bookings" className="relative mb-4 rounded-2xl card-edge bg-surface p-4 sm:p-5">
      <form role="search" onSubmit={submit} className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
        <Field id="board-q" label="Search bookings" className="min-w-0">
          <div className="relative">
            <LineIcon name="search" className="pointer-events-none absolute left-4 top-1/2 mt-0.5 h-5 w-5 -translate-y-1/2 text-daet-ink/50" />
            <Input
              id="board-q"
              name="q"
              type="search"
              value={q}
              maxLength={200}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Reference, package, name or phone…"
              className="pl-11"
            />
          </div>
          {/* An applied search can be dropped on its own, keeping the chip and the other fields. */}
          {filters.q ? (
            <a href={boardUrl(BASE, filters, { q: "", page: 1 })} className="mt-1 inline-block text-sm font-bold text-blue-700 underline dark:text-blue-300">
              Clear search
            </a>
          ) : null}
        </Field>
        <Field id="board-package" label="Tour package" className="min-w-0">
          <Select id="board-package" name="package" value={packageId} onChange={(event) => setPackageId(event.target.value)}>
            <option value="">All Tour Packages</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="board-date" label="Tour date" className="min-w-0">
          <Input id="board-date" name="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        {/* The chips and the fields share one form; Search is the way to apply the fields. */}
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Button type="submit" size="md">
            Search
          </Button>
          {filtered ? (
            <Button type="button" variant="ghost" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </form>

      <nav aria-label="Filter by status" className="mt-4 border-t border-hairline pt-4">
        <ul className="flex flex-wrap gap-2">
          {BOARD_STATUSES.map((value) => {
            const active = filters.status === value;
            const count = counts[value];
            return (
              <li key={value}>
                <a
                  href={boardUrl(BASE, { status: value }, { q: filters.q, packageId: filters.packageId, date: filters.date, page: 1 })}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-canvas text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  }`}
                >
                  {BOARD_FILTER_LABELS[value]}
                  <span
                    className={`rounded-full px-2 text-sm ${
                      active ? "bg-white/20 text-white" : value === "pending" && count > 0 ? "bg-yellow-500 text-slate-950" : "bg-muted-strong text-daet-ink"
                    }`}
                  >
                    {count}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}
