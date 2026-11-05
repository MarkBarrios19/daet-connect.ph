"use client";

import { useCallback, useRef, useState } from "react";
import type React from "react";

/**
 * Drop photos onto a region to upload them.
 *
 * Only reacts to files dragged in from the OS: an internal drag (reordering a
 * gallery card) carries no "Files" entry in dataTransfer.types, so it falls
 * through to whatever is underneath instead of being swallowed here.
 *
 * The handlers always cancel the browser's default for file drags — even when
 * drops are disabled — because the default is "navigate the tab to the image".
 */
export function useFileDrop({
  onFiles,
  enabled = true,
}: {
  onFiles: (files: File[]) => void;
  enabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave fire for every child element; counting keeps the
  // highlight steady while the pointer moves across the region.
  const depth = useRef(0);

  const carriesFile = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = useCallback((event: React.DragEvent) => {
    if (!carriesFile(event)) return;
    event.preventDefault();
    depth.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!carriesFile(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = enabled ? "copy" : "none";
  }, [enabled]);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (!carriesFile(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (!carriesFile(event)) return;
      event.preventDefault();
      depth.current = 0;
      setIsDragging(false);
      if (!enabled) return;

      // Every photo in the drop, not just the first: dragging a selection of
      // files from the desktop should upload all of them.
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
    },
    [enabled, onFiles],
  );

  return { isDragging, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
