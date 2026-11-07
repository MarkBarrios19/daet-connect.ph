import { Suspense } from "react";
import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageBody } from "@/components/ui/signed-in-frame";
import { Notice } from "@/components/ui/notice";
import { canAccessOperatorDashboard } from "@/lib/tours/operator-access";
import {
  OPERATOR_OWN_STATUS_SELECT,
  OPERATOR_TABLE,
  OPERATOR_USER_ID_COLUMN,
} from "@/lib/tours/operator-contract";
import { getAuthenticatedSession, getAuthUser } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { timed } from "@/lib/server-timing";
import { listOperatorPackages } from "@/app/(subsystems)/tours/operator/packages/actions";


type SearchParams = Promise<{ submitted?: string }>;

export default function OperatorPackagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // The heading and the Create button are the same for everyone, so they are in
  // the prerendered shell; the list waits for the operator.
  return (
    <PageBody>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div className="flex-1">
            <h1 className="display-2 text-daet-ink">Your packages</h1>
            <p className="mt-2 text-sm leading-6 text-daet-ink/65">
              Create and manage tour packages for tourists to book.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/tours/operator/packages/create"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              + Create package
            </Link>
          </div>
        </div>
        <Suspense fallback={<PackagesSkeleton />}>
          <PackagesContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageBody>
  );
}

function PackagesSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading your packages
      </p>
      <div aria-hidden="true" className="mt-8 grid animate-pulse gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl card-edge bg-surface">
            <div className="aspect-video bg-daet-ink/10" />
            <div className="space-y-3 p-5">
              <div className="h-5 w-2/3 rounded-full bg-daet-ink/10" />
              <div className="h-4 w-1/2 rounded-full bg-daet-ink/10" />
              <div className="h-10 rounded-full bg-daet-ink/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function PackagesContent({ searchParams }: { searchParams: SearchParams }) {
  if (!isSupabaseConfigured()) {
    return (
      <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase before managing packages.
        </Notice>
    );
  }

  let session;
  let operatorRow;
  try {
    // The role and the operator row both need only the user, so they run together.
    const user = await getAuthUser();
    const supabase = await createSupabaseServerClient();
    [session, operatorRow] = await Promise.all([
      getAuthenticatedSession(),
      user
        ? supabase.from("tours_operators").select("id, accreditation_status").eq("profile_id", user.id).maybeSingle()
        : Promise.resolve(null),
    ]);
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
    operatorRow = null;
  }

  if (!session.user)
    redirect(`/login?next=${encodeURIComponent("/tours/operator/packages")}`);

  if (session.error || !session.role) {
    return (
      <Notice variant="error" title="Account verification failed">
        {session.error ?? "Your role could not be verified."}
      </Notice>
    );
  }

  const { data: operator, error } = operatorRow ?? { data: null, error: null };

  if (error || !operator) {
    return (
      <Notice variant="error" title="Could not verify accreditation">
          Your operator status could not be checked.
        </Notice>
    );
  }

  if (operator.accreditation_status !== "approved") redirect("/tours/operator/pending");
  if (!canAccessOperatorDashboard(session.role, operator.accreditation_status)) {
    return (
      <Notice variant="error" title="Access denied">
          Your accreditation and account role do not match.
        </Notice>
    );
  }

  const packagesResult = await timed("page:packages", () => listOperatorPackages());
  const packages = packagesResult.success ? packagesResult.data : [];


  const params = await searchParams;
  const justSubmitted = params.submitted === "true";

  return (
    <>
        {justSubmitted && (
          <Notice variant="success" className="mt-6">
            Package submitted for Tourism Office review! You'll be notified once it's approved.
          </Notice>
        )}

        {!packages || packages.length === 0 ? (
          <section className="mt-8 rounded-2xl card-edge bg-surface px-6 py-14 text-center">
            <span
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-daet-sand text-2xl"
              aria-hidden="true"
            >
              <LineIcon name="box" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            </span>
            <h2 className="mt-4 text-xl font-bold text-daet-ink">No packages yet</h2>
            <p className="mt-2 text-sm text-daet-ink/70">
              Create your first tour package to start receiving bookings.
            </p>
            <Link
              href="/tours/operator/packages/create"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-8 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Create first package
            </Link>
          </section>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <article
                key={pkg.id}
                className="overflow-hidden rounded-2xl card-edge bg-surface transition"
              >
                {/* Cover Image */}
                <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-daet-forest to-daet-leaf">
                  {pkg.cover_image_url ? (
                    <img
                      src={pkg.cover_image_url}
                      alt={pkg.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl text-white/20">
                      <LineIcon name="camera" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="flex-1 font-bold text-daet-ink">{pkg.title}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        pkg.status === "published"
                          ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300"
                          : pkg.status === "pending_review"
                            ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-200"
                            : pkg.status === "archived"
                              ? "bg-muted text-slate-800 dark:text-slate-100"
                              : "bg-daet-sand text-daet-ink/70"
                      }`}
                    >
                      {pkg.status === "published"
                        ? "Published"
                        : pkg.status === "pending_review"
                          ? "Pending"
                          : pkg.status === "archived"
                            ? "Archived"
                            : "Draft"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-daet-ink/70"><LineIcon name="pin" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {pkg.location_name}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Updated {new Date(pkg.updated_at).toLocaleDateString()}
                  </p>
                  <Link
                    href={`/tours/operator/packages/${pkg.id}`}
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-daet-forest/10 text-sm font-bold text-daet-leaf dark:text-blue-300 transition hover:bg-daet-forest/20"
                  >
                    View details →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
    </>
  );
}
