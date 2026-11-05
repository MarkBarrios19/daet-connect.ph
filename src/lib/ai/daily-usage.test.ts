import { countAiMessage, DAILY_AI_MESSAGES, dailyDecision, usageCaller, validDeviceId } from "./daily-usage";
import { withSignInCard, type AssistantEvent } from "@/lib/tours/assistant/respond";

describe("daily AI allowance", () => {
  it("gives a visitor who is not signed in 3 full answers, with the sign-in card from the 3rd", () => {
    expect(DAILY_AI_MESSAGES.guest).toBe(3);
    expect(dailyDecision(false, 1)).toEqual({ withinDay: true, askSignIn: false });
    expect(dailyDecision(false, 2)).toEqual({ withinDay: true, askSignIn: false });
    expect(dailyDecision(false, 3)).toEqual({ withinDay: true, askSignIn: true });
    expect(dailyDecision(false, 4)).toEqual({ withinDay: false, askSignIn: true });
  });

  it("gives a signed-in visitor 20, with no card", () => {
    expect(dailyDecision(true, 20)).toEqual({ withinDay: true, askSignIn: false });
    expect(dailyDecision(true, 21)).toEqual({ withinDay: false, askSignIn: false });
  });

  it("lets the message through when it couldn't be counted", () => {
    expect(dailyDecision(false, null)).toEqual({ withinDay: true, askSignIn: false });
  });

  it("counts by account when signed in, else by device", () => {
    expect(usageCaller("abc", "dev")).toBe("u:abc");
    expect(usageCaller(null, "dev")).toBe("d:dev");
    expect(validDeviceId("5a7e0000-0000-4000-8000-0000000000a1")).toBe(true);
    expect(validDeviceId("x'; drop")).toBe(false);
    expect(validDeviceId(undefined)).toBe(false);
  });

  it("counts through the database function, and returns null on any fault", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 2, error: null });
    await expect(countAiMessage({ rpc } as never, "d:x", "2026-11-05")).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledWith("tours_ai_count_message", { p_caller: "d:x", p_day: "2026-11-05" });

    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(countAiMessage({ rpc: jest.fn().mockResolvedValue({ data: null, error: { message: "missing" } }) } as never, "d:x", "2026-11-05")).resolves.toBeNull();
    await expect(countAiMessage({ rpc: jest.fn().mockRejectedValue(new Error("offline")) } as never, "d:x", "2026-11-05")).resolves.toBeNull();
    await expect(countAiMessage(null, "d:x", "2026-11-05")).resolves.toBeNull();
    spy.mockRestore();
  });
});

describe("withSignInCard", () => {
  async function* turn(): AsyncGenerator<AssistantEvent> {
    yield { t: "mode", mode: "ai" };
    yield { t: "text", v: "Hi" };
    yield { t: "done" };
  }
  const all = async (events: AsyncGenerator<AssistantEvent>) => {
    const out: AssistantEvent[] = [];
    for await (const e of events) out.push(e);
    return out.map((e) => e.t);
  };

  it("adds the card just before the turn ends, only when asked", async () => {
    expect(await all(withSignInCard(turn(), true))).toEqual(["mode", "text", "signin", "done"]);
    expect(await all(withSignInCard(turn(), false))).toEqual(["mode", "text", "done"]);
  });
});
