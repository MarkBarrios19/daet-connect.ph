import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export const metadata = { title: "Assistant feedback" };

type Row = { id: string; helpful: boolean; mode: "ai" | "basic"; question: string | null; answer: string; page: string | null; created_at: string };

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const tab = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${on ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`;

/**
 * "Was this helpful?" answers from the Daet AI assistant (decisions 26, 29).
 * The No answers first: they are how wrong or unhelpful answers are found.
 * The table has no visitor access, so it is read with the server key after the admin check.
 */
export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/feedback" />;
  const params = await searchParams;
  const show = params.show === "all" ? "all" : params.show === "yes" ? "yes" : "no";

  let rows: Row[] = [];
  let counts = { yes: 0, no: 0 };
  let failed = false;
  try {
    const db = createSupabaseAdminClient();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    let query = db.from("tours_ai_feedback").select("id, helpful, mode, question, answer, page, created_at").order("created_at", { ascending: false }).limit(100);
    if (show !== "all") query = query.eq("helpful", show === "yes");
    const [list, yes, no] = await Promise.all([
      query,
      db.from("tours_ai_feedback").select("id", { count: "exact", head: true }).eq("helpful", true).gte("created_at", since),
      db.from("tours_ai_feedback").select("id", { count: "exact", head: true }).eq("helpful", false).gte("created_at", since),
    ]);
    if (list.error) throw list.error;
    rows = (list.data ?? []) as Row[];
    counts = { yes: yes.count ?? 0, no: no.count ?? 0 };
  } catch (error) {
    console.error("Assistant feedback page error:", error instanceof Error ? error.message : error);
    failed = true;
  }
  const total = counts.yes + counts.no;

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Assistant feedback" backHref="/tours/admin" backLabel="Admin" />
      <p className="-mt-3 mb-6 max-w-2xl text-lg text-daet-ink">
        What visitors answered to &ldquo;Was this helpful?&rdquo; under the Daet AI assistant&apos;s replies. Read the No answers to find replies that were wrong or missed the question. No visitor names are kept.
      </p>

      {failed ? <Notice variant="error" className="mb-4">Feedback could not be loaded.</Notice> : null}

      <p className="mb-4 font-semibold text-daet-ink">
        Last 30 days: {counts.yes} Yes · {counts.no} No{total ? ` · ${Math.round((counts.yes / total) * 100)}% helpful` : ""}
      </p>

      <nav aria-label="Show" className="mb-6 flex flex-wrap gap-2">
        <Link href="/tours/admin/feedback" aria-current={show === "no" ? "page" : undefined} className={tab(show === "no")}>Not helpful</Link>
        <Link href="/tours/admin/feedback?show=yes" aria-current={show === "yes" ? "page" : undefined} className={tab(show === "yes")}>Helpful</Link>
        <Link href="/tours/admin/feedback?show=all" aria-current={show === "all" ? "page" : undefined} className={tab(show === "all")}>All</Link>
      </nav>

      {rows.length === 0 && !failed ? (
        <p className="rounded-2xl card-edge bg-surface p-8 text-center text-daet-ink">Nothing here yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl card-edge bg-surface p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <Badge tone={r.helpful ? "success" : "warning"}>{r.helpful ? "Helpful" : "Not helpful"}</Badge>
                <Badge tone="neutral">{r.mode === "ai" ? "AI answer" : "Simple answer"}</Badge>
                <span>{when(r.created_at)}</span>
                {r.page ? <span>on {r.page}</span> : null}
              </div>
              {r.question ? (
                <p className="font-bold text-daet-ink">
                  <span className="sr-only">Question: </span>&ldquo;{r.question}&rdquo;
                </p>
              ) : null}
              <p className="mt-1 whitespace-pre-wrap text-daet-ink">
                <span className="sr-only">Answer: </span>
                {r.answer}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
