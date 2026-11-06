"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LineIcon } from "@/components/ui/icons";
import { QuestionsCard } from "@/components/assistant/questions-card";
import { loadTrip, saveTrip, type TripAnswers } from "@/components/assistant/trip-storage";
import { ASSISTANT_NAME } from "@/lib/tours/assistant/name";
import type { TripContext } from "@/lib/tours/assistant/context";
import { toManilaDateKey } from "@/lib/tours/events-calendar";

export const TRY_ASKING = [
  { prompt: "A slow 3-day Bagasbas weekend", note: "Surf, sunset and local food", photo: "/photos/bagasbas-beach.jpg", alt: "Bagasbas Beach" },
  { prompt: "Budget for 2 days in Calaguas?", note: "Boat, camping and food", photo: "/photos/calaguas-beach.jpg", alt: "White sand beach on Calaguas Island" },
  { prompt: "What to do in Daet when it rains?", note: "Heritage stops and cafes", photo: "/photos/daet-church.jpg", alt: "Daet town church" },
  { prompt: "Paano pumunta sa Apuao from Manila?", note: "Bus, van and boat times", photo: "/photos/apuao-sandbar.jpg", alt: "Sandbar at Apuao Island" },
] as const;

const shortDate = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const chip = "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-500 bg-surface px-[18px] text-sm font-bold text-daet-ink hover:bg-muted";

/**
 * The planner's start view (Main board): one big message box, the trip
 * details under it, and example trips. Sending starts the chat and plan view.
 */
export function PlanStart({ signedIn, initialText = "", onSend }: { signedIn: boolean; initialText?: string; onSend: (text: string) => void }) {
  const [text, setText] = useState(initialText.slice(0, 500));
  const [trip, setTrip] = useState<TripAnswers>({});
  const [editing, setEditing] = useState(false);
  useEffect(() => setTrip(loadTrip()), []);

  const send = (value: string) => {
    const message = value.trim();
    if (message) onSend(message.slice(0, 1000));
  };
  const group = trip.travelers ? trip.travelers.adults + trip.travelers.children.length : 0;
  const datesLabel = trip.dates ? (trip.dates.start === trip.dates.end ? shortDate(trip.dates.start) : `${shortDate(trip.dates.start)} to ${shortDate(trip.dates.end)}`) : "Dates";
  const groupLabel = group ? `${group} traveler${group === 1 ? "" : "s"}` : "Travelers";

  return (
    <div className="mx-auto flex w-full max-w-[75rem] flex-col items-center px-4 pb-6 pt-8 sm:px-8 sm:pt-11">
      <h1 className="text-center font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight text-daet-ink sm:text-[3.5rem] sm:leading-[3.75rem]">Where to in Daet?</h1>
      <p className="mt-3 max-w-[40rem] text-balance text-center text-lg leading-7 text-slate-600 dark:text-slate-400">
        Tell me your dates, who is coming and what you like. I will draft a plan with local operators you can book.
      </p>

      <form
        className="mt-7 flex min-h-28 w-full max-w-[47.5rem] items-end gap-4 rounded-2xl border-2 border-blue-600 bg-surface py-4 pl-5 pr-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="plan-start-input" className="sr-only">
          Ask the {ASSISTANT_NAME}
        </label>
        <textarea
          id="plan-start-input"
          rows={3}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Plan 3 days in Daet for two. We like beaches and a bit of history."
          className="block w-full flex-1 resize-none bg-transparent text-lg leading-7 text-daet-ink placeholder:text-slate-500 focus:outline-none"
        />
        <button type="submit" aria-label="Send" disabled={!text.trim()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </form>

      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <button type="button" aria-expanded={editing} onClick={() => setEditing((v) => !v)} className={chip}>
          <LineIcon name="calendar" className="h-[18px] w-[18px]" /> {datesLabel}
        </button>
        <button type="button" aria-expanded={editing} onClick={() => setEditing((v) => !v)} className={chip}>
          <LineIcon name="user" className="h-[18px] w-[18px]" /> {groupLabel}
        </button>
        <Link href={signedIn ? "/tours/my-itineraries" : "/login?next=/tours/my-itineraries"} className={chip}>
          <LineIcon name="clock" className="h-[18px] w-[18px]" /> Recents
        </Link>
      </div>
      {editing ? (
        <div className="mt-4 w-full max-w-[47.5rem]">
          <QuestionsCard
            prefill={trip as TripContext}
            title="Your trip"
            submitLabel="Use these details"
            today={toManilaDateKey(new Date())}
            onSubmit={(answers) => {
              setTrip(answers);
              saveTrip(answers);
              setEditing(false);
            }}
          />
        </div>
      ) : null}

      <section aria-labelledby="try-asking" className="mt-10 w-full">
        <h2 id="try-asking" className="font-[family-name:var(--font-display)] text-[1.75rem] font-semibold leading-8 text-daet-ink">
          Try asking
        </h2>
        <ul className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRY_ASKING.map((t, i) => (
            <li key={t.prompt}>
              <button type="button" onClick={() => send(t.prompt)} className="block w-full overflow-hidden rounded-2xl bg-surface text-left text-daet-ink hover:bg-muted">
                <Image src={t.photo} alt={t.alt} width={600} height={300} loading={i < 2 ? "eager" : "lazy"} className="h-[150px] w-full object-cover" />
                <span className="block px-4 pb-4 pt-3">
                  <span className="block font-bold">{t.prompt}</span>
                  <span className="block text-sm text-slate-600 dark:text-slate-400">{t.note}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-center text-sm text-slate-600 dark:text-slate-400">Daet AI assistant uses AI and can make mistakes. Every operator is verified by the Daet Tourism Office.</p>
    </div>
  );
}
