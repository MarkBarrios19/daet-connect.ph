import "server-only";
import { ApiError, GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { z } from "zod/v4";

/**
 * Gemini for the assistant and the trip planner. One place for the key, the
 * client, JSON schemas from our zod schemas, and structured output. The key
 * is read on the server only (GEMINI_API_KEY).
 */

/** An alias Google keeps pointed at the current Flash model; override with ASSISTANT_MODEL / ITINERARY_MODEL. */
export const GEMINI_DEFAULT_MODEL = "gemini-flash-latest";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** The two calls we use, so tests can pass a fake. */
export type GeminiClient = { models: Pick<GoogleGenAI["models"], "generateContent" | "generateContentStream"> };

export function createGeminiClient({ timeoutMs }: { timeoutMs: number }): GeminiClient {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: timeoutMs } });
}

/** JSON Schema for a zod schema, in the shape Gemini takes (no $schema key). */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

export function logGeminiError(label: string, error: unknown) {
  if (error instanceof ApiError) console.error(`${label}:`, error.status, error.message);
  else console.error(`${label}:`, error);
}

/** Why a response ended, in the words the assistant route already uses. */
export function stopReasonOf(response: { promptFeedback?: { blockReason?: string }; candidates?: Array<{ finishReason?: string }> }): "end_turn" | "max_tokens" | "refusal" {
  if (response.promptFeedback?.blockReason) return "refusal";
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === "MAX_TOKENS") return "max_tokens";
  if (!finish || finish === "STOP") return "end_turn";
  return "refusal"; // SAFETY, RECITATION, BLOCKLIST, and the like
}

/**
 * One structured answer: the model is asked for JSON matching `schema`, and the
 * result is checked against the same schema. null on a timeout, a block, a cut-off
 * or anything that doesn't validate, so the caller can use its rules instead.
 */
export async function generateJson<S extends z.ZodType>(input: {
  system: string;
  content: string;
  schema: S;
  maxOutputTokens: number;
  model: string;
  timeoutMs: number;
  label: string;
  client?: GeminiClient;
}): Promise<z.infer<S> | null> {
  try {
    const client = input.client ?? createGeminiClient({ timeoutMs: input.timeoutMs });
    const response: GenerateContentResponse = await client.models.generateContent({
      model: input.model,
      contents: [{ role: "user", parts: [{ text: input.content }] }],
      config: {
        systemInstruction: input.system,
        responseMimeType: "application/json",
        responseJsonSchema: toJsonSchema(input.schema),
        maxOutputTokens: input.maxOutputTokens,
      },
    });
    if (stopReasonOf(response) !== "end_turn") return null;
    const text = response.text;
    if (!text) return null;
    const parsed = input.schema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data as z.infer<S>) : null;
  } catch (error) {
    logGeminiError(input.label, error);
    return null;
  }
}
