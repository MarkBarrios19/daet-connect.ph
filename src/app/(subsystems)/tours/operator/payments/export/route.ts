import { monthKey, parseMonthParam } from "@/lib/tours/events-calendar";
import { ledgerToCsv } from "@/lib/tours/ledger";
import { loadOperatorLedger } from "../load-ledger";


export async function GET(request: Request) {
  const month = parseMonthParam(new URL(request.url).searchParams.get("month"));
  const result = await loadOperatorLedger(month);
  if (!result.ok) {
    const status = result.reason === "signed_out" ? 401 : result.reason === "not_operator" ? 403 : 500;
    return new Response("Not available", { status });
  }

  return new Response(ledgerToCsv(result.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${monthKey(month)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
