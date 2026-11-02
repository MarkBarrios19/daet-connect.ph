/** @jest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { slugFromHash, usePlaceHash } from "./use-place-hash";

const SLUGS = ["calaguas", "bagasbas-beach"];

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("slugFromHash", () => {
  it("reads a place slug", () => {
    expect(slugFromHash("#place-bagasbas-beach")).toBe("bagasbas-beach");
  });

  it("ignores other hashes", () => {
    expect(slugFromHash("#pricing")).toBeNull();
    expect(slugFromHash("")).toBeNull();
  });
});

describe("usePlaceHash", () => {
  it("pushes the hash when a place opens", () => {
    const { result } = renderHook(() => usePlaceHash(SLUGS));

    act(() => result.current.open("bagasbas-beach"));

    expect(result.current.openSlug).toBe("bagasbas-beach");
    expect(window.location.hash).toBe("#place-bagasbas-beach");
  });

  it("opens a place that the URL names on mount", () => {
    window.history.replaceState(null, "", "/#place-calaguas");

    const { result } = renderHook(() => usePlaceHash(SLUGS));

    expect(result.current.openSlug).toBe("calaguas");
  });

  it("ignores a hash that names no known place", () => {
    window.history.replaceState(null, "", "/#place-atlantis");

    const { result } = renderHook(() => usePlaceHash(SLUGS));

    expect(result.current.openSlug).toBeNull();
  });

  it("closes when the hash is stripped, without adding a history entry", () => {
    const { result } = renderHook(() => usePlaceHash(SLUGS));
    act(() => result.current.open("calaguas"));
    const length = window.history.length;

    act(() => result.current.close());

    expect(result.current.openSlug).toBeNull();
    expect(window.location.hash).toBe("");
    expect(window.history.length).toBe(length);
  });

  it("closes on popstate, as the Back button would", () => {
    const { result } = renderHook(() => usePlaceHash(SLUGS));
    act(() => result.current.open("calaguas"));

    // The browser has already moved to the previous entry when this fires.
    window.history.replaceState(null, "", "/");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.openSlug).toBeNull();
  });
});
