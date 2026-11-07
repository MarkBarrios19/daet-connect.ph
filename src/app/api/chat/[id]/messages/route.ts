import { NextResponse } from "next/server";
import { MESSAGE_COLUMNS, type ChatMessage } from "@/lib/tours/messaging";
import { threadExtras } from "@/app/(subsystems)/tours/messages/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";


const HEADERS = { "Cache-Control": "no-store" };

/**
 * Messages newer than `?after=<ISO time>` for one chat, with their reactions,
 * quoted messages and photo links: the fallback when Realtime is down. Row-
 * level security limits it to the chat's members.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isSupabaseConfigured() || !isUuid(id)) return NextResponse.json({ error: "bad request" }, { status: 400, headers: HEADERS });
  const after = new URL(request.url).searchParams.get("after");
  if (!after || Number.isNaN(Date.parse(after))) return NextResponse.json({ error: "bad request" }, { status: 400, headers: HEADERS });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: HEADERS });

  const { data, error } = await supabase.from("tours_messages").select(MESSAGE_COLUMNS).eq("conversation_id", id).gt("created_at", after).order("created_at", { ascending: true }).limit(50);
  if (error) return NextResponse.json({ error: "failed" }, { status: 500, headers: HEADERS });
  const messages = (data ?? []) as ChatMessage[];
  const extras = await threadExtras(id, messages);
  return NextResponse.json({ messages, ...extras }, { headers: HEADERS });
}
