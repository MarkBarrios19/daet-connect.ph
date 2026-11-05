import { z } from "zod/v4";
import { generateJson, stopReasonOf, toJsonSchema, type GeminiClient } from "@/lib/ai/gemini";

jest.mock("server-only", () => ({}));

const fakeClient = (response: unknown): GeminiClient =>
  ({ models: { generateContent: jest.fn().mockResolvedValue(response), generateContentStream: jest.fn() } }) as unknown as GeminiClient;
const Schema = z.object({ days: z.number().int(), note: z.string().nullable() });
const run = (client: GeminiClient) => generateJson({ system: "s", content: "c", schema: Schema, maxOutputTokens: 100, model: "m", timeoutMs: 1000, label: "test", client });

describe("toJsonSchema", () => {
  it("describes nullable fields and drops the $schema key", () => {
    const schema = toJsonSchema(Schema);
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.type).toBe("object");
    expect(JSON.stringify(schema)).toContain('"null"');
  });
});

describe("stopReasonOf", () => {
  it("maps finish reasons to the route's words", () => {
    expect(stopReasonOf({ candidates: [{ finishReason: "STOP" }] })).toBe("end_turn");
    expect(stopReasonOf({ candidates: [{ finishReason: "MAX_TOKENS" }] })).toBe("max_tokens");
    expect(stopReasonOf({ candidates: [{ finishReason: "SAFETY" }] })).toBe("refusal");
    expect(stopReasonOf({ promptFeedback: { blockReason: "SAFETY" } })).toBe("refusal");
    expect(stopReasonOf({})).toBe("end_turn");
  });
});

describe("generateJson", () => {
  it("returns the validated object", async () => {
    const client = fakeClient({ candidates: [{ finishReason: "STOP" }], text: '{"days":3,"note":null}' });
    await expect(run(client)).resolves.toEqual({ days: 3, note: null });
    const call = (client.models.generateContent as jest.Mock).mock.calls[0][0];
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.systemInstruction).toBe("s");
  });
  it("returns null for invalid, cut-off, blocked or failing answers", async () => {
    await expect(run(fakeClient({ candidates: [{ finishReason: "STOP" }], text: '{"days":"x","note":null}' }))).resolves.toBeNull();
    await expect(run(fakeClient({ candidates: [{ finishReason: "MAX_TOKENS" }], text: '{"days":3,"note":null}' }))).resolves.toBeNull();
    await expect(run(fakeClient({ promptFeedback: { blockReason: "SAFETY" }, text: "" }))).resolves.toBeNull();
    await expect(run(fakeClient({ candidates: [{ finishReason: "STOP" }], text: "not json" }))).resolves.toBeNull();
  });
});
