/** @jest-environment node */
import { z } from "zod/v4";
import { ABILITIES, abilityPromptLines, basicAbilityReply } from "@/lib/tours/assistant/abilities";
import { assistantSystemPrompt } from "@/lib/tours/assistant/prompt";

const PHRASES: Record<string, string[]> = {
  emergency_numbers: ["emergency at mercedes", "may nalunod"],
  tour_today: ["is my tour still on today"],
  open_near_me: ["what s open near me"],
};

describe("abilities", () => {
  it("lists emergency first so nothing shadows it", () => {
    expect(ABILITIES[0].name).toBe("emergency_numbers");
    expect(ABILITIES.map((a) => a.name)).toEqual(Object.keys(PHRASES));
  });

  it("each ability has a schema the AI tool and basic mode both accept", () => {
    for (const a of ABILITIES) {
      for (const phrase of PHRASES[a.name]) {
        expect(a.matches(phrase)).toBe(true);
        expect(a.input.safeParse(a.basicInput(phrase)).success).toBe(true);
      }
      expect(z.toJSONSchema(a.input)).toBeTruthy();
    }
  });

  it("emergency wins when a phrase matches more than one ability", () => {
    expect(ABILITIES.filter((a) => a.matches("emergency is my tour on today")).map((a) => a.name)[0]).toBe("emergency_numbers");
  });

  it("basic mode and the AI tool give the same answer", async () => {
    const calls: string[] = [];
    const ctx = { today: "2026-11-06", userId: null, here: null, supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }), limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }, cards: [], onStatus: () => calls.push("s") } as never;
    const tour = ABILITIES.find((a) => a.name === "open_near_me")!;
    const viaTool = await tour.run(ctx, tour.input.parse({}));
    expect(await basicAbilityReply("what s open near me", "what s open near me", ctx)).toBe(viaTool.answer);
  });

  it("returns null when nothing matches, and the prompt names every tool", async () => {
    expect(await basicAbilityReply("hello", "hello", {} as never)).toBeNull();
    const prompt = assistantSystemPrompt({ today: "2026-11-06", signedIn: false });
    for (const a of ABILITIES) expect(prompt).toContain(a.name);
    expect(abilityPromptLines()).toContain("911");
  });
});
