/**
 * Durations for the server work behind a signed-in page: the auth check, the
 * role lookup, the profile select, notifications and each page's own queries.
 *
 * Only a name and a number of milliseconds are ever recorded: no ids, no
 * addresses, nothing about the person.
 *
 * Why logs and not a response header for the page work: a Server Component
 * cannot set response headers, and under Cache Components the response is
 * streamed, so the headers are already sent before the queries behind
 * <Suspense> have run. The proxy runs before the page, so it can report its
 * own duration as a real `Server-Timing` header (see `serverTimingHeader`);
 * everything that happens during the render is written to the function log as
 * one JSON line per measurement, which Vercel keeps next to the request.
 *
 * Off unless `SERVER_TIMING=1` is set, so production pays for nothing.
 */
export const serverTimingEnabled = () => process.env.SERVER_TIMING === "1";

const round = (ms: number) => Math.round(ms * 10) / 10;

/** Runs `work` and, when enabled, logs how long it took under `name`. Errors pass through untouched. */
export async function timed<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (!serverTimingEnabled()) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    console.info(JSON.stringify({ serverTiming: name, ms: round(performance.now() - start) }));
  }
}

/** `Server-Timing` header value for a list of finished measurements, in milliseconds. */
export function serverTimingHeader(entries: Array<{ name: string; ms: number }>): string {
  return entries.map(({ name, ms }) => `${name};dur=${round(ms)}`).join(", ");
}
