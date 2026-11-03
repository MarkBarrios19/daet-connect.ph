import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { EventCard, EVENT_CATEGORY_STYLES } from "@/components/tours/event-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildMonthGrid,
  currentManilaMonth,
  formatDayHeading,
  formatMonthLabel,
  gridRangeUtc,
  groupEventsByDay,
  isDateKey,
  monthKey,
  parseMonthParam,
  shiftMonth,
  toManilaDateKey,
} from "@/lib/tours/events-calendar";
import { EVENT_CATEGORIES, EVENT_COLUMNS, isEventCategory, type TourEvent } from "@/lib/tours/promo-validation";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Events calendar",
  description: "Festivals, cultural shows, sports and markets happening in Daet, Camarines Norte.",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function calendarHref(params: { month: string; day?: string | null; category?: string | null }) {
  const query = new URLSearchParams({ month: params.month });
  if (params.day) query.set("day", params.day);
  if (params.category) query.set("category", params.category);
  return `/tours/events?${query.toString()}`;
}

export default async function EventsCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const now = new Date();
  const todayKey = toManilaDateKey(now);

  const month = parseMonthParam(params.month, now);
  const currentMonthKey = monthKey(month);
  const category = isEventCategory(params.category) ? params.category : null;
  const selectedDay =
    isDateKey(params.day) && params.day.startsWith(currentMonthKey) ? params.day : null;

  const grid = buildMonthGrid(month);
  const range = gridRangeUtc(grid);

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("tours_events")
    .select(EVENT_COLUMNS)
    .eq("is_published", true)
    .lt("starts_at", range.endIso)
    .gte("ends_at", range.startIso)
    .order("starts_at", { ascending: true })
    .limit(300);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;

  const events = (data ?? []) as TourEvent[];
  const byDay = groupEventsByDay(events);

  const monthEvents = events.filter((event) => {
    const startKey = toManilaDateKey(event.starts_at);
    const endKey = toManilaDateKey(event.ends_at);
    return startKey.slice(0, 7) <= currentMonthKey && endKey.slice(0, 7) >= currentMonthKey;
  });
  const listedEvents = selectedDay ? byDay.get(selectedDay) ?? [] : monthEvents;

  const prev = monthKey(shiftMonth(month, -1));
  const next = monthKey(shiftMonth(month, 1));
  const thisMonth = monthKey(currentManilaMonth(now));

  return (
    <PageFrame>
      <header className="mb-6">
        <h1 className="display-2 text-daet-ink">What&apos;s on Daet.</h1>
        <p className="mt-2 max-w-2xl text-lg text-daet-ink">
          Festivals, cultural shows, sports and weekend markets around Daet and Camarines Norte. Times are Philippine time.
        </p>
      </header>

      <nav aria-label="Filter by category" className="-mx-4 mb-6 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          <li>
            <Link
              href={calendarHref({ month: currentMonthKey, day: selectedDay })}
              aria-current={category === null ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${category === null ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`}
            >
              All
            </Link>
          </li>
          {Object.entries(EVENT_CATEGORIES).map(([value, label]) => (
            <li key={value}>
              <Link
                href={calendarHref({ month: currentMonthKey, day: selectedDay, category: value })}
                aria-current={category === value ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${category === value ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${EVENT_CATEGORY_STYLES[value as TourEvent["category"]].dot}`} aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error ? (
        <Notice variant="error" className="mb-6">Events could not be loaded right now. Please try again later.</Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="calendar-month" className="order-2 -mx-2 rounded-2xl card-edge bg-surface p-2 sm:mx-0 sm:p-5 lg:order-1">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link href={calendarHref({ month: prev, category })} aria-label="Previous month" className="grid h-11 w-11 place-items-center rounded-full bg-muted text-lg font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40">
              ‹
            </Link>
            <div className="text-center">
              <h2 id="calendar-month" className="text-xl font-semibold text-daet-ink sm:text-2xl">{formatMonthLabel(month)}</h2>
              {currentMonthKey !== thisMonth ? (
                <Link href={calendarHref({ month: thisMonth, day: todayKey, category })} className="inline-flex min-h-11 items-center text-sm font-bold text-blue-700 dark:text-blue-300 underline underline-offset-2">
                  Jump to today
                </Link>
              ) : null}
            </div>
            <Link href={calendarHref({ month: next, category })} aria-label="Next month" className="grid h-11 w-11 place-items-center rounded-full bg-muted text-lg font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40">
              ›
            </Link>
          </div>

          <div role="grid" aria-labelledby="calendar-month">
            <div role="row" className="grid grid-cols-7 text-center text-xs font-bold text-daet-ink/75">
              {WEEKDAYS.map((day) => (
                <div role="columnheader" key={day} className="py-2">
                  <abbr title={day} className="no-underline">{day.slice(0, 1)}<span className="hidden sm:inline">{day.slice(1)}</span></abbr>
                </div>
              ))}
            </div>
            {grid.map((week) => (
              <div role="row" key={week[0].dateKey} className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {week.map((cell) => {
                  const dayEvents = byDay.get(cell.dateKey) ?? [];
                  const isSelected = cell.dateKey === selectedDay;
                  const isToday = cell.dateKey === todayKey;
                  const label = `${formatDayHeading(cell.dateKey)}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}` : ""}`;
                  const cellClass = `flex min-h-12 flex-col items-center rounded-2xl p-1 text-sm transition sm:min-h-24 sm:items-stretch sm:p-1.5 ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : cell.inMonth
                        ? "bg-canvas text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        : "text-slate-500 dark:text-slate-400"
                  } ${isToday && !isSelected ? "ring-2 ring-yellow-500" : ""}`;

                  const content = (
                    <>
                      <span className={`text-sm font-bold ${isToday && !isSelected ? "text-blue-700 dark:text-blue-300" : ""}`}>{cell.day}</span>
                      {dayEvents.length > 0 ? (
                        <>
                          <span className="mt-1 flex gap-0.5 sm:hidden" aria-hidden="true">
                            {dayEvents.slice(0, 3).map((event) => (
                              <span key={event.id} className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-surface" : EVENT_CATEGORY_STYLES[event.category].dot}`} />
                            ))}
                          </span>
                          <span className="mt-1 hidden space-y-0.5 sm:block" aria-hidden="true">
                            {dayEvents.slice(0, 2).map((event) => (
                              <span key={event.id} className={`flex items-center gap-1 truncate rounded px-1 text-[11px] font-semibold leading-4 ${isSelected ? "bg-white/15" : "bg-surface"}`}>
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_CATEGORY_STYLES[event.category].dot}`} />
                                <span className="truncate">{event.title}</span>
                              </span>
                            ))}
                            {dayEvents.length > 2 ? (
                              <span className="block px-1 text-[11px] font-bold opacity-70">+{dayEvents.length - 2} more</span>
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </>
                  );

                  return (
                    <div role="gridcell" key={cell.dateKey} aria-selected={isSelected || undefined} className="py-0.5">
                      {cell.inMonth ? (
                        <Link
                          href={calendarHref({ month: currentMonthKey, day: isSelected ? null : cell.dateKey, category })}
                          scroll={false}
                          aria-label={label}
                          aria-current={isToday ? "date" : undefined}
                          className={cellClass}
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className={cellClass} aria-hidden="true">{content}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="event-list-heading" className="order-1 lg:order-2">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="event-list-heading" className="text-2xl font-semibold text-daet-ink">
              {selectedDay ? formatDayHeading(selectedDay) : `All events in ${formatMonthLabel(month)}`}
            </h2>
            {selectedDay ? (
              <Link href={calendarHref({ month: currentMonthKey, category })} scroll={false} className="inline-flex min-h-11 shrink-0 items-center font-bold text-blue-700 dark:text-blue-300 underline underline-offset-2">
                Show month
              </Link>
            ) : null}
          </div>

          {listedEvents.length > 0 ? (
            <ul className="space-y-3">
              {listedEvents.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<LineIcon name="calendar" />}
              title={selectedDay ? "No events on this day" : "No events this month yet"}
              description="Check another date, or find a trip in the meantime."
              action={<ButtonLink href="/tours/browse">Find a trip</ButtonLink>}
            />
          )}
        </section>
      </div>
    </PageFrame>
  );
}
