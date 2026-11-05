/** @jest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { useGalleryUploads } from "./use-gallery-uploads";
import { uploadPackageImage } from "../actions";

jest.mock("../actions", () => ({
  uploadPackageImage: jest.fn(),
}));

const mockedUpload = uploadPackageImage as jest.MockedFunction<typeof uploadPackageImage>;

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

let objectUrls = 0;

beforeEach(() => {
  objectUrls = 0;
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: jest.fn(() => `blob:preview-${(objectUrls += 1)}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: jest.fn() });
  mockedUpload.mockResolvedValue({
    success: true,
    imageUrl: "https://example.supabase.co/storage/v1/object/public/tours-package-media/x.jpg",
  } as never);
});

const setup = () => {
  const onUploaded = jest.fn();
  const view = renderHook(() => useGalleryUploads({ packageId: "pkg-1", onUploaded }));
  return { ...view, onUploaded };
};

describe("useGalleryUploads", () => {
  it("creates one tile per file, each with its own preview", () => {
    const { result } = setup();

    act(() => result.current.startBatch([photo("a.jpg"), photo("b.jpg")]));

    expect(result.current.tiles).toHaveLength(2);
    expect(result.current.tiles.map((tile) => tile.previewUrl)).toEqual([
      "blob:preview-1",
      "blob:preview-2",
    ]);
    expect(result.current.progress).toEqual({ done: 0, total: 2 });
  });

  it("swaps a finished tile for the uploaded photo and frees its preview", async () => {
    const { result, onUploaded } = setup();

    act(() => result.current.startBatch([photo("a.jpg")]));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(expect.stringContaining("tours-package-media")));
    await waitFor(() => expect(result.current.tiles).toHaveLength(0));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("keeps the tile with the action's message when the upload fails", async () => {
    mockedUpload.mockResolvedValue({ success: false, error: { message: "Bucket said no" } } as never);
    const { result, onUploaded } = setup();

    act(() => result.current.startBatch([photo("a.jpg")]));

    await waitFor(() => expect(result.current.tiles[0]?.status).toBe("error"));
    expect(result.current.tiles[0].error).toBe("Bucket said no");
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("retries a failed tile and clears the error when it succeeds", async () => {
    mockedUpload.mockResolvedValueOnce({ success: false, error: { message: "Timed out" } } as never);
    const { result } = setup();

    act(() => result.current.startBatch([photo("a.jpg")]));
    await waitFor(() => expect(result.current.tiles[0]?.status).toBe("error"));

    act(() => result.current.retry(result.current.tiles[0].id));

    await waitFor(() => expect(result.current.tiles).toHaveLength(0));
    expect(mockedUpload).toHaveBeenCalledTimes(2);
  });

  it("drops a tile on remove and frees its preview", () => {
    const { result } = setup();

    act(() => result.current.startBatch([photo("a.jpg")]));
    const tile = result.current.tiles[0];

    act(() => result.current.remove(tile.id));

    expect(result.current.tiles).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(tile.previewUrl);
  });

  it("counts files finished, then clears the counter when the batch drains", async () => {
    const { result } = setup();

    act(() => result.current.startBatch([photo("a.jpg"), photo("b.jpg")]));

    await waitFor(() => expect(result.current.tiles).toHaveLength(0));
    await waitFor(() => expect(result.current.progress).toBeNull());
  });

  it("frees previews for anything still in flight on unmount", () => {
    const { result, unmount } = setup();

    act(() => result.current.startBatch([photo("a.jpg")]));
    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });
});
