import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { RouteMap } from "@/components/maps/route-map";
import type { SavedDay } from "@/lib/tours/itinerary/form";
import { formatClock } from "@/lib/tours/itinerary/types";

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/** Read-only day-by-day view of a saved plan (owner and shared link). */
export function SavedItinerary({ days }: { days: SavedDay[] }) {
  if (days.length === 0) return <p className="rounded-2xl bg-daet-sand/40 p-4 text-sm text-daet-ink/70">This plan has no stops.</p>;
  return (
    <div className="space-y-6">
      {days.map((day) => {
        const points = day.items.filter((i) => i.kind === "visit" && i.lat !== null && i.lng !== null).map((i) => ({ lat: i.lat!, lng: i.lng!, label: i.name }));
        return (
          <section key={day.dayNumber} className="rounded-2xl card-edge bg-surface p-5">
            <h2 className="text-lg font-bold text-daet-ink">
              Day {day.dayNumber}
              {day.date ? ` · ${longDate(day.date)}` : ""}
            </h2>
            <ol className="mt-4 space-y-3">
              {day.items.map((item, i) => (
                <li key={i} className={`rounded-2xl border p-4 ${item.kind === "lunch" ? "border-daet-sun/40 bg-yellow-50/60 dark:bg-yellow-950/40" : "border-daet-ink/10"}`}>
                  {item.travelMinutes > 0 ? <p className="mb-1 text-sm text-slate-600 dark:text-slate-400">↓ about {item.travelMinutes} min travel</p> : null}
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold text-daet-ink">
                      {item.kind === "lunch" ? "" : ""}
                      {item.slug ? (
                        <Link href={`/tours/attractions/${item.slug}`} className="hover:underline">
                          {item.name}
                        </Link>
                      ) : (
                        item.name
                      )}
                    </p>
                    {item.start !== null && item.end !== null ? (
                      <p className="text-sm font-bold text-daet-forest dark:text-blue-300">
                        {formatClock(item.start)} – {formatClock(item.end)}
                      </p>
                    ) : null}
                  </div>
                  {item.tip ? <p className="mt-2 text-sm text-daet-ink/75"><LineIcon name="tip" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {item.tip}</p> : null}
                </li>
              ))}
            </ol>
            {points.length ? (
              <div className="mt-4">
                <RouteMap points={points} connect title={`Map of day ${day.dayNumber}`} />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
