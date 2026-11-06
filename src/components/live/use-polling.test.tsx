/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { usePolling } from "./use-polling";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  jest.useFakeTimers();
  setVisibility("visible");
});
afterEach(() => jest.useRealTimers());

const flush = () => act(async () => { await Promise.resolve(); });

describe("usePolling", () => {
  it("runs at once and then on the interval", async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    renderHook(() => usePolling(task, 1000));
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("does not poll while the tab is hidden and runs again when it returns", async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    renderHook(() => usePolling(task, 1000));
    await flush();
    setVisibility("hidden");
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(task).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("backs off after a failure", async () => {
    const task = jest.fn().mockRejectedValue(new Error("down"));
    renderHook(() => usePolling(task, 1000));
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(task).toHaveBeenCalledTimes(1); // waits 2s after one failure
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("stops when unmounted or disabled", async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => usePolling(task, 1000));
    await flush();
    unmount();
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(task).toHaveBeenCalledTimes(1);
  });
});
