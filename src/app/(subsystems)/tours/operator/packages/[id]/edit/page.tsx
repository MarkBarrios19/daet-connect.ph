import React, { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { loadPackageForEdit } from "./actions";
import { EditPackageForm } from "./EditPackageForm";
import { EDIT_MESSAGES } from "./edit-constants";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Loading skeleton for the edit package page
 */
function EditPackageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-8 bg-muted-strong rounded-2xl w-1/3" />
        <div className="h-4 bg-muted-strong rounded-2xl w-2/3" />
      </div>

      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-3 border rounded-2xl p-6 bg-canvas">
            <div className="h-6 bg-muted-strong rounded-2xl w-1/4" />
            <div className="space-y-2">
              <div className="h-10 bg-muted-strong rounded-2xl" />
              <div className="h-10 bg-muted-strong rounded-2xl" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 justify-end">
        <div className="h-10 bg-muted-strong rounded-2xl w-32" />
        <div className="h-10 bg-muted-strong rounded-2xl w-40" />
      </div>
    </div>
  );
}

/**
 * Error display component for 404 errors
 */
function NotFoundDisplay() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="space-y-4">
        <div className="text-6xl font-bold text-slate-200">404</div>
        <h1 className="display-2 text-daet-ink">{EDIT_MESSAGES.notFound}</h1>
        <p className="text-daet-ink/80">The package you're looking for doesn't exist or has been deleted.</p>
        <Link
          href="/tours/operator/packages"
          className="min-h-11 inline-block mt-6 px-6 py-2 bg-daet-forest text-white rounded-2xl hover:bg-daet-leaf transition"
        >
          ← Back to Packages
        </Link>
      </div>
    </div>
  );
}

/**
 * Error display component for 403 (Access Denied) errors
 */
function AccessDeniedDisplay() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="space-y-4">
        <div className="text-6xl font-bold text-slate-200">403</div>
        <h1 className="display-2 text-daet-ink">{EDIT_MESSAGES.forbidden}</h1>
        <p className="text-daet-ink/80">You don't have permission to edit this package.</p>
        <Link
          href="/tours/operator/packages"
          className="min-h-11 inline-block mt-6 px-6 py-2 bg-daet-forest text-white rounded-2xl hover:bg-daet-leaf transition"
        >
          ← Back to Packages
        </Link>
      </div>
    </div>
  );
}

/**
 * Error display component for 500 (Server Error) errors
 */
function ServerErrorDisplay() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="space-y-4">
        <div className="text-6xl font-bold text-slate-200">500</div>
        <h1 className="display-2 text-daet-ink">{EDIT_MESSAGES.loadFailed}</h1>
        <p className="text-daet-ink/80">We encountered an error loading the package. Please try again later.</p>
        <div className="space-x-4 mt-6">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-daet-forest text-white rounded-2xl hover:bg-daet-leaf transition"
          >
            Try Again
          </button>
          <Link
            href="/tours/operator/packages"
            className="min-h-11 inline-block px-6 py-2 border border-daet-ink/20 text-daet-ink/80 rounded-2xl hover:bg-canvas transition"
          >
            ← Back to Packages
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Content component that loads package data and displays the form
 */
async function EditPackageContent({ packageId }: { packageId: string }) {
  const result = await loadPackageForEdit(packageId);

  if (!result.success) {
    if (result.error.status === 404) {
      return <NotFoundDisplay />;
    }
    if (result.error.status === 403) {
      return <AccessDeniedDisplay />;
    }
    return <ServerErrorDisplay />;
  }

  const { data: packageRecord } = result;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/tours/operator/packages" className="inline-flex min-h-11 items-center font-bold text-blue-700 dark:text-blue-300 hover:underline">
            Packages
          </Link>
          <span className="text-daet-ink/70">/</span>
          <span className="text-daet-ink/80">{packageRecord.formData.title}</span>
        </div>
        <h1 className="display-2 text-daet-ink">Edit Package</h1>
        <p className="text-daet-ink/80 mt-2">
          Status: <span className="font-bold capitalize">{packageRecord.status}</span>
        </p>
      </div>

      <EditPackageForm packageData={packageRecord} />
    </div>
  );
}

/**
 * Page component for editing an operator's package
 *
 * Accepts [id] parameter (package ID)
 * Calls loadPackageForEdit server action
 * Shows loading skeleton while fetching data
 * Handles 404, 403, and 500 errors gracefully
 * Passes loaded data to EditPackageForm client component
 */
export default async function EditPackagePage({ params }: PageProps) {
  const { id } = await params;

  return (
    <PageFrame>
      <Suspense fallback={<EditPackageSkeleton />}>
        <EditPackageContent packageId={id} />
      </Suspense>
    </PageFrame>
  );
}
