"use client";

import { Field, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { SectionCard } from "@/components/ui/section-card";
import { useId, useState } from "react";
import type { EditInclusion, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { EDIT_LIMITS } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { withDisplayOrder } from "./edit-order";
import { validateInclusionText } from "./validation";

type InclusionsStepProps = StepProps<EditInclusion[]>;

const COLLAPSED = 5;

/** The operator's words on a row: one line, with the count of the other list. */
function summarize(items: EditInclusion[]): string {
  const included = items.filter((item) => item.isIncluded).length;
  const excluded = items.length - included;
  if (items.length === 0) return "Nothing listed yet.";
  return `${included} included${excluded ? `, ${excluded} not included` : ""}.`;
}

/**
 * InclusionsStep — "What's included".
 *
 * The whole list is one card of compact rows with a "⋯" menu each, rather than
 * a row of ↑ ↓ Edit Delete buttons on every item. More than five items collapse
 * behind "Show all". Adding or editing one item opens the shared Modal, which
 * can stay open for the next item ("Add another") and docks to the bottom of a
 * phone's screen.
 */
export function InclusionsStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
  id = "included-section",
  dirty = false,
}: InclusionsStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [showAll, setShowAll] = useState(false);
  const [formData, setFormData] = useState<{ text: string; isIncluded: boolean }>({
    text: "",
    isIncluded: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  // "Removed · Undo" — a plain delete with a way back, rather than a dialog.
  const [removed, setRemoved] = useState<{ item: EditInclusion; index: number } | null>(null);

  const canAddItems = permissions.inclusions.add;
  const canEditItems = permissions.inclusions.editText;
  const canRemoveItems = permissions.inclusions.remove;
  const canToggleIncluded = permissions.inclusions.toggleIncluded;

  const inclusionErrors = Object.entries(errors).filter(([key]) => key.startsWith("inclusions"));
  const sectionError = inclusionErrors.length
    ? inclusionErrors.map(([, message]) => message).join(" ")
    : null;

  const ordered = [...data].sort((a, b) => a.displayOrder - b.displayOrder);

  const startAdd = () => {
    setFormData({ text: "", isIncluded: true });
    setEditingId(undefined);
    setFormError(null);
    setOpen(true);
  };

  const startEdit = (item: EditInclusion) => {
    setFormData({ text: item.text, isIncluded: item.isIncluded });
    setEditingId(item.id);
    setFormError(null);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditingId(undefined);
    setFormError(null);
  };

  const apply = (keepOpen: boolean) => {
    const text = formData.text.trim();
    const message = validateInclusionText(text);
    if (message) {
      setFormError(message);
      return;
    }

    if (editingId) {
      onUpdate(withDisplayOrder(data.map((item) => (item.id === editingId ? { ...item, text, isIncluded: formData.isIncluded } : item))));
      close();
      return;
    }

    const added: EditInclusion = {
      id: `new-${Date.now()}-${data.length}`,
      text,
      isIncluded: formData.isIncluded,
      displayOrder: data.length + 1,
    };
    onUpdate(withDisplayOrder([...data, added]));

    if (keepOpen) {
      // Clear the text and stay put: several items go in one after another.
      setFormData({ text: "", isIncluded: formData.isIncluded });
      setFormError(null);
    } else {
      close();
    }
  };

  const remove = (item: EditInclusion) => {
    const index = ordered.findIndex((entry) => entry.id === item.id);
    onUpdate(withDisplayOrder(ordered.filter((entry) => entry.id !== item.id)));
    setRemoved({ item, index });
  };

  const undo = () => {
    if (!removed) return;
    const next = [...ordered];
    next.splice(Math.max(0, Math.min(removed.index, next.length)), 0, removed.item);
    onUpdate(withDisplayOrder(next));
    setRemoved(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdate(withDisplayOrder(next));
  };

  const toggle = (item: EditInclusion) => {
    onUpdate(withDisplayOrder(ordered.map((entry) => (entry.id === item.id ? { ...entry, isIncluded: !entry.isIncluded } : entry))));
  };

  const shown = showAll ? ordered : ordered.slice(0, COLLAPSED);

  return (
    <SectionCard
      id={id}
      title="What's included"
      dirty={dirty}
      summary={summarize(ordered)}
      error={sectionError}
      action={
        canAddItems ? (
          <Button variant="secondary" onClick={startAdd} disabled={loading}>
            Add an item
          </Button>
        ) : null
      }
    >
      {ordered.length === 0 ? (
        <p className="text-sm text-daet-ink/75">
          List what the price covers, and what it does not — a life vest, a meal, an environmental fee.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((item, index) => (
            <li key={item.id ?? item.text} className="flex items-center gap-3 py-2">
              <span
                aria-hidden="true"
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  item.isIncluded
                    ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                    : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                }`}
              >
                {item.isIncluded ? "✓" : "✕"}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-daet-ink ${item.isIncluded ? "" : "line-through decoration-1"}`}>{item.text}</p>
                <p className="text-xs text-daet-ink/70">{item.isIncluded ? "Included" : "Not included"}</p>
              </div>
              {canEditItems || canRemoveItems || canToggleIncluded ? (
                <RowMenu
                  label={`${item.text} item`}
                  items={[
                    ...(canEditItems ? [{ label: "Edit", onSelect: () => startEdit(item) }] : []),
                    ...(canToggleIncluded
                      ? [
                          {
                            label: item.isIncluded ? "Mark as not included" : "Mark as included",
                            onSelect: () => toggle(item),
                          },
                        ]
                      : []),
                    ...(canEditItems
                      ? [
                          { label: "Move up", onSelect: () => move(index, -1), disabled: index === 0 },
                          {
                            label: "Move down",
                            onSelect: () => move(index, 1),
                            disabled: index === ordered.length - 1,
                          },
                        ]
                      : []),
                    ...(canRemoveItems
                      ? [{ label: "Remove", onSelect: () => remove(item), danger: true }]
                      : []),
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {ordered.length > COLLAPSED ? (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          aria-expanded={showAll}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-blue-700 hover:underline dark:text-blue-300"
        >
          {showAll ? "Show fewer" : `Show all ${ordered.length}`}
        </button>
      ) : null}

      {removed ? (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-muted px-3 py-2 text-sm text-daet-ink"
        >
          <span className="min-w-0 flex-1 truncate">Removed “{removed.item.text}”</span>
          <button type="button" onClick={undo} className="min-h-11 font-bold text-blue-700 hover:underline dark:text-blue-300">
            Undo
          </button>
          <button
            type="button"
            onClick={() => setRemoved(null)}
            aria-label="Dismiss"
            className="grid h-11 w-11 place-items-center rounded-full text-daet-ink/70 hover:bg-muted-strong"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}

      <Modal
        open={open}
        onClose={close}
        title={editingId ? "Edit item" : "Add an item"}
        description="You'll save everything with the Save button at the foot of the page."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {!editingId ? (
              <Button variant="secondary" onClick={() => apply(true)}>
                Add another
              </Button>
            ) : null}
            <Button onClick={() => apply(false)}>{editingId ? "Save item" : "Add item"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            id={`${fieldId}-text`}
            label="What is it?"
            required
            hint={`${formData.text.length}/${EDIT_LIMITS.inclusionText.max}`}
            error={formError}
          >
            <Textarea
              value={formData.text}
              onChange={(event) => {
                setFormData({ ...formData, text: event.target.value });
                setFormError(null);
              }}
              maxLength={EDIT_LIMITS.inclusionText.max}
              rows={2}
              placeholder="Boat transfer, life vest, lunch"
            />
          </Field>
          <Field id={`${fieldId}-kind`} label="Is it included in the price?">
            <Select
              value={formData.isIncluded ? "yes" : "no"}
              onChange={(event) => setFormData({ ...formData, isIncluded: event.target.value === "yes" })}
            >
              <option value="yes">Included</option>
              <option value="no">Not included</option>
            </Select>
          </Field>
          {!editingId ? (
            <p className="text-sm text-daet-ink/70">
              Common items: boat transfer, life vest, meals, environmental fee. Type your own words — nothing is
              added until you add it.
            </p>
          ) : null}
        </div>
      </Modal>
    </SectionCard>
  );
}
