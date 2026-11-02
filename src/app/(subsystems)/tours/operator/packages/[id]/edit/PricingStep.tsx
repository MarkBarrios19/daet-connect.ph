"use client";

import { formatPeso } from "@/lib/money";
import React, { useCallback, useState } from "react";
import { useFeedback } from "@/components/ui/feedback";
import type { EditPriceVariant, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { EDIT_LIMITS } from "./edit-constants";
import { getEditPermissions } from "./permissions";

type PricingStepProps = StepProps<EditPriceVariant[]>;

/**
 * PricingStep Component
 *
 * Manages price variants with:
 * - Table display of existing variants
 * - Add variant form/modal
 * - Edit variant functionality
 * - Delete variant with confirmation
 * - Status-aware restrictions
 */
export function PricingStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
}: PricingStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const { toast, confirm } = useFeedback();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [formData, setFormData] = useState<Partial<EditPriceVariant>>({
    variantName: "",
    minPax: 1,
    maxPax: null,
    pricePerPax: null,
    flatPrice: null,
    isDefault: false,
  });

  const canAddVariants = permissions.pricing.add;
  const canEditVariants = permissions.pricing.editPax;
  const canRemoveVariants = permissions.pricing.remove;

  // Get pricing errors for the current step
  const getPricingErrors = useCallback(() => {
    const stepErrors: Record<string, string> = {};
    Object.entries(errors).forEach(([key, value]) => {
      if (key.startsWith("priceVariants")) {
        stepErrors[key] = value;
      }
    });
    return stepErrors;
  }, [errors]);

  const handleAddVariant = useCallback(() => {
    if (
      !formData.variantName?.trim() ||
      !formData.minPax ||
      (formData.pricePerPax === null && formData.flatPrice === null)
    ) {
      return;
    }

    const newVariant: EditPriceVariant = {
      id: editingId || `new-${Date.now()}`,
      variantName: formData.variantName,
      minPax: formData.minPax,
      maxPax: formData.maxPax ?? null,
      pricePerPax: formData.pricePerPax ?? null,
      flatPrice: formData.flatPrice ?? null,
      isDefault: editingId ? data.find((v) => v.id === editingId)?.isDefault || false : data.length === 0,
    };

    let updated: EditPriceVariant[];
    if (editingId) {
      updated = data.map((v) => (v.id === editingId ? newVariant : v));
    } else {
      // Only one default allowed
      if (newVariant.isDefault) {
        updated = [...data.map((v) => ({ ...v, isDefault: false })), newVariant];
      } else {
        updated = [...data, newVariant];
      }
    }

    onUpdate(updated);
    setShowAddForm(false);
    setEditingId(undefined);
    setFormData({
      variantName: "",
      minPax: 1,
      maxPax: null,
      pricePerPax: null,
      flatPrice: null,
      isDefault: false,
    });
  }, [formData, editingId, data, onUpdate]);

  const handleEdit = useCallback((variant: EditPriceVariant) => {
    setFormData(variant);
    setEditingId(variant.id);
    setShowAddForm(true);
  }, []);

  const handleDelete = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      onUpdate(data.filter((v) => v.id !== id));
    },
    [data, onUpdate]
  );

  const handleSetDefault = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      onUpdate(
        data.map((v) => ({
          ...v,
          isDefault: v.id === id,
        }))
      );
    },
    [data, onUpdate]
  );

  const pricingErrors = getPricingErrors();

  return (
    <div className="border rounded-2xl p-6 bg-surface">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-daet-ink">Price Variants</h2>
        {canAddVariants && (
          <button
            type="button"
            onClick={() => {
              setShowAddForm(true);
              setFormData({
                variantName: "",
                minPax: 1,
                maxPax: null,
                pricePerPax: null,
                flatPrice: null,
                isDefault: data.length === 0,
              });
            }}
            disabled={loading}
            className="px-4 py-2 bg-daet-forest text-white rounded-2xl text-sm font-medium hover:bg-daet-leaf transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Variant
          </button>
        )}
      </div>

      {/* Variants Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-daet-ink/20 bg-canvas">
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Variant Name</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Min Pax</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Max Pax</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Price</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Default</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-daet-ink/10">
            {data.map((variant) => (
              <tr key={variant.id} className="hover:bg-canvas">
                <td className="px-4 py-3 text-daet-ink">{variant.variantName}</td>
                <td className="px-4 py-3 text-daet-ink/80">{variant.minPax}</td>
                <td className="px-4 py-3 text-daet-ink/80">{variant.maxPax || "Unlimited"}</td>
                <td className="px-4 py-3 text-daet-ink/80">
                  {variant.pricePerPax ? `${formatPeso(variant.pricePerPax)}/pax` : formatPeso(variant.flatPrice)}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Default price option: ${variant.variantName}`}
                    checked={variant.isDefault}
                    onChange={() => handleSetDefault(variant.id)}
                    disabled={!canEditVariants || loading}
                    className="w-4 h-4 rounded-2xl border-daet-ink/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-4 py-3 space-x-2">
                  {canEditVariants && (
                    <button
                      type="button"
                      onClick={() => handleEdit(variant)}
                      disabled={loading}
                      className="text-daet-leaf dark:text-blue-300 hover:text-daet-leaf dark:hover:text-blue-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Edit
                    </button>
                  )}
                  {canRemoveVariants && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm({ title: "Delete this variant? This action cannot be undone.", confirmLabel: "Delete" })) {
                          handleDelete(variant.id);
                        }
                      }}
                      disabled={loading}
                      className="text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.length === 0 && (
          <div className="text-center py-8 text-daet-ink/70">
            <p>No price variants yet. Add one to get started.</p>
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {Object.keys(pricingErrors).length > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl text-sm text-red-800 dark:text-red-300">
          <p className="font-medium">Pricing errors:</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(pricingErrors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card-edge bg-surface rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-daet-ink mb-4">
              {editingId ? "Edit Variant" : "Add Variant"}
            </h3>

            <div className="space-y-4">
              {/* Variant Name */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Variant Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.variantName || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, variantName: e.target.value })
                  }
                  maxLength={EDIT_LIMITS.variantName.max}
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                  placeholder="e.g., Early Bird"
                />
              </div>

              {/* Min Pax */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Min Participants <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={EDIT_LIMITS.pax.min}
                  max={EDIT_LIMITS.pax.max}
                  value={formData.minPax || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, minPax: parseInt(e.target.value) || 1 })
                  }
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                />
              </div>

              {/* Max Pax */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Max Participants
                </label>
                <input
                  type="number"
                  min={formData.minPax || 1}
                  max={EDIT_LIMITS.pax.max}
                  value={formData.maxPax || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, maxPax: e.target.value ? parseInt(e.target.value) : null })
                  }
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                  placeholder="Leave blank for unlimited"
                />
              </div>

              {/* Price per Pax */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Price per Person
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={EDIT_LIMITS.price.min}
                  max={EDIT_LIMITS.price.max}
                  value={formData.pricePerPax || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, pricePerPax: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                  placeholder="e.g., 1500"
                />
              </div>

              {/* Flat Price */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Flat Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={EDIT_LIMITS.price.min}
                  max={EDIT_LIMITS.price.max}
                  value={formData.flatPrice || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, flatPrice: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                  placeholder="e.g., 5000"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingId(undefined);
                  }}
                  className="flex-1 px-4 py-2 border border-daet-ink/20 text-daet-ink/80 rounded-2xl hover:bg-canvas transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="min-h-11 flex-1 px-4 py-2 bg-daet-forest text-white rounded-2xl hover:bg-daet-leaf transition"
                >
                  {editingId ? "Update" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help text */}
      {!canAddVariants && (
        <div className="mt-4 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-sm text-blue-900 dark:text-blue-300">
          ℹ️ Price variants cannot be modified for this package status.
        </div>
      )}
    </div>
  );
}
