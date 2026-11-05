import { headers } from "next/headers";
import { aiCallerKey, allowAiCall } from "@/lib/ai/limits";
import { planRoute } from "@/lib/maps/routes";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAssistantLlmEnabled, runAssistant } from "@/lib/tours/assistant/llm";
import { cleanHistory, respond } from "@/lib/tours/assistant/respond";
import { clearAiHistory, loadAiHistory, savingReply } from "@/lib/tours/assistant/history";
import { toManilaDateKey } from "@/lib/tours/events-calendar";

/**
 * Travel assistant (F13). POST { messages } → newline-delimited JSON events
 * (mode, text deltas, cards, done). Reads only, with the caller's session.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "The assistant is not set up." }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a message to the assistant." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const aiAllowed = isAssistantLlmEnabled() && allowAiCall("assistant", aiCallerKey(user?.id, (await headers()).get("x-forwarded-for")));

  const reply = respond(body, {
    supabase,
    userId: user?.id ?? null,
    today: toManilaDateKey(new Date()),
    aiAllowed,
    route: async (from, to) => (await planRoute([from, to])).legs[0],
    runAi: (ctx, history, onText) => runAssistant(ctx, history, onText),
  });
  // Signed-in travellers keep their chat, like any other conversation.
  const cleaned = cleanHistory(body);
  const question = "history" in cleaned ? cleaned.history[cleaned.history.length - 1].content : "";
  const events = user ? savingReply(reply, supabase, question) : reply;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    async cancel() {
      await events.return(undefined);
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

/** The signed-in traveller's saved chat with the assistant, oldest first. */
export async function GET() {
  if (!isSupabaseConfigured()) return Response.json({ turns: [] });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ turns: [], saved: false });
  try {
    return Response.json({ turns: await loadAiHistory(supabase), saved: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Load assistant chat error:", error);
    return Response.json({ turns: [], saved: true, error: "Your saved chat could not be loaded." }, { status: 500 });
  }
}

/** Deletes the signed-in traveller's saved chat. */
export async function DELETE() {
  if (!isSupabaseConfigured()) return Response.json({ ok: false }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  try {
    await clearAiHistory(supabase, user.id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Clear assistant chat error:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
