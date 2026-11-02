import Link from "next/link";
import { LineIcon } from "@/components/ui/icons";
import { formatEventRange } from "@/lib/tours/events-calendar";
import { EVENT_CATEGORIES, type TourEvent } from "@/lib/tours/promo-validation";

/** Category colours from the team palette; chips use dark text on the light fills. */
export const EVENT_CATEGORY_STYLES: Record<TourEvent["category"], { dot: string; chip: string }> = {
  festival: { dot: "bg-red-600", chip: "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300" },
  cultural: { dot: "bg-blue-600", chip: "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300" },
  sports: { dot: "bg-green-500", chip: "bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-300" },
  religious: { dot: "bg-yellow-500", chip: "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-900 dark:text-yellow-200" },
  market: { dot: "bg-slate-600", chip: "bg-muted text-slate-800 dark:text-slate-100" },
  other: { dot: "bg-slate-400", chip: "bg-muted text-slate-800 dark:text-slate-100" },
};

const manila = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...opts });

/** An event as a dated row: the day set large, then what, when and where. */
export function EventCard({ event, compact = false }: { event: TourEvent; compact?: boolean }) {
  const style = EVENT_CATEGORY_STYLES[event.category];
  return (
    <Link
      href={`/tours/events/${event.id}`}
      className="group flex items-center gap-4 rounded-2xl card-edge bg-surface p-3 transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-[0.99] sm:gap-5 sm:p-4"
    >
      <div className={`grid shrink-0 place-content-center rounded-2xl bg-blue-600 text-center text-white ${compact ? "h-16 w-16" : "h-20 w-20"}`}>
        <span className="text-sm font-semibold leading-none">{manila(event.starts_at, { month: "short" })}</span>
        <span className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-none">{manila(event.starts_at, { day: "numeric" })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-lg font-bold leading-snug text-daet-ink group-hover:text-blue-700 dark:group-hover:text-blue-300">{event.title}</p>
        <p className="mt-0.5 text-sm text-daet-ink/80">{formatEventRange(event.starts_at, event.ends_at)}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-daet-ink/80">
          <span className="inline-flex min-w-0 items-center gap-1">
            <LineIcon name="pin" className="h-4 w-4" /> <span className="truncate">{event.venue}</span>
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.chip}`}>{EVENT_CATEGORIES[event.category]}</span>
        </p>
      </div>
    </Link>
  );
}
