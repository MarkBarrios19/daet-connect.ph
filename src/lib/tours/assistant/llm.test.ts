import type { GeminiClient } from "@/lib/ai/gemini";
import { assistantTools, runAssistant } from "@/lib/tours/assistant/llm";
import type { ToolContext } from "@/lib/tours/assistant/tools";

jest.mock("server-only", () => ({}));

const ctx = { supabase: {}, userId: null, today: "2026-11-05", cards: [] } as unknown as ToolContext;
async function* chunks(...items: unknown[]) {
  for (const item of items) yield item;
}
const clientWith = (rounds: unknown[][]) => {
  const generateContentStream = jest.fn();
  for (const round of rounds) generateContentStream.mockResolvedValueOnce(chunks(...round));
  return { models: { generateContent: jest.fn(), generateContentStream } } as unknown as GeminiClient & { models: { generateContentStream: jest.Mock } };
};
const text = (t: string, finishReason?: string) => ({ candidates: [{ content: { parts: [{ text: t }] }, finishReason }] });

describe("assistantTools", () => {
  it("fills arguments the model left out with null before checking them", async () => {
    const tool = assistantTools(ctx).find((t) => t.name === "travel_time")!;
    // `to` is required: an empty call is rejected with an error result, not thrown.
    const result = JSON.parse(await tool.run({}));
    expect(result.error).toMatch(/not valid/);
  });
});

describe("runAssistant", () => {
  it("streams text and reports end_turn", async () => {
    const client = clientWith([[text("Hello "), text("there", "STOP")]]);
    const got: string[] = [];
    const result = await runAssistant(ctx, [{ role: "user", content: "hi" }], (d) => got.push(d), client);
    expect(got.join("")).toBe("Hello there");
    expect(result.stopReason).toBe("end_turn");
    const call = client.models.generateContentStream.mock.calls[0][0];
    expect(call.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(call.config.tools[0].functionDeclarations.length).toBeGreaterThan(5);
  });

  it("runs a tool call and sends its result back", async () => {
    const call = { candidates: [{ content: { parts: [{ functionCall: { id: "1", name: "policy", args: { topic: "cancel" } }, thoughtSignature: "sig" }] }, finishReason: "STOP" }] };
    const client = clientWith([[call], [text("Done.", "STOP")]]);
    const got: string[] = [];
    await runAssistant(ctx, [{ role: "user", content: "refund?" }], (d) => got.push(d), client);
    expect(got.join("")).toBe("Done.");
    const second = client.models.generateContentStream.mock.calls[1][0];
    expect(second.contents).toHaveLength(3);
    expect(second.contents[1].parts[0].thoughtSignature).toBe("sig");
    expect(second.contents[2].parts[0].functionResponse.name).toBe("policy");
  });

  it("stops on a refusal and does not run a cut-off tool call", async () => {
    const blocked = await runAssistant(ctx, [{ role: "user", content: "x" }], () => {}, clientWith([[{ promptFeedback: { blockReason: "SAFETY" } }]]));
    expect(blocked.stopReason).toBe("refusal");
    const cut = { candidates: [{ content: { parts: [{ functionCall: { name: "policy", args: {} } }] }, finishReason: "MAX_TOKENS" }] };
    const client = clientWith([[cut]]);
    const result = await runAssistant(ctx, [{ role: "user", content: "x" }], () => {}, client);
    expect(result.stopReason).toBe("max_tokens");
    expect(client.models.generateContentStream).toHaveBeenCalledTimes(1);
  });
});
