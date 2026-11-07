import { Suspense } from "react";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageBody } from "@/components/ui/signed-in-frame";
import { currentManilaMonth, formatMonthLabel, monthKey, parseMonthParam, shiftMonth } from "@/lib/tours/events-calendar";
import { ledgerMethodLabel, summarizeLedger } from "@/lib/tours/ledger";
import { timed } from "@/lib/server-timing";
import { loadOperatorLedger } from "@/app/(subsystems)/tours/operator/payments/load-ledger";

export const metadata = { title: "Payments ledger" };

const peso = formatPeso;
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function OperatorPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  // The heading and back link are the same for everyone, so they are in the
  // prerendered shell; the month, the totals and the ledger wait for the request.
  return (
    <PageBody>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/tours/operator/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest dark:text-blue-300 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="display-2 text-daet-ink">Revenue &amp; payments</h1>
        </div>
        <Suspense fallback={<div aria-hidden="true" className="h-12 w-36 animate-pulse rounded-full bg-daet-ink/10" />}>
          <ExportLink searchParams={searchParams} />
        </Suspense>
      </div>
      <Suspense fallback={<LedgerSkeleton />}>
        <Ledger searchParams={searchParams} />
      </Suspense>
    </PageBody>
  );
}

/** The CSV link follows the month in the address; it needs no data, so it does not wait for the ledger. */
async function ExportLink({ searchParams }: { searchParams: SearchParams }) {
  const key = monthKey(parseMonthParam((await searchParams).month));
  return (
    <ButtonLink href={`/tours/operator/payments/export?month=${key}`} variant="secondary" prefetch={false}>
      Download CSV
    </ButtonLink>
  );
}

function LedgerSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading the ledger
      </p>
      <div aria-hidden="true" className="animate-pulse space-y-6">
        <div className="h-16 rounded-2xl bg-daet-ink/10" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-daet-ink/10" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-daet-ink/10" />
      </div>
    </div>
  );
}

async function Ledger({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const result = await timed("page:payments", () => loadOperatorLedger(month));

  if (!result.ok && result.reason === "signed_out") redirect(`/login?next=${encodeURIComponent("/tours/operator/payments")}`);
  if (!result.ok) {
    return (
      <Notice variant="error" title={result.reason === "not_operator" ? "Operator access required" : "Payments could not be loaded"}>
        {result.reason === "not_operator"
          ? "Only approved tour operators can view a payments ledger."
          : "Please try again in a moment."}
      </Notice>
    );
  }

  const summary = summarizeLedger(result.rows);
  const key = monthKey(month);
  const isCurrentMonth = key === monthKey(currentManilaMonth());

  return (
    <>
      <nav aria-label="Month" className="mb-6 flex items-center justify-between gap-3 rounded-2xl card-edge bg-surface p-2">
        <ButtonLink href={`/tours/operator/payments?month=${monthKey(shiftMonth(month, -1))}`} variant="ghost" size="icon" aria-label="Previous month">
          ‹
        </ButtonLink>
        <p className="font-bold text-daet-ink">{formatMonthLabel(month)}</p>
        {isCurrentMonth ? (
          <span className="h-11 w-11" aria-hidden="true" />
        ) : (
          <ButtonLink href={`/tours/operator/payments?month=${monthKey(shiftMonth(month, 1))}`} variant="ghost" size="icon" aria-label="Next month">
            ›
          </ButtonLink>
        )}
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">Received</p>
          <p className="mt-1 text-2xl font-bold text-daet-forest dark:text-blue-300">{peso(summary.received)}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{summary.count} payment{summary.count === 1 ? "" : "s"}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">Online (PayMongo)</p>
          <p className="mt-1 text-2xl font-bold text-daet-ink">{peso(summary.online)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">Manual / verified receipts</p>
          <p className="mt-1 text-2xl font-bold text-daet-ink">{peso(summary.manual)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400">Refunded</p>
          <p className="mt-1 text-2xl font-bold text-daet-ink">{peso(summary.refunded)}</p>
        </Card>
      </div>

      {summary.byMethod.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="By method" />
          <ul className="space-y-2">
            {summary.byMethod.map((entry) => (
              <li key={entry.method}>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-daet-ink">{entry.method}</span>
                  <span className="text-daet-ink/70">{peso(entry.amount)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-daet-sand" aria-hidden="true">
                  <div className="h-2 rounded-full bg-daet-forest" style={{ width: `${Math.max(2, (entry.amount / summary.received) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {summary.byPackage.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="By package" />
          <ul className="divide-y divide-daet-ink/10">
            {summary.byPackage.map((entry) => (
              <li key={entry.title} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate font-bold text-daet-ink">{entry.title}</span>
                <span className="shrink-0 text-daet-ink/70">
                  {entry.count} payment{entry.count === 1 ? "" : "s"} · <strong className="text-daet-ink">{peso(entry.amount)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {result.rows.length === 0 ? (
        <EmptyState icon={<LineIcon name="receipt" />} title={`No payments in ${formatMonthLabel(month)}`} description="Online payments and verified receipts will appear here." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-daet-ink/10">
            {result.rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-bold text-daet-ink">
                    {row.booking_reference} · {row.tourist_name}
                  </p>
                  <p className="truncate text-sm text-daet-ink/70">{row.package_title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Badge tone={row.provider === "paymongo" ? "info" : "brand"}>{row.provider === "paymongo" ? "PayMongo" : "Manual"}</Badge>
                    <span>{ledgerMethodLabel(row)}</span>
                    {row.reference_number ? <span>Ref {row.reference_number}</span> : null}
                    {row.payment_date ? <span>{dateTime.format(new Date(row.payment_date))}</span> : null}
                  </div>
                </div>
                <span className={`shrink-0 font-bold ${row.payment_status === "completed" ? "text-green-700 dark:text-green-300" : "text-daet-ink/70 line-through"}`}>
                  {peso(Number(row.amount))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
