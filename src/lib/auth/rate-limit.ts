/**
 * A small sliding-window rate limiter for the sign-in, sign-up, reset and
 * resend paths.
 *
 * Supabase Auth has its own per-address limits, but they are per account: they
 * do nothing about one visitor guessing one password across many accounts, or
 * about the sign-up form being used to send mail to strangers. This sits in
 * front of those calls.
 *
 * It counts in process memory, so it is only as shared as the deployment: on a
 * single Node server it is exact; on a serverless platform each instance keeps
 * its own window, which still stops a single client's burst. The store is
 * bounded so a flood of distinct keys cannot grow it without limit.
 */

export type RateLimit = { limit: number; windowMs: number };

export type RateLimitResult =
  { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

const buckets = new Map<string, number[]>();

/** Oldest entries are dropped first, so the map cannot outgrow this. */
const MAX_KEYS = 5000;

/** The windows, in one place, so a reviewer can see the whole posture at once. */
export const AUTH_LIMITS = {
  /** One address, any number of accounts: the guessing case. */
  signInIp: { limit: 20, windowMs: 10 * 60_000 },
  /** One account, any number of addresses: the targeted case. */
  signInEmail: { limit: 6, windowMs: 15 * 60_000 },
  signUpIp: { limit: 10, windowMs: 60 * 60_000 },
  /** Re-sends cost an email each, so they are the tightest. */
  resendIp: { limit: 10, windowMs: 60 * 60_000 },
  resendEmail: { limit: 3, windowMs: 15 * 60_000 },
  resetIp: { limit: 10, windowMs: 60 * 60_000 },
  resetEmail: { limit: 3, windowMs: 15 * 60_000 },
  oauthIp: { limit: 30, windowMs: 10 * 60_000 },
  /** Changing a password re-types the current one: the guessing case again. */
  changePasswordUser: { limit: 5, windowMs: 15 * 60_000 },
  changePasswordIp: { limit: 20, windowMs: 15 * 60_000 },
  /** Photo uploads: a disk-filling guard rather than a guessing one. */
  avatarUser: { limit: 20, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimit>;

/** Count one attempt against `key`, and say whether it is allowed. */
export function takeAttempt(
  key: string,
  { limit, windowMs }: RateLimit,
  now = Date.now(),
): RateLimitResult {
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((at) => at > cutoff);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((hits[0] + windowMs - now) / 1000),
    );
    return { ok: false, retryAfterSeconds };
  }

  hits.push(now);
  if (buckets.size >= MAX_KEYS && !buckets.has(key)) {
    // Drop the least recently touched key rather than growing without bound.
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
  buckets.set(key, hits);
  return { ok: true, remaining: limit - hits.length };
}

/** For tests, and for a deliberate "you may try again now" reset. */
export function clearAttempts(key?: string) {
  if (key === undefined) buckets.clear();
  else buckets.delete(key);
}

/** "You have tried this too many times. Try again in about 9 minutes." */
export function tooManyMessage(retryAfterSeconds: number): string {
  if (retryAfterSeconds <= 60) {
    return `Too many attempts. Please try again in ${Math.max(1, Math.ceil(retryAfterSeconds))} seconds.`;
  }
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
