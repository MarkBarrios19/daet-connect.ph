import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { SearchBox } from "@/components/ui/search-box";
import { searchTerm } from "@/components/ui/search-term";
import {
  OPERATOR_APPLICATION_SELECT,
  OPERATOR_DOCUMENT_BUCKET,
  OPERATOR_TABLE,
  type OperatorApplicationRecord,
} from "@/lib/tours/operator-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { OperatorReviewCard, type OperatorDocumentLinks } from "@/app/(subsystems)/tours/admin/operators/review-card";


const PAGE_SIZE = 20;
const SIGNED_URL_TTL_SECONDS = 10 * 60;
type SearchParams = Promise<{ page?: string; q?: string }>;

function safePage(value?: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 100_000);
}

export default async function AdminOperatorQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!isSupabaseConfigured()) {
    return <PageFrame><Notice variant="warning" title="Supabase setup is needed">Configure Supabase before opening the admin review queue.</Notice></PageFrame>;
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
            <Link href={`/login?next=${encodeURIComponent("/tours/admin/operators")}`} className="font-bold underline underline-offset-4">Sign in</Link> with your Tourism Office admin account to review applications.
          </Notice>
        </div>
      </PageFrame>
    );
  }
  if (session.error || session.role !== "admin") {
    return (
      <PageFrame>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="error" title="You do not have access to this queue">
            {session.error ?? "Only accounts with the admin role can view operator applications."}
          </Notice>
        </div>
      </PageFrame>
    );
  }
  if (!isSupabaseAdminConfigured()) {
    return (
      <PageFrame adminNav>
        <div className="mx-auto max-w-2xl py-8">
          <h1 className="display-2 mb-4 text-daet-ink">Operator applications</h1>
          <Notice variant="error" title="Server storage access is not configured">
            Set the service-role key on the server. It is required to make short-lived links to private application documents.
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const params = await searchParams;
  const page = safePage(params.page);
  const q = searchTerm(params.q);
  const firstRow = (page - 1) * PAGE_SIZE;
  const admin = createSupabaseAdminClient();
  let query = admin
    .from(OPERATOR_TABLE)
    .select(OPERATOR_APPLICATION_SELECT)
    .eq("accreditation_status", "pending");
  if (q) {
    query = query.or(`business_name.ilike.%${q}%,contact_person.ilike.%${q}%,contact_email.ilike.%${q}%,contact_phone.ilike.%${q}%,business_address.ilike.%${q}%`);
  }
  const { data: rows, error } = await query
    .order("created_at", { ascending: true })
    .range(firstRow, firstRow + PAGE_SIZE - 1);

  if (error) {
    return (
      <PageFrame adminNav>
        <div className="mx-auto max-w-3xl">
          <Notice variant="error" title="The review queue could not be loaded">Please refresh. No application information has been changed.</Notice>
        </div>
      </PageFrame>
    );
  }

  const applications = (rows ?? []) as OperatorApplicationRecord[];
  const allPaths = applications
    .flatMap((application) => [
      application.dti_registration_url,
      application.business_permit_url,
      application.gcash_qr_url,
    ])
    .filter((path): path is string => typeof path === "string" && path.length > 0);
  const uniquePaths = [...new Set(allPaths)];
  const signedUrlByPath = new Map<string, string>();

  // One bulk Storage call for this page, avoiding a per-application (N+1) lookup.
  if (uniquePaths.length > 0) {
    try {
      const { data: signedFiles, error: signingError } = await admin.storage
        .from(OPERATOR_DOCUMENT_BUCKET)
        .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS, { download: true });
      if (!signingError && signedFiles) {
        signedFiles.forEach((file) => {
          if (file.path && file.signedUrl) signedUrlByPath.set(file.path, file.signedUrl);
        });
      }
    } catch {
      // The queue can still render if Storage is temporarily unavailable.
      console.error("Could not create signed operator document links.");
    }
  }

  const hasNextPage = applications.length === PAGE_SIZE;

  return (
    <PageFrame adminNav>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="display-2 mt-2 text-daet-ink">Operator applications</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-daet-ink/65">Review the submitted business details and documents, then approve or return the application with a clear reason.</p>
        </div>
        <span className="inline-flex min-h-10 items-center self-start rounded-full bg-yellow-50 dark:bg-yellow-950/40 px-4 text-sm font-bold text-yellow-900 dark:text-yellow-200 sm:self-auto">Pending · page {page}</span>
      </div>

      <SearchBox action="/tours/admin/operators" label="Search pending operator applications" placeholder="Business, contact, email or phone" value={q} className="mb-6" />
      <Notice variant="info" className="mb-6">
        Applicant documents are private and the links below expire in 10 minutes. Open them only on an authorized device; do not forward them.
      </Notice>

      {applications.length === 0 ? (
        <section className="rounded-2xl card-edge bg-surface px-6 py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-green-50 dark:bg-green-950/40 text-2xl text-green-700 dark:text-green-300" aria-hidden="true">✓</span>
          <h2 className="mt-4 text-xl font-bold text-daet-ink">You’re all caught up</h2>
          <p className="mt-2 text-sm text-daet-ink/70">{q ? `No pending operator applications match “${q}”.` : "There are no pending operator applications on this page."}</p>
        </section>
      ) : (
        <div className="space-y-5">
          {applications.map((application) => {
            const documents: OperatorDocumentLinks = {
              dti: application.dti_registration_url
                ? signedUrlByPath.get(application.dti_registration_url) ?? null
                : null,
              permit: application.business_permit_url
                ? signedUrlByPath.get(application.business_permit_url) ?? null
                : null,
              gcash: application.gcash_qr_url
                ? signedUrlByPath.get(application.gcash_qr_url) ?? null
                : null,
            };
            return <OperatorReviewCard key={application.id} application={application} documents={documents} />;
          })}
        </div>
      )}

      <nav className="mt-7 flex items-center justify-between" aria-label="Application pages">
        {page > 1 ? (
          <Link href={`/tours/admin/operators?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="inline-flex min-h-11 items-center rounded-full border border-daet-ink/15 px-5 text-sm font-bold text-daet-ink hover:bg-surface">← Previous</Link>
        ) : <span />}
        {hasNextPage ? (
          <Link href={`/tours/admin/operators?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="inline-flex min-h-11 items-center rounded-full border border-daet-ink/15 px-5 text-sm font-bold text-daet-ink hover:bg-surface">Next →</Link>
        ) : <span />}
      </nav>
    </PageFrame>
  );
}
