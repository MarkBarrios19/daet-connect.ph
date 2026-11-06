import { headers } from "next/headers";
import { z } from "zod/v4";
import { aiCallerKey, allowAiCall } from "@/lib/ai/limits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** "Was this helpful?" on an assistant answer (decisions 26, 29). Recorded only. */
const FeedbackSchema = z.object({
  helpful: z.boolean(),
  mode: z.enum(["ai", "basic"]),
  question: z.string().max(2000).nullable().optional(),
  answer: z.string().min(1).max(8000),
  page: z.string().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  // Shares the assistant's burst limit, so the table can't be flooded.
  if (!allowAiCall("assistant", aiCallerKey(null, (await headers()).get("x-forwarded-for")))) return Response.json({ ok: false }, { status: 429 });
  const { helpful, mode, question, answer, page } = parsed.data;
  try {
    const { error } = await createSupabaseAdminClient()
      .from("tours_ai_feedback")
      .insert({ helpful, mode, question: question ? question.slice(0, 300) : null, answer: answer.slice(0, 600), page: page ? page.slice(0, 200) : null });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Assistant feedback error:", error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
