"use client";

import React from "react";

/**
 * The tile that stands in for a photo still on its way to the server.
 *
 * It shows the operator's own file (object URL, dimmed) in the exact slot the
 * real card will occupy, so the grid doesn't jump when the upload lands. No
 * percentage: the action emits no progress, so only the batch count is honest.
 */
export function GalleryUploadTile({
  previewUrl,
  status,
  error,
  onRetry,
  onRemove,
}: {
  previewUrl: string;
  status: "uploading" | "error";
  error?: string;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const isError = status === "error";

  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-2xl ${
        isError ? "bg-red-50 dark:bg-red-950/40" : "bg-muted-strong"
      }`}
      aria-busy={!isError}
    >
      {/* A blob URL can't go through next/image; it isn't an optimisable asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt=""
        aria-hidden
        className={`absolute inset-0 h-full w-full object-cover ${isError ? "opacity-20" : "opacity-40"}`}
      />

      <div className="absolute inset-0 grid place-items-center p-3 text-center">
        {isError ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-red-800 dark:text-red-300">
              {error ?? "Upload failed"}
            </p>
            <div className="flex flex-wrap justify-center gap-1">
              <button
                type="button"
                onClick={onRetry}
                className="min-h-9 rounded-2xl bg-daet-forest px-3 text-xs font-medium text-white transition hover:bg-daet-leaf"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="min-h-9 rounded-2xl card-edge bg-surface px-3 text-xs font-medium text-daet-ink/80 transition hover:bg-muted"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <span
              aria-hidden
              className="h-5 w-5 rounded-full border-2 border-daet-ink/20 border-t-daet-forest animate-spin motion-reduce:animate-none"
            />
            <span className="text-xs font-medium text-daet-ink/80">Uploading...</span>
          </div>
        )}
      </div>
    </div>
  );
}
