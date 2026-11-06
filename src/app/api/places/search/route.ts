import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PICKER_BOUNDS, parsePlaces } from "@/lib/maps/picker";

/**
 * Place search for the stop and meeting-point pickers: OpenStreetMap's
 * Nominatim, limited to Camarines Norte. Signed-in users only, and cached for
 * a day, which keeps us well inside Nominatim's usage policy (about one request
 * a second, an identifying User-Agent, no bulk use).
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 100) return Response.json({ results: [] });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ results: [] }, { status: 401 });

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "ph");
  url.searchParams.set("viewbox", `${PICKER_BOUNDS.west},${PICKER_BOUNDS.north},${PICKER_BOUNDS.east},${PICKER_BOUNDS.south}`);
  url.searchParams.set("bounded", "1");
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "CONNECT-Daet/1.0 (tourism app for Daet, Camarines Norte)", "Accept-Language": "en" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`nominatim ${response.status}`);
    return Response.json({ results: parsePlaces(await response.json()) });
  } catch (error) {
    console.error("Place search error:", error instanceof Error ? error.message : error);
    return Response.json({ results: [], error: "Search is unavailable. Tap the map instead." }, { status: 503 });
  }
}
