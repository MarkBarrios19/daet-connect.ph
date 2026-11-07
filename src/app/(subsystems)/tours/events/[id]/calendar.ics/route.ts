import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildEventIcs } from "@/lib/tours/events-calendar";
import { EVENT_COLUMNS, type TourEvent } from "@/lib/tours/promo-validation";


export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tours_events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  if (!data) return new Response("Event not found", { status: 404 });
  const event = data as TourEvent;

  return new Response(buildEventIcs(event), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="daet-event-${event.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
