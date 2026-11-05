/** @jest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { useFileDrop } from "./use-file-drop";

/** A minimal DataTransfer stand-in: only the fields the hook reads. */
const dragEvent = (types: string[], files: File[] = []) =>
  ({
    preventDefault: jest.fn(),
    dataTransfer: { types, files, dropEffect: "" },
  }) as unknown as React.DragEvent;

const photo = (name = "cover.jpg") => new File(["x"], name, { type: "image/jpeg" });

describe("useFileDrop", () => {
  it("hands a dropped photo to onFiles and cancels the browser's own handling", () => {
    const onFiles = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFiles }));

    const file = photo();
    const drop = dragEvent(["Files"], [file]);

    act(() => result.current.dropProps.onDrop(drop));

    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("passes every photo in a multi-file drop, in order", () => {
    const onFiles = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFiles }));

    const first = photo("a.jpg");
    const second = photo("b.png");
    const third = photo("c.webp");

    act(() => result.current.dropProps.onDrop(dragEvent(["Files"], [first, second, third])));

    expect(onFiles).toHaveBeenCalledWith([first, second, third]);
  });

  it("highlights the region while files are over it", () => {
    const { result } = renderHook(() => useFileDrop({ onFiles: jest.fn() }));

    act(() => result.current.dropProps.onDragEnter(dragEvent(["Files"])));
    expect(result.current.isDragging).toBe(true);
  });

  it("ignores drags that are not files, so internal reordering still works", () => {
    const onFiles = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFiles }));
    const internal = dragEvent(["text/plain"]);

    act(() => result.current.dropProps.onDragEnter(internal));
    act(() => result.current.dropProps.onDrop(internal));

    expect(result.current.isDragging).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
    expect(internal.preventDefault).not.toHaveBeenCalled();
  });

  it("keeps the highlight steady while the pointer crosses child elements", () => {
    const { result } = renderHook(() => useFileDrop({ onFiles: jest.fn() }));

    act(() => result.current.dropProps.onDragEnter(dragEvent(["Files"])));
    act(() => result.current.dropProps.onDragEnter(dragEvent(["Files"])));
    act(() => result.current.dropProps.onDragLeave(dragEvent(["Files"])));
    expect(result.current.isDragging).toBe(true);

    act(() => result.current.dropProps.onDragLeave(dragEvent(["Files"])));
    expect(result.current.isDragging).toBe(false);
  });

  it("still blocks the browser opening the file when drops are disabled", () => {
    const onFiles = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFiles, enabled: false }));
    const drop = dragEvent(["Files"], [photo()]);

    act(() => result.current.dropProps.onDrop(drop));

    expect(onFiles).not.toHaveBeenCalled();
    expect(drop.preventDefault).toHaveBeenCalled();
  });

  it("does nothing when the drop carries no file", () => {
    const onFiles = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFiles }));

    act(() => result.current.dropProps.onDrop(dragEvent(["Files"])));

    expect(onFiles).not.toHaveBeenCalled();
  });
});
