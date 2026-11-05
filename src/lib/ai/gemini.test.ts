import { z } from "zod/v4";
import { generateJson, isBusyError, stopReasonOf, toJsonSchema, withBusyFallback, type GeminiClient } from "@/lib/ai/gemini";

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

describe("withBusyFallback", () => {
  const busy = Object.assign(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'), { status: 503 });

  it("tries the main model again, then the fallback model, when Google is busy", async () => {
    const call = jest.fn().mockRejectedValueOnce(busy).mockRejectedValueOnce(busy).mockResolvedValue("ok");
    await expect(withBusyFallback("gemini-flash-latest", call, { waitMs: 0 })).resolves.toBe("ok");
    expect(call.mock.calls.map((c) => c[0])).toEqual(["gemini-flash-latest", "gemini-flash-latest", "gemini-flash-lite-latest"]);
  });

  it("throws other errors at once, and the last busy error when every model is busy", async () => {
    const bad = Object.assign(new Error("API key not valid"), { status: 400 });
    const once = jest.fn().mockRejectedValue(bad);
    await expect(withBusyFallback("m", once, { waitMs: 0 })).rejects.toBe(bad);
    expect(once).toHaveBeenCalledTimes(1);
    const always = jest.fn().mockRejectedValue(busy);
    await expect(withBusyFallback("m", always, { waitMs: 0 })).rejects.toBe(busy);
    expect(always).toHaveBeenCalledTimes(3);
  });

  it("knows a busy error from its status or its message", () => {
    expect(isBusyError(busy)).toBe(true);
    expect(isBusyError({ status: 429 })).toBe(true);
    expect(isBusyError(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isBusyError(new Error("Invalid argument"))).toBe(false);
  });
});
