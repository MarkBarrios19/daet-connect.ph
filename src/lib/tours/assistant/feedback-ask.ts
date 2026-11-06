import { toManilaDateKey } from "@/lib/tours/events-calendar";

/** "Was this helpful?" is asked at most once a day per device; this remembers the day it was last answered. */
export const FEEDBACK_ASKED_KEY = "connect-daet:feedback-asked";

type Store = Pick<Storage, "getItem" | "setItem">;

/** True when the question was already answered today (Philippine time). */
export function askedToday(store: Store | null, now: Date = new Date()): boolean {
  try {
    return store?.getItem(FEEDBACK_ASKED_KEY) === toManilaDateKey(now);
  } catch {
    return false;
  }
}

export function markAsked(store: Store | null, now: Date = new Date()) {
  try {
    store?.setItem(FEEDBACK_ASKED_KEY, toManilaDateKey(now));
  } catch {
    /* private mode: it just asks again next time */
  }
}
