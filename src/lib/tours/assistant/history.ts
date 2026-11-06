import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantEvent } from "@/lib/tours/assistant/respond";
import type { AssistantCard } from "@/lib/tours/assistant/tools";

/**
 * Saved Daet AI assistant chats for signed-in travellers (tours_ai_messages).
 * Row-level security keeps each person to their own messages.
 */

export const AI_HISTORY_LIMIT = 30;
export type SavedTurn = { role: "user" | "assistant"; content: string; cards?: AssistantCard[]; mode?: "ai" | "basic" };

export async function loadAiHistory(supabase: SupabaseClient): Promise<SavedTurn[]> {
  const { data, error } = await supabase
    .from("tours_ai_messages")
    .select("role, content, cards, mode, created_at")
    .order("created_at", { ascending: false })
    .limit(AI_HISTORY_LIMIT);
  if (error) throw error;
  return ((data ?? []) as Array<{ role: "user" | "assistant"; content: string; cards: AssistantCard[] | null; mode: "ai" | "basic" | null }>)
    .reverse()
    .map((row) => ({ role: row.role, content: row.content, ...(row.cards ? { cards: row.cards } : {}), ...(row.mode ? { mode: row.mode } : {}) }));
}

export async function clearAiHistory(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("tours_ai_messages").delete().eq("profile_id", userId);
  if (error) throw error;
}

/**
 * Passes the reply events through unchanged, and once the reply is done
 * saves the question and the answer. Saving never breaks the reply.
 */
export async function* savingReply(events: AsyncGenerator<AssistantEvent>, supabase: SupabaseClient, question: string): AsyncGenerator<AssistantEvent> {
  let text = "";
  let cards: AssistantCard[] = [];
  let mode: "ai" | "basic" | null = null;
  let done = false;
  for await (const event of events) {
    if (event.t === "text") text += event.v;
    else if (event.t === "cards") cards = event.cards;
    else if (event.t === "mode") mode = event.mode;
    else if (event.t === "done") done = true;
    yield event;
  }
  const answer = text.trim();
  if (!done || !answer || !question.trim()) return;
  // Two inserts, question first: each gets its own now() (the app may not write
  // created_at), so the chat always loads the question above its answer.
  const asked = await supabase.from("tours_ai_messages").insert({ role: "user", content: question.trim().slice(0, 4000) });
  if (asked.error) {
    console.error("Save assistant chat error:", asked.error.message);
    return;
  }
  const { error } = await supabase.from("tours_ai_messages").insert({ role: "assistant", content: answer.slice(0, 4000), cards: cards.length ? cards : null, mode });
  if (error) console.error("Save assistant chat error:", error.message);
}
