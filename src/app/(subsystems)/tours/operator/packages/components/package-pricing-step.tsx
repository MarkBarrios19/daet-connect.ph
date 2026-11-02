"use client";

import { useState } from "react";
import type { PackageDraft, PriceVariantDraft } from "../package-types";

interface PackagePricingStepProps {
  data: PackageDraft;
  onComplete: (data: Partial<PackageDraft>) => void;
  onBack: () => void;
  loading: boolean;
}

export function PackagePricingStep({
  data,
  onComplete,
  onBack,
  loading,
}: PackagePricingStepProps) {
  const [variants, setVariants] = useState<PriceVariantDraft[]>(data.priceVariants);
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({});

  const addVariant = () => {
    setVariants([
      ...variants,
      {
        variantName: `Variant ${variants.length + 1}`,
        minPax: 1,
        maxPax: null,
        pricePerPax: null,
        flatPrice: null,
        isDefault: false,
      },
    ]);
  };

  const removeVariant = (index: number) => {
    if (variants.length > 1) {
      setVariants(variants.filter((_, i) => i !== index));
    }
  };

  const updateVariant = (index: number, updates: Partial<PriceVariantDraft>) => {
    setVariants(variants.map((v, i) => (i === index ? { ...v, ...updates } : v)));
  };

  const setDefaultVariant = (index: number) => {
    setVariants(
      variants.map((v, i) => ({
        ...v,
        isDefault: i === index,
      })),
    );
  };

  const validate = (): boolean => {
    const newErrors: Record<number, Record<string, string>> = {};
    let hasDefault = false;

    variants.forEach((variant, index) => {
      const variantErrors: Record<string, string> = {};

      if (!variant.variantName.trim()) {
        variantErrors.variantName = "Name is required";
      }

      if (variant.minPax < 1) {
        variantErrors.minPax = "Must be at least 1";
      }

      if (variant.maxPax !== null && variant.maxPax < variant.minPax) {
        variantErrors.maxPax = "Must be greater than min pax";
      }

      if (variant.pricePerPax === null && variant.flatPrice === null) {
        variantErrors.pricing = "Set either per-pax price or flat price";
      }

      if (variant.pricePerPax !== null && variant.pricePerPax < 0) {
        variantErrors.pricePerPax = "Must be 0 or greater";
      }

      if (variant.flatPrice !== null && variant.flatPrice < 0) {
        variantErrors.flatPrice = "Must be 0 or greater";
      }

      if (Object.keys(variantErrors).length > 0) {
        newErrors[index] = variantErrors;
      }

      if (variant.isDefault) hasDefault = true;
    });

    if (!hasDefault) {
      newErrors[0] = { ...newErrors[0], isDefault: "Mark one variant as default" };
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    onComplete({ priceVariants: variants });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-daet-ink">Pricing variants</h2>
        <p className="mt-2 text-sm text-daet-ink/65">
          Offer different pricing options based on group size or package features.
        </p>
      </div>

      {/* Variants List */}
      <div className="space-y-4">
        {variants.map((variant, index) => (
          <div
            key={index}
            className="rounded-2xl card-edge bg-surface p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-4">
                {/* Variant Name */}
                <div>
                  <input
                    type="text"
                    value={variant.variantName}
                    onChange={(e) => updateVariant(index, { variantName: e.target.value })}
                    placeholder="Variant name (e.g., Solo, Group)"
                    className="w-full rounded-2xl border border-daet-ink/15 bg-surface px-3 py-2 text-sm font-bold outline-none transition focus:border-daet-forest focus:ring-2 focus:ring-daet-forest/20"
                  />
                  {errors[index]?.variantName && (
                    <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors[index].variantName}</p>
                  )}
                </div>

                {/* Pax Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-daet-ink">Min pax</label>
                    <input
                      type="number"
                      value={variant.minPax}
                      onChange={(e) => updateVariant(index, { minPax: Number(e.target.value) })}
                      min={1}
                      className="mt-1 w-full rounded-2xl border border-daet-ink/15 px-3 py-2 text-sm"
                    />
                    {errors[index]?.minPax && (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors[index].minPax}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-daet-ink">Max pax (optional)</label>
                    <input
                      type="number"
                      value={variant.maxPax ?? ""}
                      onChange={(e) =>
                        updateVariant(index, {
                          maxPax: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      min={variant.minPax}
                      placeholder="Unlimited"
                      className="mt-1 w-full rounded-2xl border border-daet-ink/15 px-3 py-2 text-sm"
                    />
                    {errors[index]?.maxPax && (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors[index].maxPax}</p>
                    )}
                  </div>
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-daet-ink">Price per pax (₱)</label>
                    <input
                      type="number"
                      value={variant.pricePerPax ?? ""}
                      onChange={(e) =>
                        updateVariant(index, {
                          pricePerPax: e.target.value ? Number(e.target.value) : null,
                          flatPrice: null,
                        })
                      }
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-2xl border border-daet-ink/15 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-daet-ink">OR Flat price (₱)</label>
                    <input
                      type="number"
                      value={variant.flatPrice ?? ""}
                      onChange={(e) =>
                        updateVariant(index, {
                          flatPrice: e.target.value ? Number(e.target.value) : null,
                          pricePerPax: null,
                        })
                      }
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-2xl border border-daet-ink/15 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {errors[index]?.pricing && (
                  <p className="text-xs text-red-700 dark:text-red-300">{errors[index].pricing}</p>
                )}

                {/* Default Checkbox */}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={variant.isDefault}
                    onChange={() => setDefaultVariant(index)}
                    className="h-4 w-4 rounded-2xl border-daet-ink/30 text-daet-forest dark:text-blue-300 focus:ring-2 focus:ring-daet-forest/20"
                  />
                  <span className="font-bold">Default variant</span>
                </label>
              </div>

              {/* Remove Button */}
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVariant(index)}
                  className="grid h-8 w-8 place-items-center rounded-full text-red-600 dark:text-red-300 transition hover:bg-red-50 dark:hover:bg-red-950/40"
                  aria-label="Remove variant"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Variant Button */}
      <button
        type="button"
        onClick={addVariant}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-daet-forest/30 bg-daet-forest/5 px-5 text-sm font-bold text-daet-leaf dark:text-blue-300 transition hover:border-daet-forest/50 hover:bg-daet-forest/10"
      >
        + Add another variant
      </button>

      {/* Actions */}
      <div className="flex justify-between gap-3 border-t border-daet-ink/10 pt-6">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-daet-ink/20 px-8 text-sm font-bold text-daet-ink transition hover:bg-daet-sand disabled:cursor-not-allowed disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-8 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue →"}
        </button>
      </div>
    </form>
  );
}
