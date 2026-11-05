"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadPackageImage } from "../actions";

export interface UploadTile {
  id: string;
  file: File;
  /** Local object URL, so the operator sees the photo before it reaches the server. */
  previewUrl: string;
  status: "uploading" | "error";
  error?: string;
}

let sequence = 0;
const nextId = () => `upload-${(sequence += 1)}`;

/**
 * The upload queue behind the gallery's placeholder tiles.
 *
 * Each file becomes a tile that shows its own preview immediately, then either
 * turns into a real photo card or an error tile with the action's message. The
 * action reports no byte progress, so the only honest number is the count of
 * files finished — that is what `progress` carries.
 *
 * Uploads run one at a time through a promise chain: the action takes a single
 * file, and serialising them keeps the order the operator picked.
 */
export function useGalleryUploads({
  packageId,
  onUploaded,
}: {
  packageId: string;
  onUploaded: (imageUrl: string) => void;
}) {
  const [tiles, setTiles] = useState<UploadTile[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const queue = useRef<Promise<void>>(Promise.resolve());
  const onUploadedRef = useRef(onUploaded);
  const tilesRef = useRef<UploadTile[]>([]);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  // Nothing left to show: the batch is over, so drop the counter.
  useEffect(() => {
    if (tiles.length === 0) setProgress(null);
  }, [tiles.length]);

  // Object URLs are leaked memory until revoked, including on unmount.
  useEffect(
    () => () => {
      for (const tile of tilesRef.current) URL.revokeObjectURL(tile.previewUrl);
    },
    [],
  );

  const uploadTile = useCallback(
    async (tile: UploadTile) => {
      setTiles((current) =>
        current.map((entry) =>
          entry.id === tile.id ? { ...entry, status: "uploading", error: undefined } : entry,
        ),
      );

      try {
        const formData = new FormData();
        formData.append("file", tile.file);

        const result = await uploadPackageImage(packageId, formData, "gallery");

        if (result.success && result.imageUrl) {
          onUploadedRef.current(result.imageUrl);
          URL.revokeObjectURL(tile.previewUrl);
          setTiles((current) => current.filter((entry) => entry.id !== tile.id));
        } else {
          setTiles((current) =>
            current.map((entry) =>
              entry.id === tile.id
                ? { ...entry, status: "error", error: result.error?.message ?? "Upload failed" }
                : entry,
            ),
          );
        }
      } catch {
        setTiles((current) =>
          current.map((entry) =>
            entry.id === tile.id ? { ...entry, status: "error", error: "Upload failed" } : entry,
          ),
        );
      }
    },
    [packageId],
  );

  /** Queues files for upload. Returns the tiles it created, newest last. */
  const startBatch = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const created: UploadTile[] = files.map((file) => ({
        id: nextId(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "uploading",
      }));

      setTiles((current) => [...current, ...created]);
      setProgress((current) => ({
        done: current?.done ?? 0,
        total: (current?.total ?? 0) + created.length,
      }));

      for (const tile of created) {
        queue.current = queue.current.then(async () => {
          await uploadTile(tile);
          setProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
        });
      }
    },
    [uploadTile],
  );

  const retry = useCallback(
    (tileId: string) => {
      const tile = tilesRef.current.find((entry) => entry.id === tileId);
      if (!tile) return;
      queue.current = queue.current.then(() => uploadTile(tile));
    },
    [uploadTile],
  );

  const remove = useCallback((tileId: string) => {
    setTiles((current) => {
      const tile = current.find((entry) => entry.id === tileId);
      if (tile) URL.revokeObjectURL(tile.previewUrl);
      return current.filter((entry) => entry.id !== tileId);
    });
  }, []);

  return { tiles, progress, startBatch, retry, remove };
}
