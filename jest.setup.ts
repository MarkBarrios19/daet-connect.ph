import "@testing-library/jest-dom";

/**
 * jsdom has no `matchMedia`, and GSAP's ScrollTrigger (and its matchMedia
 * helper) reach for it as soon as the plugin registers. Every query answers
 * "no" so a test runs as a 1×1 desktop with motion allowed; a test that needs
 * something else — a phone width, reduced motion — overrides it locally.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
}

/**
 * jsdom ships MouseEvent and TouchEvent but no PointerEvent, so React would
 * read `event.pointerType` as null and every mouse/finger branch would look
 * the same. A minimal stand-in keeps those branches testable.
 */
if (typeof window !== "undefined" && typeof (window as unknown as { PointerEvent?: unknown }).PointerEvent !== "function") {
  class PointerEvent extends MouseEvent {
    readonly pointerType: string;
    readonly pointerId: number;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerType = params.pointerType ?? "";
      this.pointerId = params.pointerId ?? 0;
    }
  }

  Object.defineProperty(window, "PointerEvent", { configurable: true, writable: true, value: PointerEvent });
}
