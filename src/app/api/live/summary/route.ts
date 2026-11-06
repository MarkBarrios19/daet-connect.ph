import { NextResponse } from "next/server";
import { loadLiveSummary } from "@/lib/live/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };

/**
 * One poll for the header bell, the message badge and the dashboards' counts.
 * Reads the cookie session on the server, so it works when the browser's own
 * Supabase session is missing. `?visible=1` also stamps "last seen".
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: HEADERS });

  const visible = new URL(request.url).searchParams.get("visible") === "1";
  if (visible) await Promise.resolve(supabase.rpc("tours_touch_presence")).catch(() => {});
  const { data: role } = await supabase.rpc("get_my_role");
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : null;
  try {
    return NextResponse.json(await loadLiveSummary(supabase, user.id, normalized), { headers: HEADERS });
  } catch (error) {
    console.error("Live summary error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "failed" }, { status: 500, headers: HEADERS });
  }
}
