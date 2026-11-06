/**
 * Peso exchange rates for the rough amounts shown to foreign visitors
 * (decision 24). From a free daily source, cached for a day; a failure just
 * hides the rough amounts.
 */
const SOURCE = "https://open.er-api.com/v6/latest/PHP";

export async function GET() {
  try {
    const response = await fetch(SOURCE, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error(`rates ${response.status}`);
    const body = (await response.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (body.result !== "success" || !body.rates) throw new Error("rates: bad body");
    return Response.json({ rates: body.rates, updated: body.time_last_update_utc ?? null }, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
  } catch (error) {
    console.error("Exchange rates error:", error instanceof Error ? error.message : error);
    return Response.json({ rates: null }, { status: 503 });
  }
}
