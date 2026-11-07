"use client";

import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SectionCard } from "@/components/ui/section-card";
import { useId, useState } from "react";
import type { BasicDetailsData, EditPackageStatus, ValidationErrors } from "./edit-types";
import { EDIT_LIMITS } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { validateBasicInfo } from "./validation";

interface BasicDetailsStepProps {
  data: BasicDetailsData;
  originalData: BasicDetailsData;
  packageStatus: EditPackageStatus;
  onUpdate: (data: BasicDetailsData) => void;
  errors: ValidationErrors;
  loading: boolean;
  /** The section's DOM id, so the section navigation can link to it. */
  id?: string;
  /** This section has unsaved changes. */
  dirty?: boolean;
}

/** "3 days" / "1.5 hours" — what the operator set, said back to them. */
export function describeDuration(value: number, type: "hours" | "days"): string {
  const unit = type === "days" ? (value === 1 ? "day" : "days") : value === 1 ? "hour" : "hours";
  return `${value} ${unit}`;
}

/**
 * BasicDetailsStep — the "Basics" section.
 *
 * Text edits in place in the summary card: the title, where the tour is, how
 * long it takes and the description, with labels, hints, counters and errors
 * wired through the shared Field kit. A field is checked when it loses focus,
 * not on every keystroke, so a half-typed title is not shouted at.
 *
 * Read-only statuses (in review, archived) show the values as text with one
 * line saying why, instead of a greyed-out input that looks broken.
 */
export function BasicDetailsStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
  id = "basics-section",
  dirty = false,
}: BasicDetailsStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const fieldId = useId();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const isReadOnly = !permissions.canEdit;

  // Client-side checks join the server's: whichever has something to say wins,
  // and only for fields the person has left or a save has already tried.
  const local = validateBasicInfo(data).errors;
  const errorFor = (field: keyof ValidationErrors) =>
    errors[field] ?? (touched[field] ? local[field] : null);

  const set = <K extends keyof BasicDetailsData>(field: K, value: BasicDetailsData[K]) => {
    onUpdate({ ...data, [field]: value });
  };

  const summary = `${describeDuration(data.durationValue, data.durationType)} · ${data.locationName || "No place yet"}`;

  if (isReadOnly) {
    return (
      <SectionCard id={id} title="Basics" summary={summary} dirty={dirty}>
        <div className="space-y-3 text-sm">
          <p className="text-daet-ink">
            <span className="block font-bold">Title</span>
            {data.title}
          </p>
          <p className="text-daet-ink">
            <span className="block font-bold">Where</span>
            {data.locationName}
          </p>
          <p className="text-daet-ink">
            <span className="block font-bold">How long</span>
            {describeDuration(data.durationValue, data.durationType)}
          </p>
          {data.description ? <p className="text-daet-ink">{data.description}</p> : null}
          <p className="rounded-2xl bg-blue-50 p-3 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            {permissions.readOnlyReason ?? "This package cannot be edited right now."}
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard id={id} title="Basics" summary={summary} dirty={dirty}>
      <div className="space-y-4">
        <Field
          id={`${fieldId}-title`}
          label="Package title"
          required
          hint={`${data.title.length}/${EDIT_LIMITS.title.max}`}
          error={errorFor("title")}
        >
          <Input
            value={data.title}
            onChange={(event) => set("title", event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, title: true }))}
            disabled={!permissions.basic.title || loading}
            maxLength={EDIT_LIMITS.title.max}
            autoComplete="off"
          />
        </Field>

        <Field
          id={`${fieldId}-location`}
          label="Where is it?"
          required
          error={errorFor("locationName")}
        >
          <Input
            value={data.locationName}
            onChange={(event) => set("locationName", event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, locationName: true }))}
            disabled={!permissions.basic.locationName || loading}
            maxLength={EDIT_LIMITS.locationName.max}
            placeholder="Bagasbas Beach, Daet"
            autoComplete="off"
          />
        </Field>

        <Field
          id={`${fieldId}-description`}
          label="Description"
          hint={`${(data.description ?? "").length}/${EDIT_LIMITS.description.max}`}
          error={errorFor("description")}
        >
          <Textarea
            value={data.description ?? ""}
            onChange={(event) => set("description", event.target.value || null)}
            onBlur={() => setTouched((current) => ({ ...current, description: true }))}
            disabled={!permissions.basic.description || loading}
            maxLength={EDIT_LIMITS.description.max}
            rows={3}
            className="resize-y"
            placeholder="What the morning looks like, who it is for, what to bring."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            id={`${fieldId}-duration-value`}
            label="How long"
            required
            error={errorFor("durationValue")}
          >
            <Input
              type="number"
              inputMode="decimal"
              step="0.5"
              min={EDIT_LIMITS.duration.min}
              max={EDIT_LIMITS.duration.max}
              value={data.durationValue}
              onChange={(event) => set("durationValue", parseFloat(event.target.value) || 0)}
              onBlur={() => setTouched((current) => ({ ...current, durationValue: true }))}
              disabled={!permissions.basic.durationValue || loading}
            />
          </Field>
          <Field id={`${fieldId}-duration-type`} label="Unit" error={errorFor("durationType")}>
            <Select
              value={data.durationType}
              onChange={(event) => set("durationType", event.target.value as "hours" | "days")}
              disabled={!permissions.basic.durationType || loading}
            >
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </Select>
          </Field>
        </div>
        <p className="text-sm text-daet-ink/70">{describeDuration(data.durationValue, data.durationType)}</p>
      </div>
    </SectionCard>
  );
}
