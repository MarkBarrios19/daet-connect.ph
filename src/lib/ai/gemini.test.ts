import { z } from "zod/v4";
import { generateJson, geminiKeys, isBusyError, isKeyError, resetKeyRotation, stopReasonOf, toJsonSchema, withBusyFallback, withKeyRotation, type GeminiClient } from "@/lib/ai/gemini";

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

describe("Gemini keys", () => {
  it("reads up to three keys, or a comma-separated list, without blanks or repeats", () => {
    expect(geminiKeys({ GEMINI_API_KEY: "a", GEMINI_API_KEY_2: " b ", GEMINI_API_KEY_3: "" })).toEqual(["a", "b"]);
    expect(geminiKeys({ GEMINI_API_KEYS: "a, b,c", GEMINI_API_KEY: "a" })).toEqual(["a", "b", "c"]);
    expect(geminiKeys({})).toEqual([]);
  });

  it("knows a key problem from a model or request problem", () => {
    expect(isKeyError({ status: 403 })).toBe(true);
    expect(isKeyError(new Error("API key not valid. Please pass a valid API key."))).toBe(true);
    expect(isKeyError({ status: 429 })).toBe(true);
    expect(isKeyError(Object.assign(new Error("high demand"), { status: 503 }))).toBe(false);
  });
});

describe("withKeyRotation", () => {
  const client = (name: string) => ({ name }) as unknown as GeminiClient;
  const keys = [client("k1"), client("k2"), client("k3")];
  const names = (fn: jest.Mock) => fn.mock.calls.map((c) => (c[0] as { name: string }).name);
  beforeEach(() => resetKeyRotation());

  it("moves to the next key when a key is rejected, and starts from the key that worked next time", async () => {
    const bad = Object.assign(new Error("API key not valid"), { status: 400 });
    const call = jest.fn().mockRejectedValueOnce(bad).mockResolvedValue("ok");
    await expect(withKeyRotation(keys, call)).resolves.toBe("ok");
    expect(names(call)).toEqual(["k1", "k2"]);
    call.mockClear();
    await withKeyRotation(keys, call);
    expect(names(call)).toEqual(["k2"]);
  });

  it("does not change keys for other errors, and throws the last key error when all keys fail", async () => {
    const busy = Object.assign(new Error("high demand"), { status: 503 });
    const other = jest.fn().mockRejectedValue(busy);
    await expect(withKeyRotation(keys, other)).rejects.toBe(busy);
    expect(other).toHaveBeenCalledTimes(1);
    const quota = Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
    const all = jest.fn().mockRejectedValue(quota);
    await expect(withKeyRotation(keys, all)).rejects.toBe(quota);
    expect(names(all)).toEqual(["k1", "k2", "k3"]);
  });
});
