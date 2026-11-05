import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Full AI answers a day (Manila day) before the assistant answers in basic
 * mode: decisions 5, 18 and 37 in docs/TRIP_PLANNER.md. Every message counts,
 * a tapped suggestion too.
 */
export const DAILY_AI_MESSAGES = { guest: 3, member: 20 } as const;

/** The cookie holding a random id for a visitor who is not signed in. */
export const DEVICE_COOKIE = "daet_aid";
const DEVICE_ID = /^[a-f0-9-]{36}$/;

export const validDeviceId = (value: string | undefined | null): value is string => Boolean(value && DEVICE_ID.test(value));

/** Who is counted: the account when signed in, else the device. */
export const usageCaller = (userId: string | null, deviceId: string) => (userId ? `u:${userId}` : `d:${deviceId}`);

/**
 * Counts this message and returns the day's total, or null when it can't be
 * counted (no admin key, table not created yet, network). A null lets the
 * message through: a counting fault must not silence the assistant, and the
 * short burst limit in limits.ts still applies.
 */
export async function countAiMessage(admin: Pick<SupabaseClient, "rpc"> | null, caller: string, day: string): Promise<number | null> {
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc("tours_ai_count_message", { p_caller: caller, p_day: day });
    if (error) throw error;
    return typeof data === "number" ? data : null;
  } catch (error) {
    console.error("AI usage count error:", error instanceof Error ? error.message : error);
    return null;
  }
}

export type DailyDecision = {
  /** Within the day's allowance (or not counted). */
  withinDay: boolean;
  /** Show the "Sign in to keep getting full answers" card after this answer. */
  askSignIn: boolean;
};

export function dailyDecision(signedIn: boolean, count: number | null): DailyDecision {
  if (count === null) return { withinDay: true, askSignIn: false };
  const limit = signedIn ? DAILY_AI_MESSAGES.member : DAILY_AI_MESSAGES.guest;
  return { withinDay: count <= limit, askSignIn: !signedIn && count >= DAILY_AI_MESSAGES.guest };
}
