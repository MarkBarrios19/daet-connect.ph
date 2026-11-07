"use client";

import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { SectionCard } from "@/components/ui/section-card";
import { LocationPicker } from "@/components/maps/location-picker";
import { useId, useState } from "react";
import type { EditStop, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { EDIT_LIMITS, DEFAULT_COORDINATES } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { withStopOrder } from "./edit-order";
import { validateStop } from "./validation";

type StopsStepProps = StepProps<EditStop[]>;

const blankStop = (): Partial<EditStop> => ({
  locationName: "",
  description: "",
  latitude: DEFAULT_COORDINATES.latitude,
  longitude: DEFAULT_COORDINATES.longitude,
  estimatedDurationMinutes: null,
});

/**
 * StopsStep — "Route & stops".
 *
 * A route is an ordered list, so the rows are numbered and each carries one "⋯"
 * menu (Edit, Move up, Move down, Delete) instead of three buttons. Adding or
 * editing a stop opens the shared Modal: a place name, an optional description
 * and a point picked on the map. The latitude and longitude stay available
 * under "Advanced" for an admin, but nobody has to type a coordinate.
 */
export function StopsStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
  id = "stops-section",
  dirty = false,
}: StopsStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [formData, setFormData] = useState<Partial<EditStop>>(blankStop());
  const [formError, setFormError] = useState<string | null>(null);

  const canAddStops = permissions.stops.add;
  const canEditStops = permissions.stops.editDetails;
  const canRemoveStops = permissions.stops.remove;

  const stopErrors = Object.entries(errors).filter(([key]) => key.startsWith("stops"));
  const sectionError = stopErrors.length ? stopErrors.map(([, message]) => message).join(" ") : null;

  const sorted = [...data].sort((a, b) => a.stopOrder - b.stopOrder);

  const startAdd = () => {
    setFormData(blankStop());
    setEditingId(undefined);
    setFormError(null);
    setOpen(true);
  };

  const startEdit = (stop: EditStop) => {
    setFormData(stop);
    setEditingId(stop.id);
    setFormError(null);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditingId(undefined);
    setFormError(null);
  };

  const apply = () => {
    const draft: EditStop = {
      id: editingId ?? `new-${Date.now()}`,
      locationName: (formData.locationName ?? "").trim(),
      description: formData.description?.trim() ? formData.description.trim() : null,
      latitude: formData.latitude ?? DEFAULT_COORDINATES.latitude,
      longitude: formData.longitude ?? DEFAULT_COORDINATES.longitude,
      estimatedDurationMinutes: formData.estimatedDurationMinutes ?? null,
      stopOrder: editingId ? (data.find((stop) => stop.id === editingId)?.stopOrder ?? data.length + 1) : data.length + 1,
    };
    const found = validateStop(draft);
    const first = Object.values(found)[0];
    if (first) {
      setFormError(first);
      return;
    }
    onUpdate(
      withStopOrder(editingId ? sorted.map((stop) => (stop.id === editingId ? draft : stop)) : [...sorted, draft]),
    );
    close();
  };

  const remove = (stop: EditStop) => {
    if (sorted.length <= 1) {
      setFormError(null);
      return;
    }
    onUpdate(withStopOrder(sorted.filter((entry) => entry.id !== stop.id)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const next = [...sorted];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdate(withStopOrder(next));
  };

  return (
    <SectionCard
      id={id}
      title="Route & stops"
      dirty={dirty}
      summary={
        sorted.length === 0
          ? "No stops yet."
          : sorted
              .slice(0, 3)
              .map((stop) => stop.locationName)
              .join(" → ") + (sorted.length > 3 ? ` → +${sorted.length - 3} more` : "")
      }
      error={sectionError}
      action={
        canAddStops ? (
          <Button variant="secondary" onClick={startAdd} disabled={loading}>
            Add a stop
          </Button>
        ) : null
      }
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-daet-ink/75">Add the places the tour visits, in order.</p>
      ) : (
        <ol className="divide-y divide-line">
          {sorted.map((stop, index) => (
            <li key={stop.id ?? stop.locationName} className="flex items-center gap-3 py-2">
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted-strong text-sm font-bold text-daet-ink"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-daet-ink">{stop.locationName}</p>
                <p className="text-sm text-daet-ink/75">
                  {stop.estimatedDurationMinutes ? `${stop.estimatedDurationMinutes} minutes` : "Time at this stop not set"}
                </p>
              </div>
              {canEditStops || canRemoveStops ? (
                <RowMenu
                  label={`${stop.locationName} stop`}
                  items={[
                    ...(canEditStops ? [{ label: "Edit", onSelect: () => startEdit(stop) }] : []),
                    ...(permissions.stops.reorder
                      ? [
                          { label: "Move up", onSelect: () => move(index, -1), disabled: index === 0 },
                          {
                            label: "Move down",
                            onSelect: () => move(index, 1),
                            disabled: index === sorted.length - 1,
                          },
                        ]
                      : []),
                    ...(canRemoveStops
                      ? [
                          {
                            label: "Delete",
                            onSelect: () => remove(stop),
                            disabled: sorted.length <= 1,
                            danger: true,
                          },
                        ]
                      : []),
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={open}
        onClose={close}
        title={editingId ? "Edit stop" : "Add a stop"}
        description="You'll save everything with the Save button at the foot of the page."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={apply}>{editingId ? "Save stop" : "Add stop"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field id={`${fieldId}-name`} label="Where does the tour stop?" required>
            <Input
              value={formData.locationName ?? ""}
              onChange={(event) => setFormData({ ...formData, locationName: event.target.value })}
              maxLength={EDIT_LIMITS.stopLocation.max}
              placeholder="Bagasbas Beach"
            />
          </Field>

          <Field id={`${fieldId}-description`} label="What happens here?" hint="Optional">
            <Textarea
              value={formData.description ?? ""}
              onChange={(event) => setFormData({ ...formData, description: event.target.value || null })}
              maxLength={EDIT_LIMITS.stopDescription.max}
              rows={2}
              className="resize-none"
              placeholder="A 20-minute swim, then merienda on the sand."
            />
          </Field>

          <div>
            <p className="mb-1 block text-sm font-bold text-daet-ink">Find it on the map</p>
            <LocationPicker
              latitude={formData.latitude ?? null}
              longitude={formData.longitude ?? null}
              onChange={(latitude, longitude, placeName) =>
                setFormData((current) => ({
                  ...current,
                  latitude,
                  longitude,
                  locationName:
                    placeName && !current.locationName?.trim()
                      ? placeName.slice(0, EDIT_LIMITS.stopLocation.max)
                      : current.locationName,
                }))
              }
            />
          </div>

          <Field id={`${fieldId}-minutes`} label="How long is the stop? (minutes)">
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              max="1440"
              value={formData.estimatedDurationMinutes ?? ""}
              onChange={(event) =>
                setFormData({
                  ...formData,
                  estimatedDurationMinutes: event.target.value ? parseInt(event.target.value, 10) : null,
                })
              }
              placeholder="60"
            />
          </Field>

          <details className="rounded-2xl border border-line px-3 py-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-daet-ink">
              Advanced: coordinates
            </summary>
            <div className="grid gap-3 pb-2 sm:grid-cols-2">
              <Field id={`${fieldId}-lat`} label="Latitude">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min={-90}
                  max={90}
                  value={formData.latitude ?? ""}
                  onChange={(event) =>
                    setFormData({ ...formData, latitude: event.target.value ? parseFloat(event.target.value) : 0 })
                  }
                />
              </Field>
              <Field id={`${fieldId}-lng`} label="Longitude">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min={-180}
                  max={180}
                  value={formData.longitude ?? ""}
                  onChange={(event) =>
                    setFormData({ ...formData, longitude: event.target.value ? parseFloat(event.target.value) : 0 })
                  }
                />
              </Field>
            </div>
          </details>

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
