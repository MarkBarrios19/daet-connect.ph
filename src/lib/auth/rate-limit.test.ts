import { AUTH_LIMITS, clearAttempts, takeAttempt, tooManyMessage } from "@/lib/auth/rate-limit";

const WINDOW = { limit: 3, windowMs: 60_000 };

describe("the auth rate limiter", () => {
  beforeEach(() => clearAttempts());

  it("allows the limit and then refuses, with a time to wait", () => {
    const now = 1_000_000;
    expect(takeAttempt("k", WINDOW, now).ok).toBe(true);
    expect(takeAttempt("k", WINDOW, now + 1).ok).toBe(true);
    expect(takeAttempt("k", WINDOW, now + 2).ok).toBe(true);

    const refused = takeAttempt("k", WINDOW, now + 3);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key on its own", () => {
    const now = 1_000_000;
    takeAttempt("ip:1", WINDOW, now);
    takeAttempt("ip:1", WINDOW, now);
    takeAttempt("ip:1", WINDOW, now);
    expect(takeAttempt("ip:1", WINDOW, now).ok).toBe(false);
    expect(takeAttempt("ip:2", WINDOW, now).ok).toBe(true);
  });

  it("slides: an old attempt stops counting once it leaves the window", () => {
    const now = 1_000_000;
    takeAttempt("k", WINDOW, now);
    takeAttempt("k", WINDOW, now + 1_000);
    takeAttempt("k", WINDOW, now + 2_000);
    expect(takeAttempt("k", WINDOW, now + 3_000).ok).toBe(false);
    // The first attempt is now older than the window, so one slot is free.
    expect(takeAttempt("k", WINDOW, now + 60_001).ok).toBe(true);
  });

  it("says how long in words a person can read", () => {
    expect(tooManyMessage(30)).toBe("Too many attempts. Please try again in 30 seconds.");
    expect(tooManyMessage(90)).toBe("Too many attempts. Please try again in about 2 minutes.");
    expect(tooManyMessage(120)).toBe("Too many attempts. Please try again in about 2 minutes.");
  });

  it("keeps the sign-in windows tight enough to matter and loose enough to type", () => {
    // An address may fail a few times before the wait; a whole address space
    // from one host is stopped sooner in total, not per account.
    expect(AUTH_LIMITS.signInEmail.limit).toBeLessThanOrEqual(10);
    expect(AUTH_LIMITS.signInEmail.windowMs).toBeGreaterThanOrEqual(60_000);
    expect(AUTH_LIMITS.resendEmail.limit).toBeLessThanOrEqual(5);
    expect(AUTH_LIMITS.signUpIp.limit).toBeLessThanOrEqual(10);
  });

  it("forgets everything on request", () => {
    takeAttempt("k", WINDOW, 1);
    takeAttempt("k", WINDOW, 1);
    takeAttempt("k", WINDOW, 1);
    expect(takeAttempt("k", WINDOW, 1).ok).toBe(false);
    clearAttempts("k");
    expect(takeAttempt("k", WINDOW, 1).ok).toBe(true);
  });
});
