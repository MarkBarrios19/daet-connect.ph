"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, rectSwappingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useFeedback } from "@/components/ui/feedback";
import type { EditGalleryImage, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { deletePackageImage } from "./actions";
import { ALLOWED_IMAGE_EXTENSIONS, ALLOWED_IMAGE_TYPES, EDIT_LIMITS } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { moveItem, swapItems, withDisplayOrder } from "./edit-order";
import { useFileDrop } from "./use-file-drop";
import { GalleryPhotoCard } from "./gallery/GalleryPhotoCard";
import { GalleryUploadTile } from "./gallery/GalleryUploadTile";
import { useGalleryUploads } from "./gallery/use-gallery-uploads";

type GalleryStepProps = StepProps<EditGalleryImage[]> & { packageId: string };

/**
 * GalleryStep
 *
 * The operator's photo grid for a package.
 *
 * - Photos reorder by drag (mouse, press-and-hold on touch, keyboard) and
 *   snapping onto a photo swaps the two, so the rest of the row stays put.
 * - Files can be dropped anywhere on the card or picked from the button; each
 *   one shows a placeholder tile in the slot it will occupy.
 * - Positions stay 1..n (edit-order) and the first photo is the lead tile.
 */
export function GalleryStep({
  packageId,
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
}: GalleryStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const { toast, confirm } = useFeedback();

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const canAddImages = permissions.gallery.add;
  const canEditCaptions = permissions.gallery.editCaption;
  const canRemoveImages = permissions.gallery.remove;
  const canReorder = permissions.gallery.reorder;

  const ordered = useMemo(() => [...data].sort((a, b) => a.displayOrder - b.displayOrder), [data]);

  // Stable ids for the sortable grid; the DB gives every photo one.
  const items = useMemo(
    () => ordered.map((image, index) => ({ image, id: image.id ?? `gallery-${index}` })),
    [ordered],
  );

  const imagesRef = useRef<EditGalleryImage[]>(ordered);
  useEffect(() => {
    imagesRef.current = ordered;
  }, [ordered]);

  const commit = useCallback(
    (next: EditGalleryImage[]) => {
      const renumbered = withDisplayOrder(next);
      imagesRef.current = renumbered;
      onUpdate(renumbered);
    },
    [onUpdate],
  );

  const uploads = useGalleryUploads({
    packageId,
    onUploaded: useCallback(
      (imageUrl: string) => {
        commit([
          ...imagesRef.current,
          {
            id: `new-${Date.now()}-${imagesRef.current.length + 1}`,
            imageUrl,
            caption: null,
            displayOrder: imagesRef.current.length + 1,
          },
        ]);
      },
      [commit],
    ),
  });

  const uploadingCount = uploads.tiles.length;
  const photoCount = ordered.length + uploadingCount;
  const remaining = EDIT_LIMITS.maxGalleryImages - photoCount;

  const busy = uploads.progress !== null || loading;
  const fileDrop = useFileDrop({
    onFiles: (files) => void addFiles(files),
    enabled: canAddImages && remaining > 0 && !busy,
  });

  /* ------------------------------------------------------------- uploading */

  const validateFile = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return `not ${ALLOWED_IMAGE_EXTENSIONS.join(", ")}`;
    }
    if (file.size > EDIT_LIMITS.imageBytes) {
      return `over ${EDIT_LIMITS.imageBytes / (1024 * 1024)} MB`;
    }
    return null;
  };

  const addFiles = useCallback(
    (files: File[]) => {
      if (!canAddImages || files.length === 0) return;

      const slots = Math.max(0, remaining);
      const accepted = files.slice(0, slots);
      const problems: string[] = [];

      if (files.length > accepted.length) {
        problems.push(
          accepted.length === 0
            ? `Maximum ${EDIT_LIMITS.maxGalleryImages} photos allowed.`
            : `Only ${slots} more photo${slots === 1 ? "" : "s"} can be added (maximum ${EDIT_LIMITS.maxGalleryImages}), so ${files.length - accepted.length} ${files.length - accepted.length === 1 ? "file was" : "files were"} skipped.`,
        );
      }

      const valid = accepted.filter((file) => {
        const problem = validateFile(file);
        if (problem) {
          problems.push(accepted.length > 1 ? `${file.name}: ${problem}` : `That file is ${problem}.`);
          return false;
        }
        return true;
      });

      setUploadError(problems.length > 0 ? problems.join(" ") : null);
      if (valid.length > 0) uploads.startBatch(valid);
    },
    // validateFile only reads module constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canAddImages, remaining, uploads],
  );

  const handlePicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      addFiles(files);
    },
    [addFiles],
  );

  const progressBefore = useRef<{ done: number; total: number } | null>(null);
  useEffect(() => {
    const before = progressBefore.current;
    progressBefore.current = uploads.progress;
    if (before && !uploads.progress && before.total > 1) {
      toast(`${before.total} photos added.`, "success");
    }
  }, [uploads.progress, toast]);

  /* -------------------------------------------------------------- reorder */

  const swapTo = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      commit(swapItems(imagesRef.current, fromIndex, toIndex));
    },
    [commit],
  );

  const moveTo = useCallback(
    (fromIndex: number, toIndex: number) => {
      commit(moveItem(imagesRef.current, fromIndex, toIndex));
    },
    [commit],
  );

  const positionOf = useCallback(
    (id: UniqueIdentifier) => items.findIndex((entry) => entry.id === id) + 1,
    [items],
  );

  // A stable id, so the drag instructions dnd-kit links with aria-describedby
  // get the same id on the server and in the browser (no hydration mismatch).
  const dndId = useId();

  const sensors = useSensors(
    // A few pixels of travel, so a click or a caption edit never starts a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold, so a phone can still scroll the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => `Picked up photo ${positionOf(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `Photo ${positionOf(active.id)} is over position ${positionOf(over.id)}. Press space to swap.`
          : `Photo ${positionOf(active.id)} is not over a position.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `Photo ${positionOf(active.id)} swapped with position ${positionOf(over.id)}.`
          : `Photo ${positionOf(active.id)} returned to its place.`,
      onDragCancel: ({ active }) => `Moving photo ${positionOf(active.id)} cancelled.`,
    }),
    [positionOf],
  );

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const from = items.findIndex((entry) => entry.id === active.id);
    const to = items.findIndex((entry) => entry.id === over.id);
    if (from < 0 || to < 0) return;

    swapTo(from, to);
  };

  const activeImage = activeId === null ? null : items.find((entry) => entry.id === activeId)?.image ?? null;

  /* -------------------------------------------------------------- captions */

  const saveCaption = useCallback(
    (index: number, caption: string | null) => {
      commit(imagesRef.current.map((image, at) => (at === index ? { ...image, caption } : image)));
    },
    [commit],
  );

  /* ---------------------------------------------------------------- delete */

  const handleDelete = useCallback(
    async (image: EditGalleryImage) => {
      const confirmed = await confirm({
        title: "Delete this photo?",
        description: "It is removed from the package. Nothing is saved until you save the form.",
        confirmLabel: "Delete",
        confirmVariant: "danger",
      });
      if (!confirmed) return;

      // Remove from storage too when it lives in the package's bucket.
      if (image.imageUrl.includes("http")) {
        try {
          await deletePackageImage(packageId, image.imageUrl);
        } catch {
          // The row still goes: an orphaned file is better than a card the
          // operator can't get rid of.
        }
      }

      commit(imagesRef.current.filter((entry) => entry.imageUrl !== image.imageUrl));
    },
    [confirm, packageId, commit],
  );

  /* ---------------------------------------------------------------- notice */

  const structuralChange = useMemo(() => {
    const before = [...originalData]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((image) => image.imageUrl);
    const after = ordered.map((image) => image.imageUrl);
    return before.length !== after.length || before.some((url, index) => url !== after[index]);
  }, [originalData, ordered]);

  const galleryErrors = Object.entries(errors)
    .filter(([key]) => key.startsWith("galleryImages"))
    .map(([, message]) => message);

  const uploadLabel = uploads.progress
    ? uploads.progress.total > 1
      ? `Uploading ${Math.min(uploads.progress.done + 1, uploads.progress.total)} of ${uploads.progress.total}...`
      : "Uploading..."
    : "Add photos";

  return (
    <div
      {...fileDrop.dropProps}
      className={`rounded-2xl border bg-surface p-6 transition ${
        fileDrop.isDragging ? "border-daet-forest ring-2 ring-daet-forest/40" : ""
      }`}
    >
      {packageStatus === "published" && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {structuralChange
            ? "Unsaved changes: saving sends this package back to the Tourism Office for review, and it stays hidden from tourists until they approve it."
            : "Adding, removing or reordering photos sends this package back to the Tourism Office for review. Caption edits stay live."}
        </div>
      )}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-daet-ink">Gallery</h2>
          <p className="mt-1 text-sm text-daet-ink/80">
            {photoCount} of {EDIT_LIMITS.maxGalleryImages} photos
          </p>
          <p className="mt-1 text-xs text-daet-ink/70">
            Drag to reorder. The first photo is shown first on the package page.
          </p>
        </div>

        {canAddImages && remaining > 0 && (
          <label htmlFor="gallery-upload" className={uploads.progress ? "cursor-default" : "cursor-pointer"}>
            <div
              className={`relative overflow-hidden rounded-2xl px-4 py-2 text-center font-medium transition ${
                uploads.progress
                  ? "bg-daet-forest text-white"
                  : loading
                    ? "cursor-not-allowed bg-muted text-daet-ink/70"
                    : "bg-daet-forest text-white hover:bg-daet-leaf"
              }`}
            >
              {uploads.progress && uploads.progress.total > 0 && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-blue-300/40 transition-[width] duration-300"
                  style={{
                    width: `${Math.round((uploads.progress.done / uploads.progress.total) * 100)}%`,
                  }}
                />
              )}
              <span className="relative inline-flex items-center justify-center gap-2">
                {uploads.progress && (
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 rounded-full border-2 border-blue-200/50 border-t-blue-200 animate-spin motion-reduce:animate-none"
                  />
                )}
                {uploadLabel}
              </span>
            </div>
          </label>
        )}
      </div>

      <input
        id="gallery-upload"
        type="file"
        multiple
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        onChange={handlePicked}
        disabled={!canAddImages || remaining <= 0 || busy}
        className="hidden"
      />

      <p role="status" aria-live="polite" className="sr-only">
        {uploads.progress
          ? `Uploading ${Math.min(uploads.progress.done + 1, uploads.progress.total)} of ${uploads.progress.total}`
          : ""}
      </p>

      {fileDrop.isDragging && (
        <p className="mb-4 rounded-2xl border-2 border-dashed border-daet-forest/60 p-3 text-sm font-medium text-daet-forest">
          Drop the photos to upload them.
        </p>
      )}

      {uploadError && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span>{uploadError}</span>
        </div>
      )}

      {galleryErrors.length > 0 && (
        <div className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">Gallery errors:</p>
          <ul className="mt-1 list-inside list-disc">
            {galleryErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 && uploadingCount === 0 ? (
        <label
          htmlFor="gallery-upload"
          className={`flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-canvas p-8 text-center transition ${
            canAddImages && remaining > 0
              ? "cursor-pointer border-daet-ink/20 hover:border-daet-forest hover:bg-daet-sand"
              : "border-daet-ink/10"
          }`}
        >
          <svg className="h-10 w-10 text-daet-ink/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm font-medium text-daet-ink/80">Add photos</span>
          <span className="text-xs text-daet-ink/70">or drop them here. JPG, PNG or WebP, up to 5 MB each.</span>
        </label>
      ) : (
        <>
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
            accessibility={{ announcements }}
          >
            <SortableContext items={items.map((entry) => entry.id)} strategy={rectSwappingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map(({ image, id }, index) => (
                  <GalleryPhotoCard
                    key={id}
                    image={image}
                    sortableId={id}
                    index={index}
                    total={items.length}
                    isLead={index === 0}
                    canReorder={canReorder}
                    canEditCaption={canEditCaptions}
                    canRemove={canRemoveImages}
                    onMoveEarlier={() => moveTo(index, index - 1)}
                    onMoveLater={() => moveTo(index, index + 1)}
                    onMakeFirst={() => moveTo(index, 0)}
                    onDelete={() => void handleDelete(image)}
                    onSaveCaption={(caption) => saveCaption(index, caption)}
                  />
                ))}

                {uploads.tiles.map((tile) => (
                  <GalleryUploadTile
                    key={tile.id}
                    previewUrl={tile.previewUrl}
                    status={tile.status}
                    error={tile.error}
                    onRetry={() => uploads.retry(tile.id)}
                    onRemove={() => uploads.remove(tile.id)}
                  />
                ))}

                {canAddImages && remaining > 0 && (
                  <label
                    htmlFor="gallery-upload"
                    className="grid aspect-square cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-daet-ink/20 bg-canvas p-3 text-center transition hover:border-daet-forest hover:bg-daet-sand"
                  >
                    <span className="flex flex-col items-center gap-1">
                      <svg className="h-6 w-6 text-daet-ink/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs font-medium text-daet-ink/80">Add photos or drop them here</span>
                    </span>
                  </label>
                )}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeImage && (
                <div className="relative h-40 w-40 rotate-2 scale-105 overflow-hidden rounded-2xl ring-2 ring-daet-forest">
                  <Image src={activeImage.imageUrl} alt="" fill className="object-cover" />
                </div>
              )}
            </DragOverlay>
          </DndContext>

          <p className="mt-3 text-xs text-daet-ink/70">
            JPG, PNG or WebP · up to {EDIT_LIMITS.imageBytes / (1024 * 1024)} MB each · maximum{" "}
            {EDIT_LIMITS.maxGalleryImages} photos
          </p>
        </>
      )}
    </div>
  );
}
