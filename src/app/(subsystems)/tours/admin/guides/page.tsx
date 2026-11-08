import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { SearchBox } from "@/components/ui/search-box";
import { searchTerm } from "@/components/ui/search-term";
import { GUIDE_ADMIN_SELECT, GUIDE_TABLE, type GuideAdminRecord } from "@/lib/tours/guide-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GuideReviewCard } from "@/app/(subsystems)/tours/admin/guides/guide-review-card";


const PAGE_SIZE = 20;
type SearchParams = Promise<{ page?: string; q?: string }>;

function safePage(value?: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

export default async function AdminGuideQueuePage({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured()) {
    return <PageFrame><Notice variant="warning" title="Supabase setup is needed">Configure Supabase before opening the guide review queue.</Notice></PageFrame>;
  }

  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }
  if (!session.user) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="info" title="Admin sign-in required">
            <Link href={`/login?next=${encodeURIComponent("/tours/admin/guides")}`} className="font-bold underline underline-offset-4">Sign in</Link> with a Tourism Office admin account to review guides.
          </Notice>
        </div>
      </PageFrame>
    );
  }
  if (session.error || session.role !== "admin") {
    return <PageFrame><div className="mx-auto max-w-2xl py-8"><Notice variant="error" title="You do not have access to this queue">{session.error ?? "Only an admin can view guide applications."}</Notice></div></PageFrame>;
  }

  const params = await searchParams;
  const page = safePage(params.page);
  const q = searchTerm(params.q);
  const supabase = await createSupabaseServerClient();
  // Search names through the public profile field; sensitive ID storage is not queried.
  const profileSearch = q
    ? await supabase.from("profiles").select("id").ilike("full_name", `%${q}%`).limit(500)
    : { data: [], error: null };
  const profileIds = (profileSearch.data ?? []).map((profile) => profile.id);
  // The admin review list only selects public guide-profile fields. It never
  // queries tours_guide_sensitive_info; ID access is a separate Server Action.
  let guideQuery = supabase
    .from(GUIDE_TABLE)
    .select(GUIDE_ADMIN_SELECT)
    .eq("accreditation_status", "pending");
  if (q) {
    const searchFilters = [`contact_phone.ilike.%${q}%`, `bio.ilike.%${q}%`];
    if (profileIds.length) searchFilters.push(`profile_id.in.(${profileIds.join(",")})`);
    guideQuery = guideQuery.or(searchFilters.join(","));
  }
  const { data: rows, error } = await guideQuery
    .order("created_at", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (error) {
    return <PageFrame><div className="mx-auto max-w-3xl"><Notice variant="error" title="Guide applications could not be loaded">Refresh the queue. No review decision was changed.</Notice></div></PageFrame>;
  }

  const guideRows = (rows ?? []) as Omit<GuideAdminRecord, "full_name">[];
  let fullNameByProfileId = new Map<string, string>();
  if (guideRows.length > 0) {
    const profileIds = [...new Set(guideRows.map((guide) => guide.profile_id))];
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", profileIds);
    if (profileError) {
      return <PageFrame><div className="mx-auto max-w-3xl"><Notice variant="error" title="Guide applicant names could not be loaded">Refresh the queue. No review decision was changed.</Notice></div></PageFrame>;
    }
    fullNameByProfileId = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? "Name unavailable"]));
  }
  const guides: GuideAdminRecord[] = guideRows.map((guide) => ({
    ...guide,
    full_name: fullNameByProfileId.get(guide.profile_id) ?? "Name unavailable",
  }));
  const hasNext = guides.length === PAGE_SIZE;

  return (
    <PageFrame adminNav>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display-2 mt-2 text-daet-ink">Guide applications</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-daet-ink/65">Review public profile details and verify the submitted ID through a short-lived private document link.</p>
        </div>
        <span className="inline-flex min-h-10 items-center self-start rounded-full bg-yellow-50 dark:bg-yellow-950/40 px-4 text-sm font-bold text-yellow-900 dark:text-yellow-200 sm:self-auto">Pending · page {page}</span>
      </div>
      <SearchBox action="/tours/admin/guides" label="Search pending guide applications" placeholder="Guide name, phone or introduction" value={q} className="mb-6" />
      {profileSearch.error ? <Notice variant="warning" className="mb-4">Guide names could not be searched, but phone numbers and introductions can still be matched.</Notice> : null}
      <Notice variant="warning" className="mb-6">
        Government ID files are highly sensitive. Open them only when needed for verification. Links expire after 3 minutes; do not forward or retain copies outside approved systems.
      </Notice>
      {guides.length === 0 ? (
        <section className="rounded-2xl card-edge bg-surface px-6 py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-green-50 dark:bg-green-950/40 text-2xl text-green-700 dark:text-green-300" aria-hidden="true">✓</span>
          <h2 className="mt-4 text-xl font-bold text-daet-ink">No pending guide applications</h2>
          <p className="mt-2 text-sm text-daet-ink/70">{q ? `No pending guide applications match “${q}”.` : "You’re all caught up on this page."}</p>
        </section>
      ) : (
        <div className="space-y-5">{guides.map((guide) => <GuideReviewCard key={guide.id} guide={guide} />)}</div>
      )}
      <nav className="mt-7 flex items-center justify-between" aria-label="Guide application pages">
        {page > 1 ? <Link href={`/tours/admin/guides?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="inline-flex min-h-11 items-center rounded-full border border-daet-ink/15 px-5 text-sm font-bold text-daet-ink hover:bg-surface">← Previous</Link> : <span />}
        {hasNext ? <Link href={`/tours/admin/guides?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="inline-flex min-h-11 items-center rounded-full border border-daet-ink/15 px-5 text-sm font-bold text-daet-ink hover:bg-surface">Next →</Link> : <span />}
      </nav>
    </PageFrame>
  );
}
