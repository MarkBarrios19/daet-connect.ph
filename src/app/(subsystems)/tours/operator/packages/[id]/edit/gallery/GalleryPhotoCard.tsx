"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EditGalleryImage } from "../edit-types";
import { EDIT_LIMITS } from "../edit-constants";

/** True when the visitor asked the OS to cut animation. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * One photo in the gallery grid.
 *
 * The whole card is a sortable item: the grip is the accessible activator
 * (keyboard and touch), while the photo itself starts a mouse drag. Buttons
 * inside the card stop the pointer before it reaches the drag listeners, so
 * opening the menu never picks the photo up.
 */
export function GalleryPhotoCard({
  image,
  sortableId,
  index,
  total,
  isLead,
  canReorder,
  canEditCaption,
  canRemove,
  onMoveEarlier,
  onMoveLater,
  onMakeFirst,
  onDelete,
  onSaveCaption,
}: {
  image: EditGalleryImage;
  sortableId: string;
  index: number;
  total: number;
  isLead: boolean;
  canReorder: boolean;
  canEditCaption: boolean;
  canRemove: boolean;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onMakeFirst: () => void;
  onDelete: () => void;
  onSaveCaption: (caption: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: sortableId, disabled: !canReorder });

  const reducedMotion = usePrefersReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(image.caption ?? "");
  const menuRef = useRef<HTMLDivElement>(null);

  const position = index + 1;

  // Close the menu on Escape or on a click anywhere else.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const startCaptionEdit = useCallback(() => {
    setDraft(image.caption ?? "");
    setEditing(true);
    setMenuOpen(false);
  }, [image.caption]);

  const saveCaption = useCallback(() => {
    onSaveCaption(draft.trim() === "" ? null : draft.trim());
    setEditing(false);
  }, [draft, onSaveCaption]);

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: reducedMotion ? undefined : transition,
      }}
      aria-label={`Photo ${position} of ${total}`}
      className={`group relative aspect-square overflow-hidden rounded-2xl bg-muted ${
        isLead ? "lg:col-span-2 lg:row-span-2" : ""
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <Image
        src={image.imageUrl}
        alt={image.caption ?? `Gallery photo ${position}`}
        fill
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
        className="object-cover"
        // The photo half of the card drags with the mouse.
        onPointerDown={
          canReorder
            ? (listeners?.onPointerDown as React.PointerEventHandler<HTMLImageElement> | undefined)
            : undefined
        }
      />

      {/* Number badge, grip and menu */}
      <div className="absolute inset-x-2 top-2 flex items-start justify-between">
        <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-bold text-white">
          {position}
        </span>

        <div className="flex gap-1">
          {canReorder && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Move photo ${position}`}
              className="grid h-9 w-9 touch-none place-items-center rounded-2xl bg-slate-900/80 text-white transition focus-visible:ring-2 focus-visible:ring-white max-lg:opacity-100 lg:opacity-60 lg:hover:opacity-100 lg:focus-visible:opacity-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <circle cx="7" cy="5" r="1.5" />
                <circle cx="13" cy="5" r="1.5" />
                <circle cx="7" cy="10" r="1.5" />
                <circle cx="13" cy="10" r="1.5" />
                <circle cx="7" cy="15" r="1.5" />
                <circle cx="13" cy="15" r="1.5" />
              </svg>
            </button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={`Photo ${position} options`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-900/80 text-white transition focus-visible:ring-2 focus-visible:ring-white max-lg:opacity-100 lg:opacity-60 lg:hover:opacity-100 lg:focus-visible:opacity-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <circle cx="4" cy="10" r="1.6" />
                <circle cx="10" cy="10" r="1.6" />
                <circle cx="16" cy="10" r="1.6" />
              </svg>
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label={`Photo ${position} options`}
                className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-2xl border border-daet-ink/10 bg-surface py-1 shadow-[var(--shadow-float)]"
              >
                {canEditCaption && (
                  <MenuButton onClick={startCaptionEdit}>
                    {image.caption ? "Edit caption" : "Add caption"}
                  </MenuButton>
                )}
                {canReorder && (
                  <>
                    <MenuButton onClick={() => { onMoveEarlier(); setMenuOpen(false); }} disabled={index === 0}>
                      Move earlier
                    </MenuButton>
                    <MenuButton onClick={() => { onMoveLater(); setMenuOpen(false); }} disabled={index === total - 1}>
                      Move later
                    </MenuButton>
                    <MenuButton onClick={() => { onMakeFirst(); setMenuOpen(false); }} disabled={index === 0}>
                      Make first photo
                    </MenuButton>
                  </>
                )}
                {canRemove && (
                  <>
                    <hr className="my-1 border-daet-ink/10" />
                    <MenuButton onClick={() => { onDelete(); setMenuOpen(false); }} destructive>
                      Delete photo
                    </MenuButton>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Caption on the photo's lower edge */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent p-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              maxLength={EDIT_LIMITS.caption.max}
              rows={2}
              autoFocus
              aria-label={`Caption for photo ${position}`}
              className="w-full resize-none rounded-2xl bg-surface/95 px-2 py-1 text-sm text-daet-ink outline-none focus:ring-2 focus:ring-daet-forest/40"
              placeholder="Add caption (optional)"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={saveCaption}
                className="flex-1 rounded-2xl bg-daet-forest px-2 py-1 text-xs font-medium text-white transition hover:bg-daet-leaf"
              >
                Save
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setEditing(false)}
                className="flex-1 rounded-2xl card-edge bg-surface px-2 py-1 text-xs font-medium text-daet-ink/80 transition hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : image.caption ? (
          <p className="line-clamp-2 text-sm text-white">{image.caption}</p>
        ) : canEditCaption ? (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={startCaptionEdit}
            className="text-xs font-medium text-white/80 underline underline-offset-2 transition hover:text-white"
          >
            Add caption
          </button>
        ) : null}
      </div>

      {isLead && (
        <span className="absolute bottom-3 right-3 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-bold text-daet-ink">
          First photo
        </span>
      )}
    </article>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3 py-2 text-left text-sm transition disabled:opacity-40 ${
        destructive
          ? "text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
          : "text-daet-ink hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
