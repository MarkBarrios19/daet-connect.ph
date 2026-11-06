/** Polling cadence: slow when Realtime is connected, faster when it is not, backing off on errors. */
export const POLL_LIVE_MS = 30_000;
export const POLL_OFFLINE_MS = 10_000;
export const CHAT_POLL_MS = 5_000;
export const MAX_BACKOFF_MS = 120_000;

export function pollInterval(realtimeConnected: boolean): number {
  return realtimeConnected ? POLL_LIVE_MS : POLL_OFFLINE_MS;
}

/** The wait before the next poll: the base interval doubled for each failure in a row, capped. */
export function nextDelay(baseMs: number, failures: number): number {
  if (failures <= 0) return baseMs;
  return Math.min(baseMs * 2 ** Math.min(failures, 10), MAX_BACKOFF_MS);
}
