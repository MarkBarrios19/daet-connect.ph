"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { PackageDraft } from "../package-types";

interface PackageBasicDetailsStepProps {
  data: PackageDraft;
  onComplete: (data: Partial<PackageDraft>) => void;
  loading: boolean;
}

export function PackageBasicDetailsStep({
  data,
  onComplete,
  loading,
}: PackageBasicDetailsStepProps) {
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(data.description || "");
  const [locationName, setLocationName] = useState(data.locationName);
  const [durationValue, setDurationValue] = useState(data.durationValue);
  const [durationType, setDurationType] = useState<"hours" | "days">(data.durationType);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = "Package title is required";
    } else if (title.length < 5) {
      newErrors.title = "Title must be at least 5 characters";
    }

    if (!locationName.trim()) {
      newErrors.locationName = "Location is required";
    }

    if (durationValue <= 0) {
      newErrors.durationValue = "Duration must be greater than 0";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    onComplete({
      title: title.trim(),
      description: description.trim() || null,
      locationName: locationName.trim(),
      durationValue,
      durationType,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-daet-ink">Basic details</h2>
        <p className="mt-2 text-sm text-daet-ink/65">
          Start with the essentials — name your tour package and describe what makes it special.
        </p>
      </div>

      <Field id="title" label="Package title" required error={errors.title}>
        <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Bagasbas Beach Sunset Tour" maxLength={160} />
      </Field>

      <Field id="description" label="Description" hint={`${description.length}/2000 characters`}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what tourists will experience on this tour..." rows={5} maxLength={2000} />
      </Field>

      <Field id="locationName" label="Location" required error={errors.locationName}>
        <Input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="e.g., Bagasbas Beach, Daet" maxLength={200} />
      </Field>

      <fieldset>
        <legend className="block text-sm font-bold text-daet-ink">
          Duration <span className="text-red-600 dark:text-red-300" aria-hidden="true">*</span>
        </legend>
        <div className="mt-1 flex gap-3">
          <Input
            type="number"
            inputMode="numeric"
            aria-label="Duration length"
            aria-required="true"
            aria-describedby={errors.durationValue ? "durationValue-error" : undefined}
            value={durationValue}
            onChange={(e) => setDurationValue(Number(e.target.value))}
            min={1}
            max={365}
            invalid={Boolean(errors.durationValue)}
            className="mt-0 w-24"
          />
          <Select aria-label="Duration unit" value={durationType} onChange={(e) => setDurationType(e.target.value as "hours" | "days")} className="mt-0 flex-1">
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </Select>
        </div>
        {errors.durationValue && (
          <p id="durationValue-error" role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
            {errors.durationValue}
          </p>
        )}
      </fieldset>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-daet-ink/10 pt-6">
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
