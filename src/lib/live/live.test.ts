import { canPlay, SOUND_GAP_MS } from "./sound";
import { MAX_BACKOFF_MS, nextDelay, pollInterval, POLL_LIVE_MS, POLL_OFFLINE_MS } from "./schedule";
import { mergeNotifications, newNotifications, planToast } from "./summary";
import { safeNotificationLink, type NotificationRow } from "@/lib/tours/notifications";

const row = (id: string, over: Partial<NotificationRow> = {}): NotificationRow => ({ id, type: "booking_created", title: `T${id}`, body: null, link: "/tours/notifications", read_at: null, created_at: `2026-11-06T00:00:0${id}Z`, ...over });

describe("polling cadence", () => {
  it("polls slowly with Realtime and faster without", () => {
    expect(pollInterval(true)).toBe(POLL_LIVE_MS);
    expect(pollInterval(false)).toBe(POLL_OFFLINE_MS);
  });
  it("backs off after failures, capped", () => {
    expect(nextDelay(10_000, 0)).toBe(10_000);
    expect(nextDelay(10_000, 1)).toBe(20_000);
    expect(nextDelay(10_000, 3)).toBe(80_000);
    expect(nextDelay(10_000, 9)).toBe(MAX_BACKOFF_MS);
  });
});

describe("merging and dedupe", () => {
  it("shows an item once when it arrives twice", () => {
    expect(mergeNotifications([row("1")], [row("1"), row("2")]).map((r) => r.id)).toEqual(["2", "1"]);
  });
  it("caps the list and keeps newest first", () => {
    const many = Array.from({ length: 20 }, (_, i) => row(String(i % 10), { id: `n${i}`, created_at: `2026-11-06T00:00:${String(i).padStart(2, "0")}Z` }));
    const merged = mergeNotifications([], many, 15);
    expect(merged).toHaveLength(15);
    expect(merged[0].id).toBe("n19");
  });
  it("finds only unseen, unread arrivals", () => {
    expect(newNotifications(new Set(["1"]), [row("1"), row("2"), row("3", { read_at: "x" })]).map((r) => r.id)).toEqual(["2"]);
  });
});

describe("toast plan", () => {
  it("names a single arrival", () => {
    expect(planToast([row("1", { title: "New booking request", link: "/tours/operator/bookings" })], false, "/", safeNotificationLink)).toEqual({ text: "New booking request", href: "/tours/operator/bookings", ids: ["1"] });
  });
  it("groups several arrivals from one poll", () => {
    expect(planToast([row("1"), row("2"), row("3")], false, "/", safeNotificationLink)?.text).toBe("3 new notifications");
  });
  it("skips items that point at the open page", () => {
    expect(planToast([row("1", { link: "/tours/messages/abc" })], false, "/tours/messages/abc", safeNotificationLink)).toBeNull();
  });
  it("toasts a new message only away from the messages area", () => {
    expect(planToast([], true, "/tours/operator/bookings", safeNotificationLink)?.text).toBe("New message");
    expect(planToast([], true, "/tours/messages/abc", safeNotificationLink)).toBeNull();
  });
  it("says nothing when nothing is new", () => {
    expect(planToast([], false, "/", safeNotificationLink)).toBeNull();
  });
});

describe("alert sound", () => {
  it("plays at most once per gap and never when muted", () => {
    expect(canPlay(10_000, 0, false)).toBe(true);
    expect(canPlay(10_000 + SOUND_GAP_MS - 1, 10_000, false)).toBe(false);
    expect(canPlay(10_000 + SOUND_GAP_MS, 10_000, false)).toBe(true);
    expect(canPlay(10_000, 0, true)).toBe(false);
  });
});
