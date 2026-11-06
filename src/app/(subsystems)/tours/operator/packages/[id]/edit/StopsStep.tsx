"use client";

import { LocationPicker } from "@/components/maps/location-picker";
import { LineIcon } from "@/components/ui/icons";
import React, { useCallback, useState } from "react";
import { useFeedback } from "@/components/ui/feedback";
import type { EditStop, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { EDIT_LIMITS, DEFAULT_COORDINATES } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { withStopOrder } from "./edit-order";

type StopsStepProps = StepProps<EditStop[]>;

/**
 * StopsStep Component
 *
 * Manages tour stops with:
 * - Table display of existing stops sorted by stop_order
 * - Add stop form/modal
 * - Edit stop functionality
 * - Delete stop with confirmation
 * - Reorder functionality
 */
export function StopsStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
}: StopsStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const { toast, confirm } = useFeedback();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [formData, setFormData] = useState<Partial<EditStop>>({
    locationName: "",
    description: "",
    latitude: DEFAULT_COORDINATES.latitude,
    longitude: DEFAULT_COORDINATES.longitude,
    estimatedDurationMinutes: null,
  });

  // Published packages normally can't add stops, but one with none would be
  // stuck on "at least one stop is required", so allow adding in that case.
  const canAddStops =
    permissions.stops.add ||
    (packageStatus === "published" && originalData.length === 0);
  const canEditStops = permissions.stops.editDetails;
  const canRemoveStops = permissions.stops.remove;

  // Get stops errors
  const getStopsErrors = useCallback(() => {
    const stepErrors: Record<string, string> = {};
    Object.entries(errors).forEach(([key, value]) => {
      if (key.startsWith("stops")) {
        stepErrors[key] = value;
      }
    });
    return stepErrors;
  }, [errors]);

  const sortedStops = [...data].sort((a, b) => a.stopOrder - b.stopOrder);

  const handleAddStop = useCallback(() => {
    if (
      !formData.locationName?.trim() ||
      formData.latitude === undefined ||
      formData.longitude === undefined
    ) {
      return;
    }

    const newStop: EditStop = {
      id: editingId || `new-${Date.now()}`,
      locationName: formData.locationName,
      description: formData.description || null,
      latitude: formData.latitude,
      longitude: formData.longitude,
      estimatedDurationMinutes: formData.estimatedDurationMinutes ?? null,
      stopOrder: editingId
        ? data.find((s) => s.id === editingId)?.stopOrder ?? data.length + 1
        : data.length + 1,
    };

    let updated: EditStop[];
    if (editingId) {
      updated = data.map((s) => (s.id === editingId ? newStop : s));
    } else {
      updated = [...data, newStop];
    }

    onUpdate(withStopOrder(updated));
    setShowAddForm(false);
    setEditingId(undefined);
    setFormData({
      locationName: "",
      description: "",
      latitude: DEFAULT_COORDINATES.latitude,
      longitude: DEFAULT_COORDINATES.longitude,
      estimatedDurationMinutes: null,
    });
  }, [formData, editingId, data, onUpdate]);

  const handleEdit = useCallback((stop: EditStop) => {
    setFormData(stop);
    setEditingId(stop.id);
    setShowAddForm(true);
  }, []);

  const handleDelete = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      if (data.length <= 1) {
        toast("At least one stop is required.", "error");
        return;
      }
      onUpdate(withStopOrder(data.filter((s) => s.id !== id)));
    },
    [data, onUpdate]
  );

  const handleReorder = useCallback(
    (direction: "up" | "down", index: number) => {
      if (direction === "up" && index === 0) return;
      if (direction === "down" && index === sortedStops.length - 1) return;

      const newOrder = [...sortedStops];
      const [removed] = newOrder.splice(index, 1);
      newOrder.splice(direction === "up" ? index - 1 : index + 1, 0, removed);

      onUpdate(withStopOrder(newOrder));
    },
    [sortedStops, onUpdate]
  );

  const stopsErrors = getStopsErrors();

  return (
    <div className="border rounded-2xl p-6 bg-surface">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-daet-ink">Tour Stops</h2>
        {canAddStops && (
          <button
            type="button"
            onClick={() => {
              setShowAddForm(true);
              setFormData({
                locationName: "",
                description: "",
                latitude: DEFAULT_COORDINATES.latitude,
                longitude: DEFAULT_COORDINATES.longitude,
                estimatedDurationMinutes: null,
              });
            }}
            disabled={loading}
            className="px-4 py-2 bg-daet-forest text-white rounded-2xl text-sm font-medium hover:bg-daet-leaf transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Stop
          </button>
        )}
      </div>

      {/* Stops Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-daet-ink/20 bg-canvas">
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">#</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Location</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Description</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Coordinates</th>
              <th className="px-4 py-2 text-left font-bold text-daet-ink/80">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-daet-ink/10">
            {sortedStops.map((stop, index) => (
              <tr key={stop.id} className="hover:bg-canvas">
                <td className="px-4 py-3 text-daet-ink font-medium">{index + 1}</td>
                <td className="px-4 py-3 text-daet-ink">{stop.locationName}</td>
                <td className="px-4 py-3 text-daet-ink/80">
                  {stop.description ? stop.description.substring(0, 50) + (stop.description.length > 50 ? "..." : "") : "-"}
                </td>
                <td className="px-4 py-3 text-daet-ink/80 text-xs font-mono">
                  {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                </td>
                <td className="px-4 py-3 space-x-2">
                  {permissions.stops.reorder && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReorder("up", index)}
                        disabled={index === 0 || loading}
                        className="text-daet-ink/80 hover:text-daet-ink disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <svg className="w-4 h-4 inline" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder("down", index)}
                        disabled={index === sortedStops.length - 1 || loading}
                        className="text-daet-ink/80 hover:text-daet-ink disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <svg className="w-4 h-4 inline" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </>
                  )}
                  {canEditStops && (
                    <button
                      type="button"
                      onClick={() => handleEdit(stop)}
                      disabled={loading}
                      className="text-daet-leaf dark:text-blue-300 hover:text-daet-leaf dark:hover:text-blue-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Edit
                    </button>
                  )}
                  {canRemoveStops && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm({ title: "Delete this stop? This action cannot be undone.", confirmLabel: "Delete" })) {
                          handleDelete(stop.id);
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
            <p>No stops yet. Add one to get started.</p>
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {Object.keys(stopsErrors).length > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl text-sm text-red-800 dark:text-red-300">
          <p className="font-medium">Stop errors:</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(stopsErrors).map(([key, message]) => (
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
              {editingId ? "Edit Stop" : "Add Stop"}
            </h3>

            <div className="space-y-4">
              {/* Location Name */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Location <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.locationName || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, locationName: e.target.value })
                  }
                  maxLength={EDIT_LIMITS.stopLocation.max}
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                  placeholder="e.g., Taal Volcano"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value || null })
                  }
                  maxLength={EDIT_LIMITS.stopDescription.max}
                  rows={3}
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none resize-none"
                  placeholder="Optional description of the stop"
                />
              </div>

              {/* Pick the spot on a map; the numbers stay available underneath. */}
              <div>
                <p className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Where is it? <span className="text-red-500">*</span>
                </p>
                <LocationPicker
                  latitude={formData.latitude ?? null}
                  longitude={formData.longitude ?? null}
                  onChange={(latitude, longitude, placeName) =>
                    setFormData((current) => ({
                      ...current,
                      latitude,
                      longitude,
                      locationName: placeName && !current.locationName?.trim() ? placeName.slice(0, EDIT_LIMITS.stopLocation.max) : current.locationName,
                    }))
                  }
                />
              </div>

              <details className="rounded-2xl border border-daet-ink/15 px-3 py-2">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-daet-ink/80">Enter coordinates yourself</summary>
                <div className="space-y-4 pb-2">
                  {/* Latitude */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Latitude <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min={-90}
                  max={90}
                  value={formData.latitude ?? ""}
                  onChange={(e) =>
                    setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                  placeholder="e.g., 14.1122"
                />
              </div>

              {/* Longitude */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Longitude <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min={-180}
                  max={180}
                  value={formData.longitude ?? ""}
                  onChange={(e) =>
                    setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                  placeholder="e.g., 122.9553"
                />
              </div>

                </div>
              </details>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-daet-ink/80 mb-1">
                  Estimated Duration (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={formData.estimatedDurationMinutes ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      estimatedDurationMinutes: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 outline-none"
                  placeholder="e.g., 60"
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
                  onClick={handleAddStop}
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
      {data.length === 0 && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/40 rounded-2xl text-sm text-yellow-800 dark:text-yellow-200">
          <LineIcon name="warning" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> At least one stop is required before submitting for review.
        </div>
      )}
    </div>
  );
}
