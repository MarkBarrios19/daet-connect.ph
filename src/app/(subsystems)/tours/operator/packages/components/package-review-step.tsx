"use client";

import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import type { PackageDraft } from "../package-types";

interface PackageReviewStepProps {
  data: PackageDraft;
  packageId: string | null;
  onSubmit: (data: Partial<PackageDraft>) => void;
  onBack: () => void;
  onSaveDraft: () => void;
  loading: boolean;
}

export function PackageReviewStep({
  data,
  packageId,
  onSubmit,
  onBack,
  onSaveDraft,
  loading,
}: PackageReviewStepProps) {
  const handleSubmitForReview = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({});
  };

  const defaultVariant = data.priceVariants.find((v) => v.isDefault);
  const priceDisplay = defaultVariant
    ? defaultVariant.pricePerPax
      ? `${formatPeso(defaultVariant.pricePerPax)}/pax`
      : `${formatPeso(defaultVariant.flatPrice)} flat`
    : "Price not set";

  return (
    <form onSubmit={handleSubmitForReview} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-daet-ink">Review & submit</h2>
        <p className="mt-2 text-sm text-daet-ink/65">
          Double-check everything before submitting to the Tourism Office for approval.
        </p>
      </div>

      {/* Package Summary */}
      <div className="space-y-6 rounded-2xl card-edge bg-surface p-6">
        {/* Title & Location */}
        <div>
          <h3 className="text-xl font-bold text-daet-ink">{data.title}</h3>
          <p className="mt-1 text-sm text-daet-ink/70"><LineIcon name="pin" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {data.locationName}</p>
          <p className="mt-1 text-sm text-daet-ink/70">
            <LineIcon name="clock" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {data.durationValue} {data.durationType}
          </p>
        </div>

        {/* Description */}
        {data.description && (
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Description
            </p>
            <p className="mt-1 text-sm leading-6 text-daet-ink/70">{data.description}</p>
          </div>
        )}

        {/* Inclusions */}
        {data.inclusions.length > 0 && (
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Inclusions ({data.inclusions.length})
            </p>
            <ul className="mt-2 space-y-1">
              {data.inclusions.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                  <span className="text-xs">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Exclusions */}
        {data.exclusions.length > 0 && (
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Exclusions ({data.exclusions.length})
            </p>
            <ul className="mt-2 space-y-1">
              {data.exclusions.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-daet-ink/70">
                  <span className="text-xs">✕</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Price Variants */}
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Price variants ({data.priceVariants.length})
          </p>
          <div className="mt-2 space-y-2">
            {data.priceVariants.map((variant, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-3 ${
                  variant.isDefault
                    ? "border-daet-forest/30 bg-daet-forest/5"
                    : "border-daet-ink/10 bg-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-daet-ink">
                      {variant.variantName}
                      {variant.isDefault && (
                        <span className="ml-2 text-xs text-daet-forest dark:text-blue-300">(Default)</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {variant.minPax}
                      {variant.maxPax ? `–${variant.maxPax}` : "+"} pax
                    </p>
                  </div>
                  <p className="text-sm font-bold text-daet-ink">
                    {variant.pricePerPax
                      ? `${formatPeso(variant.pricePerPax)}/pax`
                      : `${formatPeso(variant.flatPrice)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stops */}
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Itinerary stops ({data.stops.length})
          </p>
          <div className="mt-2 space-y-1">
            {data.stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-daet-ink/70">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-daet-forest/10 text-xs font-bold text-daet-leaf dark:text-blue-300">
                  {i + 1}
                </span>
                {stop.locationName}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Warning Box */}
      <div className="rounded-2xl bg-yellow-50 dark:bg-yellow-950/40 p-4 text-sm">
        <p className="font-bold text-yellow-900 dark:text-yellow-200"><LineIcon name="warning" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Before submitting</p>
        <ul className="mt-2 space-y-1 text-xs text-yellow-800 dark:text-yellow-200">
          <li>• All information is accurate and up-to-date</li>
          <li>• Pricing matches your actual tour costs</li>
          <li>• You have at least one price variant marked as default</li>
          <li>• Map coordinates are correct for all stops</li>
          <li>• Once submitted, you cannot edit until reviewed</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 border-t border-daet-ink/10 pt-6 sm:flex-row sm:justify-between">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-daet-ink/20 px-8 text-sm font-bold text-daet-ink transition hover:bg-daet-sand disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Back
          </button>
          {packageId && (
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={loading}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-daet-ink/20 px-8 text-sm font-bold text-daet-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save as draft
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-8 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Submitting..." : "Submit for review →"}
        </button>
      </div>
    </form>
  );
}
