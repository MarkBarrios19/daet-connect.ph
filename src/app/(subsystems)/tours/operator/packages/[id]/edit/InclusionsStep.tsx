"use client";

import { Field, Textarea } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";
import React, { useCallback, useState } from "react";
import { useFeedback } from "@/components/ui/feedback";
import type { EditInclusion, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { EDIT_LIMITS } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { withDisplayOrder } from "./edit-order";

type InclusionsStepProps = StepProps<EditInclusion[]>;

/**
 * InclusionsStep Component
 *
 * Manages inclusions/exclusions with:
 * - Separate sections for inclusions and exclusions
 * - Add item form/modal
 * - Edit item functionality
 * - Delete item with confirmation
 * - Toggle between included/excluded
 * - Reorder functionality
 */
export function InclusionsStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
}: InclusionsStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const { toast, confirm } = useFeedback();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [formData, setFormData] = useState<{ text: string; isIncluded: boolean }>({
    text: "",
    isIncluded: true,
  });

  const canEditItems = permissions.inclusions.editText;
  const canRemoveItems = permissions.inclusions.remove;
  const canToggleIncluded = permissions.inclusions.toggleIncluded;

  const inclusions = data.filter((i) => i.isIncluded);
  const exclusions = data.filter((i) => !i.isIncluded);
  const canAddItems = permissions.inclusions.add;

  const getInclusionErrors = useCallback(() => {
    const stepErrors: Record<string, string> = {};
    Object.entries(errors).forEach(([key, value]) => {
      if (key.startsWith("inclusions")) {
        stepErrors[key] = value;
      }
    });
    return stepErrors;
  }, [errors]);

  const handleAddItem = useCallback(() => {
    if (!formData.text.trim()) {
      return;
    }
    if (!editingId && !canAddItems) return;

    const newItem: EditInclusion = {
      id: editingId || `new-${Date.now()}`,
      text: formData.text,
      isIncluded: formData.isIncluded,
      displayOrder: editingId
        ? data.find((i) => i.id === editingId)?.displayOrder ?? data.length + 1
        : data.length + 1,
    };

    let updated: EditInclusion[];
    if (editingId) {
      updated = data.map((i) => (i.id === editingId ? newItem : i));
    } else {
      updated = [...data, newItem];
    }

    onUpdate(withDisplayOrder(updated));
    setShowAddForm(false);
    setEditingId(undefined);
    setFormData({ text: "", isIncluded: true });
  }, [formData, editingId, data, onUpdate, canAddItems]);

  const handleEdit = useCallback((item: EditInclusion) => {
    setFormData({ text: item.text, isIncluded: item.isIncluded });
    setEditingId(item.id);
    setShowAddForm(true);
  }, []);

  const handleDelete = useCallback(
    (id: string | undefined) => {
      if (!id || data.filter((i) => i.isIncluded).length <= 1) {
        toast("At least one inclusion is required.", "error");
        return;
      }
      onUpdate(withDisplayOrder(data.filter((i) => i.id !== id)));
    },
    [data, onUpdate]
  );

  const handleToggle = useCallback(
    (id: string | undefined) => {
      if (!id || !canToggleIncluded) return;
      onUpdate(
        data.map((i) =>
          i.id === id ? { ...i, isIncluded: !i.isIncluded } : i
        )
      );
    },
    [data, onUpdate, canToggleIncluded]
  );

  const handleReorder = useCallback(
    (items: EditInclusion[], direction: "up" | "down", index: number) => {
      if (direction === "up" && index === 0) return;
      if (direction === "down" && index === items.length - 1) return;

      const newItems = [...items];
      const [removed] = newItems.splice(index, 1);
      newItems.splice(direction === "up" ? index - 1 : index + 1, 0, removed);

      // Merge back with the other group, then number the whole list 1..n
      const merged = [
        ...newItems.map((item) => ({ ...item, isIncluded: items[0]?.isIncluded })),
        ...data.filter((i) => i.isIncluded !== items[0]?.isIncluded),
      ];

      onUpdate(withDisplayOrder(merged));
    },
    [data, onUpdate]
  );

  const inclusionErrors = getInclusionErrors();

  return (
    <div className="border rounded-2xl p-6 bg-surface">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-daet-ink">Inclusions & Exclusions</h2>
        {canAddItems && (
          <button
            type="button"
            onClick={() => {
              setShowAddForm(true);
              setFormData({ text: "", isIncluded: true });
            }}
            disabled={loading}
            className="px-4 py-2 bg-daet-forest text-white rounded-2xl text-sm font-medium hover:bg-daet-leaf transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Inclusions Section */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-daet-ink/80 mb-3 flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-green-100 dark:bg-green-900/40 border-2 border-green-500 flex items-center justify-center text-xs text-green-600 dark:text-green-300 font-bold">✓</span>
          Included ({inclusions.length})
        </h3>

        {inclusions.length > 0 ? (
          <div className="space-y-2">
            {inclusions.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/40 rounded-2xl hover:bg-green-100 dark:hover:bg-green-900/40 transition"
              >
                <span className="text-sm font-medium text-green-700 dark:text-green-300 min-w-4">{index + 1}.</span>
                {canEditItems && editingId !== item.id ? (
                  <span className="flex-1 text-daet-ink">{item.text}</span>
                ) : (
                  <input
                    type="text"
                    value={item.text}
                    onChange={() => {}}
                    aria-label={`Item ${index + 1}`}
                    className="flex-1 px-2 py-1 border border-daet-ink/20 rounded-2xl bg-surface"
                    disabled
                  />
                )}
                <div className="flex items-center gap-1">
                  {permissions.inclusions.reorder && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReorder(inclusions, "up", index)}
                        disabled={index === 0 || loading}
                        className="p-1 hover:bg-green-200 dark:hover:bg-green-800/60 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <svg className="w-4 h-4 text-daet-ink/80" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder(inclusions, "down", index)}
                        disabled={index === inclusions.length - 1 || loading}
                        className="p-1 hover:bg-green-200 dark:hover:bg-green-800/60 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <svg className="w-4 h-4 text-daet-ink/80" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </>
                  )}
                  {canEditItems && (
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      disabled={loading}
                      className="text-daet-leaf dark:text-blue-300 hover:text-daet-leaf dark:hover:text-blue-300 text-xs font-medium disabled:opacity-50"
                    >
                      Edit
                    </button>
                  )}
                  {canRemoveItems && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm({ title: "Delete this item?", confirmLabel: "Delete" })) {
                          handleDelete(item.id);
                        }
                      }}
                      disabled={loading}
                      className="text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300 text-xs font-medium disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-daet-ink/70 text-sm p-3 bg-canvas rounded-2xl">No inclusions yet.</p>
        )}
      </div>

      {/* Exclusions Section */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-daet-ink/80 mb-3 flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/40 border-2 border-red-500 flex items-center justify-center text-xs text-red-700 dark:text-red-300 font-bold">✕</span>
          Excluded ({exclusions.length})
        </h3>

        {exclusions.length > 0 ? (
          <div className="space-y-2">
            {exclusions.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/40 transition"
              >
                <span className="text-sm font-medium text-red-700 dark:text-red-300 min-w-4">{index + 1}.</span>
                <span className="flex-1 text-daet-ink line-through">{item.text}</span>
                <div className="flex items-center gap-1">
                  {canToggleIncluded && (
                    <button
                      type="button"
                      onClick={() => handleToggle(item.id)}
                      disabled={loading}
                      className="text-green-600 dark:text-green-300 hover:text-green-800 dark:hover:text-green-300 text-xs font-medium disabled:opacity-50"
                    >
                      Include
                    </button>
                  )}
                  {canRemoveItems && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm({ title: "Delete this item?", confirmLabel: "Delete" })) {
                          handleDelete(item.id);
                        }
                      }}
                      disabled={loading}
                      className="text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-300 text-xs font-medium disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-daet-ink/70 text-sm p-3 bg-canvas rounded-2xl">No exclusions yet.</p>
        )}
      </div>

      {/* Validation Errors */}
      {Object.keys(inclusionErrors).length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl text-sm text-red-800 dark:text-red-300">
          <p className="font-medium">Inclusion errors:</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(inclusionErrors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card-edge bg-surface rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-daet-ink mb-4">
              {editingId ? "Edit Item" : "Add Item"}
            </h3>

            <div className="space-y-4">
              <Field id="inc-description" label="Description" required hint={`${formData.text.length}/${EDIT_LIMITS.inclusionText.max}`}>
                <Textarea
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  maxLength={EDIT_LIMITS.inclusionText.max}
                  rows={3}
                  className="resize-none"
                  placeholder="e.g., Hotel accommodation"
                />
              </Field>

              {/* Is Included Toggle */}
              <fieldset>
                <legend className="mb-2 block text-sm font-bold text-daet-ink">Status</legend>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={formData.isIncluded}
                      onChange={() => setFormData({ ...formData, isIncluded: true })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-daet-ink/80">Included</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!formData.isIncluded}
                      onChange={() => setFormData({ ...formData, isIncluded: false })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-daet-ink/80">Excluded</span>
                  </label>
                </div>
              </fieldset>

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
                  onClick={handleAddItem}
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
      {inclusions.length === 0 && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-950/40 rounded-2xl text-sm text-yellow-800 dark:text-yellow-200">
          <LineIcon name="warning" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />{" "}
          At least one item marked Included is required before saving.
        </div>
      )}
    </div>
  );
}
