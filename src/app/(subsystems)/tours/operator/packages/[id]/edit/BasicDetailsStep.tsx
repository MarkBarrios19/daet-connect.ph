"use client";

import React, { useCallback } from "react";
import type { BasicDetailsData, EditPackageStatus, ValidationErrors } from "./edit-types";
import { EDIT_LIMITS } from "./edit-constants";
import { getEditPermissions } from "./permissions";

interface BasicDetailsStepProps {
  data: BasicDetailsData;
  originalData: BasicDetailsData;
  packageStatus: EditPackageStatus;
  onUpdate: (data: BasicDetailsData) => void;
  errors: ValidationErrors;
  loading: boolean;
}

/**
 * BasicDetailsStep Component
 *
 * Renders form fields for:
 * - title (3-150 chars)
 * - location_name (2-100 chars)
 * - description (10-3000 chars, optional)
 * - duration_value (0.5-365)
 * - duration_type (hours/days)
 *
 * Applies status-based field disabling per design.
 */
export function BasicDetailsStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
}: BasicDetailsStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const isReadOnly = !permissions.canEdit;

  const handleTitleChange = useCallback(
    (value: string) => {
      onUpdate({
        ...data,
        title: value,
      });
    },
    [data, onUpdate]
  );

  const handleLocationChange = useCallback(
    (value: string) => {
      onUpdate({
        ...data,
        locationName: value,
      });
    },
    [data, onUpdate]
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      onUpdate({
        ...data,
        description: value || null,
      });
    },
    [data, onUpdate]
  );

  const handleDurationValueChange = useCallback(
    (value: number) => {
      onUpdate({
        ...data,
        durationValue: value,
      });
    },
    [data, onUpdate]
  );

  const handleDurationTypeChange = useCallback(
    (value: "hours" | "days") => {
      onUpdate({
        ...data,
        durationType: value,
      });
    },
    [data, onUpdate]
  );

  const getTitleError = () => {
    const titleError = errors["title"];
    if (!titleError) return null;

    if (titleError.includes("required")) return "Title is required";
    if (titleError.includes("least")) return `Title must be at least ${EDIT_LIMITS.title.min} characters`;
    if (titleError.includes("most")) return `Title must be at most ${EDIT_LIMITS.title.max} characters`;
    return titleError;
  };

  const getLocationError = () => {
    const locationError = errors["locationName"];
    if (!locationError) return null;

    if (locationError.includes("required")) return "Location is required";
    if (locationError.includes("least")) return `Location must be at least ${EDIT_LIMITS.locationName.min} characters`;
    if (locationError.includes("most")) return `Location must be at most ${EDIT_LIMITS.locationName.max} characters`;
    return locationError;
  };

  const getDescriptionError = () => {
    const descriptionError = errors["description"];
    if (!descriptionError) return null;

    if (descriptionError.includes("least")) return `Description must be at least ${EDIT_LIMITS.description.min} characters`;
    if (descriptionError.includes("most")) return `Description must be at most ${EDIT_LIMITS.description.max} characters`;
    return descriptionError;
  };

  const getDurationError = () => {
    const durationError = errors["durationValue"];
    if (!durationError) return null;

    if (durationError.includes("required")) return "Duration is required";
    if (durationError.includes("least")) return `Duration must be at least ${EDIT_LIMITS.duration.min} ${data.durationType}`;
    if (durationError.includes("most")) return `Duration must be at most ${EDIT_LIMITS.duration.max} ${data.durationType}`;
    return durationError;
  };

  const titleError = getTitleError();
  const locationError = getLocationError();
  const descriptionError = getDescriptionError();
  const durationError = getDurationError();

  return (
    <div className="border rounded-2xl p-6 bg-surface">
      <h2 className="text-xl font-bold text-daet-ink mb-6">Basic Details</h2>

      <div className="space-y-6">
        {/* Title Field */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-daet-ink/80 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="title"
              type="text"
              value={data.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              disabled={isReadOnly || !permissions.basic.title || loading}
              maxLength={EDIT_LIMITS.title.max}
              className={`w-full px-4 py-2 border rounded-2xl focus:ring-2 focus:ring-daet-forest/30 focus:border-transparent outline-none transition ${
                titleError ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40" : "border-daet-ink/20"
              } disabled:bg-muted disabled:text-daet-ink/70 disabled:cursor-not-allowed`}
              placeholder="Enter package title"
            />
            <div className="absolute right-3 top-2.5 text-sm text-slate-600 dark:text-slate-400">
              {data.title.length}/{EDIT_LIMITS.title.max}
            </div>
          </div>
          {titleError && <p role="alert" className="text-red-700 dark:text-red-300 text-sm mt-1">{titleError}</p>}
        </div>

        {/* Location Field */}
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-daet-ink/80 mb-1">
            Location <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="location"
              type="text"
              value={data.locationName}
              onChange={(e) => handleLocationChange(e.target.value)}
              disabled={isReadOnly || !permissions.basic.locationName || loading}
              maxLength={EDIT_LIMITS.locationName.max}
              className={`w-full px-4 py-2 border rounded-2xl focus:ring-2 focus:ring-daet-forest/30 focus:border-transparent outline-none transition ${
                locationError ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40" : "border-daet-ink/20"
              } disabled:bg-muted disabled:text-daet-ink/70 disabled:cursor-not-allowed`}
              placeholder="Enter location"
            />
            <div className="absolute right-3 top-2.5 text-sm text-slate-600 dark:text-slate-400">
              {data.locationName.length}/{EDIT_LIMITS.locationName.max}
            </div>
          </div>
          {locationError && <p role="alert" className="text-red-700 dark:text-red-300 text-sm mt-1">{locationError}</p>}
        </div>

        {/* Description Field */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-daet-ink/80 mb-1">
            Description
          </label>
          <div className="relative">
            <textarea
              id="description"
              value={data.description ?? ""}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              disabled={isReadOnly || !permissions.basic.description || loading}
              maxLength={EDIT_LIMITS.description.max}
              rows={5}
              className={`w-full px-4 py-2 border rounded-2xl focus:ring-2 focus:ring-daet-forest/30 focus:border-transparent outline-none transition resize-none ${
                descriptionError ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40" : "border-daet-ink/20"
              } disabled:bg-muted disabled:text-daet-ink/70 disabled:cursor-not-allowed`}
              placeholder="Enter package description (optional)"
            />
            <div className="absolute right-3 bottom-2.5 text-sm text-slate-600 dark:text-slate-400">
              {(data.description ?? "").length}/{EDIT_LIMITS.description.max}
            </div>
          </div>
          {descriptionError && <p role="alert" className="text-red-700 dark:text-red-300 text-sm mt-1">{descriptionError}</p>}
        </div>

        {/* Duration Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="duration-value" className="block text-sm font-medium text-daet-ink/80 mb-1">
              Duration <span className="text-red-500">*</span>
            </label>
            <input
              id="duration-value"
              type="number"
              step="0.5"
              min={EDIT_LIMITS.duration.min}
              max={EDIT_LIMITS.duration.max}
              value={data.durationValue}
              onChange={(e) => handleDurationValueChange(parseFloat(e.target.value) || 0)}
              disabled={isReadOnly || !permissions.basic.durationValue || loading}
              className={`w-full px-4 py-2 border rounded-2xl focus:ring-2 focus:ring-daet-forest/30 focus:border-transparent outline-none transition ${
                durationError ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40" : "border-daet-ink/20"
              } disabled:bg-muted disabled:text-daet-ink/70 disabled:cursor-not-allowed`}
              placeholder="e.g., 2.5"
            />
            {durationError && <p role="alert" className="text-red-700 dark:text-red-300 text-sm mt-1">{durationError}</p>}
          </div>

          <div>
            <label htmlFor="duration-type" className="block text-sm font-medium text-daet-ink/80 mb-1">
              Unit <span className="text-red-500">*</span>
            </label>
            <select
              id="duration-type"
              value={data.durationType}
              onChange={(e) => handleDurationTypeChange(e.target.value as "hours" | "days")}
              disabled={isReadOnly || !permissions.basic.durationType || loading}
              className="w-full px-4 py-2 border border-daet-ink/20 rounded-2xl focus:ring-2 focus:ring-daet-forest/30 focus:border-transparent outline-none transition disabled:bg-muted disabled:text-daet-ink/70 disabled:cursor-not-allowed"
            >
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>

        {/* Read-only indicator */}
        {!permissions.canEdit && (
          <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-sm text-blue-900 dark:text-blue-300">
            ℹ️ This package is {packageStatus} and cannot be edited.
          </div>
        )}
      </div>
    </div>
  );
}
