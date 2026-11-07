"use client";

import { CheckboxField, Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { SectionCard } from "@/components/ui/section-card";
import { formatPeso } from "@/lib/money";
import React, { useCallback, useId, useState } from "react";
import type { EditPriceVariant, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { EDIT_LIMITS } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { validateVariant } from "./validation";

type PricingStepProps = StepProps<EditPriceVariant[]>;

const blankVariant = (isDefault: boolean): Partial<EditPriceVariant> => ({
  variantName: "",
  minPax: 1,
  maxPax: null,
  pricePerPax: null,
  flatPrice: null,
  isDefault,
});

/** The price shown on a row: per guest for a per-guest price, the whole price for a flat one. */
function priceLabel(variant: EditPriceVariant): string {
  if (variant.pricePerPax !== null) return `${formatPeso(variant.pricePerPax)} per guest`;
  if (variant.flatPrice !== null) return `${formatPeso(variant.flatPrice)} for the whole group`;
  return "No price yet";
}

function guestLabel(variant: EditPriceVariant): string {
  if (variant.maxPax === null) return `${variant.minPax} or more guests`;
  if (variant.maxPax === variant.minPax) return `${variant.minPax} guests`;
  return `${variant.minPax}–${variant.maxPax} guests`;
}

/**
 * PricingStep
 *
 * Price options as compact rows: the name, how many guests it covers and the
 * price, with one "⋯" menu per row instead of a row of buttons. Adding or
 * editing one opens the shared Modal, which docks to the bottom of a phone's
 * screen and traps focus on any screen. Nothing reaches the server here: Save
 * lives in the sticky bar at the foot of the page.
 *
 * More than four options collapse behind "Show all", so a package with a dozen
 * fares does not bury the sections below it.
 */
export function PricingStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
  id = "prices-section",
  dirty = false,
}: PricingStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [showAll, setShowAll] = useState(false);
  const [formData, setFormData] = useState<Partial<EditPriceVariant>>(blankVariant(false));
  const [formError, setFormError] = useState<string | null>(null);
  const [priceMode, setPriceMode] = useState<"perGuest" | "group">("perGuest");

  const canAddVariants = permissions.pricing.add;
  const canEditVariants = permissions.pricing.editPax;
  const canRemoveVariants = permissions.pricing.remove;

  const pricingErrors = Object.entries(errors).filter(([key]) => key.startsWith("priceVariants"));
  const sectionError = pricingErrors.length
    ? pricingErrors.map(([, message]) => message).join(" ")
    : data.length === 0
      ? "Add at least one price option before this package can be booked."
      : null;

  const startAdd = () => {
    setFormData(blankVariant(data.length === 0));
    setPriceMode("perGuest");
    setEditingId(undefined);
    setFormError(null);
    setOpen(true);
  };

  const startEdit = (variant: EditPriceVariant) => {
    setFormData(variant);
    setPriceMode(variant.flatPrice !== null && variant.pricePerPax === null ? "group" : "perGuest");
    setEditingId(variant.id);
    setFormError(null);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditingId(undefined);
    setFormError(null);
  };

  // Save in the modal applies the change to the form's own state, ready for
  // the page's sticky bar. It does not talk to the server.
  const apply = useCallback(() => {
    const draft: EditPriceVariant = {
      id: editingId ?? `new-${Date.now()}`,
      variantName: (formData.variantName ?? "").trim(),
      minPax: formData.minPax ?? 1,
      maxPax: formData.maxPax ?? null,
      pricePerPax: priceMode === "perGuest" ? (formData.pricePerPax ?? null) : null,
      flatPrice: priceMode === "group" ? (formData.flatPrice ?? null) : null,
      isDefault: Boolean(formData.isDefault),
    };
    // The same rules the server applies, so a bad row never leaves the modal.
    const found = validateVariant(draft);
    const first = Object.values(found)[0];
    if (first) {
      setFormError(first);
      return;
    }

    let updated: EditPriceVariant[];
    if (editingId) {
      updated = data.map((variant) => (variant.id === editingId ? draft : variant));
    } else {
      updated = [...data, draft];
    }
    // Exactly one default: this one if asked for, otherwise the first.
    const wantsDefault = draft.isDefault;
    const alreadyDefault = updated.some((variant) => variant.id !== draft.id && variant.isDefault);
    updated = updated.map((variant) => ({
      ...variant,
      isDefault: wantsDefault ? variant.id === draft.id : alreadyDefault ? variant.isDefault : variant.id === draft.id,
    }));

    onUpdate(updated);
    close();
  }, [data, editingId, formData, onUpdate, priceMode]);

  const remove = (variant: EditPriceVariant) => {
    const remaining = data.filter((item) => item.id !== variant.id);
    // Taking out the default hands it to whatever is left first, so the package
    // still has one price to show.
    const next = remaining.map((item, index) => ({
      ...item,
      isDefault: remaining.some((other) => other.isDefault) ? item.isDefault : index === 0,
    }));
    onUpdate(next);
  };

  const makeDefault = (variant: EditPriceVariant) => {
    onUpdate(data.map((item) => ({ ...item, isDefault: item.id === variant.id })));
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...data];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onUpdate(next);
  };

  const shown = showAll ? data : data.slice(0, 4);
  const hiddenCount = data.length - shown.length;

  return (
    <SectionCard
      id={id}
      title="Prices"
      dirty={dirty}
      summary={
        data.length === 0
          ? "No price options yet."
          : `${data.length} price ${data.length === 1 ? "option" : "options"}${data.length === 1 ? `: ${priceLabel(data[0])}` : ""}.`
      }
      error={sectionError}
      action={
        canAddVariants ? (
          <Button variant="secondary" onClick={startAdd} disabled={loading}>
            Add a price option
          </Button>
        ) : null
      }
    >
      {data.length === 0 ? (
        <p className="text-sm text-daet-ink/75">
          Add at least one price option: how many guests it is for and how much each pays.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((variant, index) => (
            <li key={variant.id ?? variant.variantName} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-daet-ink">
                  {variant.variantName}
                  {variant.isDefault ? (
                    <span className="ml-2 rounded-full bg-muted-strong px-2 py-0.5 text-xs font-bold text-daet-ink">
                      Default
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-daet-ink/75">
                  {guestLabel(variant)} · {priceLabel(variant)}
                </p>
              </div>
              {canEditVariants || canRemoveVariants || permissions.pricing.setDefault ? (
                <RowMenu
                  label={`${variant.variantName} price option`}
                  items={[
                    ...(canEditVariants
                      ? [{ label: "Edit", onSelect: () => startEdit(variant) }]
                      : []),
                    ...(canEditVariants
                      ? [
                          { label: "Move up", onSelect: () => move(index, -1), disabled: index === 0 },
                          {
                            label: "Move down",
                            onSelect: () => move(index, 1),
                            disabled: index === data.length - 1,
                          },
                        ]
                      : []),
                    ...(permissions.pricing.setDefault && !variant.isDefault
                      ? [{ label: "Make default", onSelect: () => makeDefault(variant) }]
                      : []),
                    ...(canRemoveVariants
                      ? [{ label: "Delete", onSelect: () => remove(variant), danger: true }]
                      : []),
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {data.length > 4 ? (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-blue-700 hover:underline dark:text-blue-300"
        >
          {showAll ? "Show fewer" : `Show all ${data.length}`}
          {!showAll && hiddenCount > 0 ? <span className="sr-only"> price options</span> : null}
        </button>
      ) : null}

      <Modal
        open={open}
        onClose={close}
        title={editingId ? "Edit price option" : "Add a price option"}
        description="You'll save everything with the Save button at the foot of the page."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={apply}>{editingId ? "Save price option" : "Add price option"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field id={`${fieldId}-name`} label="What is this price called?" required>
            <Input
              value={formData.variantName ?? ""}
              onChange={(event) => setFormData({ ...formData, variantName: event.target.value })}
              maxLength={EDIT_LIMITS.variantName.max}
              placeholder="Standard, Weekend, Student"
            />
          </Field>

          <fieldset>
            <legend className="block text-sm font-bold text-daet-ink">Who is it for?</legend>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <Field id={`${fieldId}-min`} label="From">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={EDIT_LIMITS.pax.min}
                  max={EDIT_LIMITS.pax.max}
                  value={formData.minPax ?? ""}
                  onChange={(event) =>
                    setFormData({ ...formData, minPax: event.target.value ? parseInt(event.target.value, 10) : 1 })
                  }
                />
              </Field>
              <Field id={`${fieldId}-max`} label="To (guests)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={EDIT_LIMITS.pax.min}
                  max={EDIT_LIMITS.pax.max}
                  value={formData.maxPax ?? ""}
                  disabled={formData.maxPax === null && formData.minPax === 0}
                  onChange={(event) =>
                    setFormData({ ...formData, maxPax: event.target.value ? parseInt(event.target.value, 10) : null })
                  }
                  placeholder="No limit"
                />
              </Field>
            </div>
            <CheckboxField
              id={`${fieldId}-no-limit`}
              label="No limit on guests"
              className="mt-2"
              checked={formData.maxPax === null}
              onChange={(checked) => setFormData({ ...formData, maxPax: checked ? null : (formData.minPax ?? 1) })}
            />
          </fieldset>

          <div>
            <label htmlFor={`${fieldId}-mode`} className="block text-sm font-bold text-daet-ink">
              How is it priced?
            </label>
            <Select
              id={`${fieldId}-mode`}
              value={priceMode}
              onChange={(event) => setPriceMode(event.target.value as "perGuest" | "group")}
            >
              <option value="perGuest">Price per guest</option>
              <option value="group">One price for the whole group</option>
            </Select>
            {priceMode === "perGuest" ? (
              <Field id={`${fieldId}-per-guest`} label="Price per guest (₱)" className="mt-3">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={EDIT_LIMITS.price.min}
                  max={EDIT_LIMITS.price.max}
                  value={formData.pricePerPax ?? ""}
                  onChange={(event) =>
                    setFormData({ ...formData, pricePerPax: event.target.value ? parseFloat(event.target.value) : null })
                  }
                  placeholder="1,500"
                />
              </Field>
            ) : (
              <Field id={`${fieldId}-flat`} label="Price for the group (₱)" className="mt-3">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={EDIT_LIMITS.price.min}
                  max={EDIT_LIMITS.price.max}
                  value={formData.flatPrice ?? ""}
                  onChange={(event) =>
                    setFormData({ ...formData, flatPrice: event.target.value ? parseFloat(event.target.value) : null })
                  }
                  placeholder="5,000"
                />
              </Field>
            )}
          </div>

          <CheckboxField
            id={`${fieldId}-default`}
            label="Show this price on the package page"
            checked={Boolean(formData.isDefault)}
            onChange={(checked) => setFormData({ ...formData, isDefault: checked })}
          />

          {formError ? (
            <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>
    </SectionCard>
  );
}
